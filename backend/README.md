# CodeVault sync backend — closed pilot

Independent Cloudflare Workers/D1 synchronization core. Do not bind this migration
or Worker to Guidy's database. The extension remains v0.3.0 with local storage;
the main branch now includes optional extension login, account consent, a durable
outbox and conflict UI. The default endpoint is deployed as an email-allowlisted closed pilot, not public registration. See [extension integration](EXTENSION.md) and [deployment](DEPLOYMENT.md).

## Checks

From the repository root (Node >=24.15 for the SQLite contract tests):

```sh
npm run typecheck:backend
npm run test:sync
```

`GET /v1/sync/records?after=<problemId>` returns one complete problem bundle per
page, with a terminal empty page. Finish pagination before planning a merge.
`PUT /v1/sync/records` accepts `{id,baseRevision,mutationId,document}`. Revision 0
creates a new record; updates use the exact cloud revision. Conflicts return 409
with the current record. Repeating the most recent identical mutation is safe;
an older replay after another write returns a conflict. Persist pending mutations
on the client before networking. Never acknowledge a local baseline on failure.

`document` contains `problems`, `solutions`, `notes` for exactly one problem, or
is `null` for permanent deletion. Trash is normal document content. Tombstones
are retained, so offline devices cannot silently resurrect deleted data. Payloads
are canonicalized and validated against the existing backup schema; AI settings
and keys are not included. Wire protocol 2 uses private R2 image references; local backups still contain full
images. Text request/document limits remain 768KiB/700KiB. Uploads are separate
and limited to 2MiB per image. See [image protocol and lifecycle](ASSETS.md).

Session ownership comes exclusively from a SHA-256 hashed, 256-bit opaque bearer
session in `sync_sessions`, with expiry. Email OTP verification creates accounts
and sessions atomically. Current/all-device logout and recently authenticated
cloud account deletion are implemented. See [authentication configuration and API](AUTH.md).
Only configured exact origins get CORS permission. Real inbox login and private D1/R2 image round trips passed in the closed pilot.

Three-way merge is pure and account-scoped. A problem bundle is the initial
conflict boundary: independent edits inside one problem may require a manual
choice. Local and cloud versions are both returned on edit/edit or delete/edit
conflicts. Missing pages, missing local records and cloud revision regression
are errors, not deletion instructions. Local permanent deletes must be explicitly
enumerated as tombstones. Persist conflict copies before presenting resolution.

## Verification and remaining rollout work

Contract tests use actual SQLite with mocked outbound mail/R2. The separate
`npm --prefix backend run test:runtime` exercises real local Workers runtime,
D1 transactions, outbound mail transport, R2 and scheduled cleanup. Closed-pilot
acceptance verified real inbox login, HTTPS D1/R2 writes, PNG integrity, idempotent
replay and stale-write rejection using only a disposable QA fixture.

Public rollout still requires native extension permission dialogs, actual alarm
and production cleanup progress, signed-distribution/multi-device HTTPS tests,
provider bounce/suppression handling, operating limits and release preparation.
Guidy's application, database, storage and credentials are not shared or modified.
