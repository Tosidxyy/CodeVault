# CodeVault sync backend — foundation, not deployed

Independent Cloudflare Workers/D1 synchronization core. Do not bind this migration
or Worker to Guidy's database. The extension remains v0.3.0 with local storage;
there is currently no public login or extension synchronization interface.

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
and keys are not included. Maximum request 768KiB and document 700KiB: larger
attachments require the future R2 storage phase; no silent image truncation.

Session ownership comes exclusively from a SHA-256 hashed, 256-bit opaque bearer
session in `sync_sessions`, with expiry. No login/issuance route is provided yet;
tests provision synthetic sessions only. Do not create user sessions manually for
production. OTP delivery/limits, revocation and account deletion must be completed
before public deployment. Only configured exact origins get CORS permission.

Three-way merge is pure and account-scoped. A problem bundle is the initial
conflict boundary: independent edits inside one problem may require a manual
choice. Local and cloud versions are both returned on edit/edit or delete/edit
conflicts. Missing pages, missing local records and cloud revision regression
are errors, not deletion instructions. Local permanent deletes must be explicitly
enumerated as tombstones. Persist conflict copies before presenting resolution.

## Remaining before public use

- Email OTP login, abuse limits, hashed sessions, logout and deletion lifecycle.
- Isolated Worker/D1 configuration and migrations, domain, email sender/secrets.
- R2 images with ownership checks, retry and cleanup lifecycle.
- Extension account binding/consent, persistent outbox, atomic remote application
  with local revision fencing, alarms/retries and conflict resolution UI.
- Local Worker runtime and full multi-device/offline/crash integration checks.
- Privacy policy, retention/limits, production deployment and real email tests.

SQLite tests verify SQL behavior through a D1-shaped adapter, not a deployed D1
or Workers runtime. No real email, Guidy resources, credentials or user data are
read or modified by these tests.
