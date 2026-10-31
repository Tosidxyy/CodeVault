# CodeVault cloud deployment

The default `https://codevault-api.guidy.fun` endpoint accepts public-beta email
login for v0.4.0. Independent resources remain `codevault-api-development` (Worker),
`codevault-development` (D1) and `codevault-assets-development` (private R2).
The resource names are historical; never bind Guidy's database or bucket.

## Local checks

Use Node >=24.15 and install the backend's pinned toolchain separately:

```sh
npm ci
npm --prefix backend ci
npm run typecheck:backend
npm run test:sync
npm --prefix backend run test:runtime
npm --prefix backend run build
npm run test:cloud
```

The runtime test uses disposable local D1/R2 and simulated mail delivery; it sends
no real email. The browser integration uses isolated profiles and a local HTTP
bridge. Native permission prompts and signed store distribution need separate QA.

## Isolated cloud setup

Authenticate Wrangler to the intended Cloudflare account and enable R2. Create
ignored `backend/.cloud-target.json` with `accountId`, `origins` (exact
`chrome-extension://<id>` strings) and `testEmails` (1–5 invited addresses).
These are deployment inputs, not public configuration or credentials. Omitted `registration` defaults to invite-only. Explicit `registration: "public-beta"` allows a generated config without `AUTH_ALLOWED_EMAILS`. Test addresses are retained only for operator QA.

```sh
npm --prefix backend run cloud:prepare
npm --prefix backend run cloud:build
npm --prefix backend run cloud:migrate
```

Preparation creates only the fixed CodeVault resources and generates ignored
`backend/wrangler.cloud.json`. Existing D1 name/ID and allowed origins are checked
before remote mutations. Login initially stays disabled. R2 must retain disabled
public development URLs and no public custom domains. The Worker owns the API
custom domain; it does not expose the bucket directly.

Provision a new independent Resend sending-only key restricted to the verified
sending domain. Do not copy another application's credentials. Run
`node backend/scripts/set-secrets.mjs` and provide one JSON line with
`RESEND_API_KEY`; input is hidden in an interactive terminal. The helper generates
an independent authentication secret and writes ignored `.cloud-secrets.json`.
Never regenerate that secret during ordinary deployment: it affects auth hashes.

```sh
npm --prefix backend run cloud:secrets
npm --prefix backend run cloud:deploy
```

Run `npm --prefix backend run cloud:check` after deployment. This read-only check
verifies HTTPS health, anonymous access denial, exact allowed-origin preflight,
foreign-origin rejection and disabled public R2 URLs/custom domains. It reports
the deletion backlog and whether scheduled reconciliation has written its cursor,
without reading library bodies or printing email/session credentials. If local
ignored QA fixture metadata is available, it also reports remaining image journal
rows for those exact fixtures. A cursor is evidence of a cleanup invocation, not
a timestamp or a guarantee that the latest scheduled invocation succeeded.
Deployment guards reject missing or changed 15-minute cleanup schedules.

After verifying the sender, secrets, exact origins and invited addresses, set
`AUTH_ENABLED` to `"true"` in the ignored generated config and redeploy. Retain
`AUTH_ALLOWED_EMAILS`: removing it allows general registration. To close pilot
login, set `AUTH_ENABLED` back to `"false"` and redeploy. This blocks new login;
it does not revoke previously issued sessions. Revoke sessions explicitly if
closing authenticated access is also required. Never delete D1/R2 as a rollback.

The configured Cron runs every 15 minutes. Verify its execution and deletion
backlog before public rollout. Unreferenced images have a 24-hour grace period;
account deletion queues images without claiming immediate physical erasure.

## Real pilot acceptance

`node --experimental-strip-types backend/scripts/pilot.mjs request-code` sends
one real login email to the first invited test address. Verify with `verify`,
passing a JSON line containing `code` through hidden stdin within five minutes.
`smoke` exercises HTTPS session ownership, D1 revision writes, private R2 PNG
integrity, idempotent retries and stale-write rejection. It creates only the
reserved demonstration problem, never reads/uploads the local extension library.
`cleanup` removes that exact fixture and queues its unshared image for cleanup;
it keeps the account and all other records. Challenge/session/fixture files are
ignored and contain sensitive data: never attach, commit or print them.

Real inbox login and the above API/image checks passed on 2026-10-31. The fixture
was removed. Subsequent acceptance used two isolated Edge profiles with the actual
extension background code and HTTPS service, restoring the previously verified
session into both profiles. It did not test two independent email logins.

The real cloud run passed exact code/PNG restoration, background-target network
outage and browser-restart recovery, retained conflict copies, a real save-triggered
alarm (without synthesized alarm events), trash/deletion propagation and real
optional-host permission request/removal. Worker fetch and cloud responses were
not mocked. Native permission APIs ran in automated Edge; this is not a manual
Chrome Web Store prompt acceptance test. The five-minute periodic alarm interval
and signed store update flow still need independent acceptance.

Read-only inspection confirmed scheduled reconciliation had run and the earlier
API fixture's image journal row had been reclaimed. New test images were queued
through the normal API; queue depth may remain nonzero until a later Cron run.
After the next scheduled window, the check returned zero queued image deletions
and zero retained image rows for both recorded API and live-extension QA fixtures.
This does not promise a deletion deadline. Remaining release gates include
provider bounce/suppression operations, operational limits, independent-device
logins, native store prompts and store release metadata.


## Public beta and rollback

Public registration is an explicit deployment choice. In the ignored target set
`registration` to `"public-beta"`; in the ignored generated config remove
`AUTH_ALLOWED_EMAILS`, retain `AUTH_ENABLED: "true"`, exact extension origins,
private R2 and the recurring Cron. Update both inputs together: guards reject an
accidental allowlist removal under invite-only mode. Build, deploy, then run
`cloud:check`; `/health` must report `registration: "public-beta"` and version
`0.4.0`. No database reset, session rotation or resource replacement is needed.
To return to invite-only, restore that mode and the exact target test-email JSON
allowlist together, then deploy. To stop new login entirely, disable auth. These
controls do not revoke existing sessions; logout-all/account removal are separate.

Initial image limits remain 100MiB/1,000 objects per account, 2MiB per image;
new objects and cleanup-pending objects count toward quotas. A sync pass is
bounded to 64MiB/20,000 records. OTP limits remain one request per 60 seconds,
three per address per hour, twenty per IP per hour and 300 globally per day;
provider quotas may be lower. Preserve local backups and show errors on limits.

Resend automatically suppresses hard bounces and spam complaints, as documented
at https://resend.com/changelog/suppression-list-support . Monitor CodeVault's
sending-domain delivery/suppression events and Cloudflare usage/cleanup counts
in the provider dashboards. The extension only sends transactional codes on user
request; it does not send marketing or automatically clear suppressions. Sending
acceptance is not proof of delivery. No provider-wide suppression changes or
custom webhook subscription are installed by this release. If capacity or abuse
requires a pause, disable new login rather than deleting user data.

Submit the extension ZIP to the existing store item so its extension ID stays in
the exact CORS allowlist. A new store listing would require its own explicit origin.
