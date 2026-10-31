# Independent CodeVault authentication (closed pilot)

This backend implements its own email OTP/opaque-session layer matching the sync
protocol. It does **not** share Guidy Better Auth accounts, cookies, tokens,
secrets, users or database. No extension login UI is connected yet. Do not treat
these local tests as production sign-in or inbox-delivery acceptance.

Apply `0001_sync.sql`, then additive migration `0002_auth.sql` to an independent
CodeVault D1 only. Existing foundation test sessions without an `auth_users` row
are intentionally not accepted as real accounts. Existing sync documents are not
rewritten by this migration.

## Configuration

Set `AUTH_ENABLED=true`, an independent random `AUTH_SECRET` of at least 32
characters, a restricted `RESEND_API_KEY`, and a verified sender's bare email in
`EMAIL_FROM`. `.dev.vars.example` contains names only; never commit actual values.
The sender must be lowercase and must not contain a display name. CodeVault adds
its own display name. Do not copy Guidy's auth secret or introduce a test OTP
bypass. The secret peppers OTP hashes and rate-limit identifiers; rotating it
invalidates outstanding codes. Sessions use random 256-bit bearer tokens and
store only SHA-256 hashes. There is no cookie session or refresh token.

`AUTH_ENABLED=false` disables code issuance/verification. It does not revoke
already issued sessions: use logout-all or expire/revoke them separately.
Configure `ALLOWED_ORIGINS` with exact extension origins (no wildcard). Run behind
Cloudflare so `CF-Connecting-IP` is platform-supplied; never trust a client-set
proxy header in a standalone public server. Missing IPs share one limited bucket.
Use the primary D1 database; read-replica session consistency is not configured.

## API

| Method / route | Request | Result |
| --- | --- | --- |
| POST `/v1/auth/request-code` | `{email,locale?:"zh"\|"en"}` | 202 `{challengeId,expiresIn,retryAfter}` |
| POST `/v1/auth/verify-code` | `{email,challengeId,code}` | `{token,user:{id,email},expiresAt}` |
| GET `/v1/auth/session` | Bearer token | Own identity/expiry; never echoes token |
| POST `/v1/auth/logout` | Bearer token | Revoke current session |
| POST `/v1/auth/logout-all` | Bearer token | Revoke all sessions for this account |
| DELETE `/v1/auth/account` | Bearer token + `{confirmation:"DELETE"}` | Remove own cloud account/data/sessions/pending codes |

No request can select an owner via a supplied user ID. All responses are
`Cache-Control: no-store`. Code/session requests require JSON, no more than 4KiB.
Account deletion requires a session issued within the last 10 minutes, and a
separate confirmation. Reauthenticate by requesting a new code if needed.
Deletion is one transaction and clears cloud data only, not the extension's local
library or exported backup files. Re-registering the same email creates a new
account ID; clients must explicitly rebind before uploading old local content.

## OTP and delivery

- Six uniformly random digits, 5 minutes, 3 verification attempts per challenge.
- HMAC-SHA256 verifier bound to normalized email, challenge ID and code. No raw
  codes in the database, logs or API responses. Email normalization is trim +
  lowercase ASCII; no provider-specific dot/plus rewriting.
- One pending challenge per email. Resending replaces the old challenge. The
  rolling 60-second cooldown survives successful verification and logout.
- Limits: 3 send requests per email/hour, 20 per IP/hour, 300 globally/day and
  60 authentication attempts per IP/hour. Hour/day limits use fixed windows.
  Rejected cooldown/delivery attempts may consume quotas conservatively.
- Codes become usable only after the email provider accepts the request. Provider
  failure or interrupted activation leaves them unusable. Provider acceptance is
  not proof of inbox delivery. Never return upstream errors or credentials.
- A fixed Resend endpoint, 10-second timeout, no redirects and a unique
  `Idempotency-Key` per challenge. No automatic send retries in this version.
  Resend supports this header for duplicate-send protection:
  https://resend.com/changelog/idempotency-keys .
- Text-only Chinese/English messages identify CodeVault, state the expiry and tell
  recipients to ignore an unrequested email. There is no marketing subscription.

## Atomicity and retention

Verification consumes a challenge and creates the user/session in one D1 batch.
Each dependent write is gated on the newly generated consumption nonce. A
zero-change update cannot authorize later writes. Any SQL failure rolls the whole
batch back. Concurrent verification succeeds once. Sessions expire after 30 days;
logout immediately removes the relevant hashes. Synchronization writes recheck
the live session within their conditional SQL statement, so logout/deletion
between the initial auth check and the write cannot recreate data.

`scheduled()` deletes expired sessions, challenges and rate buckets; deployment
must configure an hourly Cron Trigger. Code requests also clean expired records.
Rate identifiers are keyed hashes, not raw email/IP, and expire by the end of the
associated window (at most one day), then are removed at the next cleanup. Quotas
are not reset by deleting an account. Migration 0003 adds durable image cleanup: account deletion queues its R2 objects
in the same transaction and returns attachmentCleanup: "queued". Physical deletion
is retried by scheduled cleanup; see ASSETS.md.

Contract tests mock outbound mail and exercise real cryptography/SQLite. The
separate local Workers runtime test covers the actual outbound-fetch code path;
manual redirect mode rejects non-success responses without following redirects.
Real inbox login has passed in the closed pilot. `AUTH_ALLOWED_EMAILS` is a JSON
array of 1–5 invited addresses; malformed configuration fails closed. Leaving it
unset permits general email registration, so pilot deployment guards require it.
Provider bounce/suppression operations remain required before public rollout.
