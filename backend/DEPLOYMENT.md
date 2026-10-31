# Closed-pilot deployment

The default `https://codevault-api.guidy.fun` endpoint is a restricted development
pilot. It is not public registration or a v0.4 Web Store release. Independent
resources are `codevault-api-development` (Worker), `codevault-development` (D1)
and `codevault-assets-development` (private R2). Never bind Guidy's resources.

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
These are deployment inputs, not public configuration or credentials.

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
was removed. Remaining release gates include actual multi-device HTTPS extension
flows, native permissions, alarm delivery, scheduled cloud deletion progress,
email bounce/suppression operations, operating limits and store release metadata.
