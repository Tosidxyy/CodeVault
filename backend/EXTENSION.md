# Extension integration — v0.4.0 cloud sync public beta

The settings page connects to the default public-beta HTTPS service or another
configured CodeVault backend. Login alone never uploads knowledge. The release
package is v0.4.0; Chrome Web Store distribution is submitted separately.

## User flow

1. Enter the service origin (HTTPS, no path or credentials) and email. Authorize
   only that origin using the browser permission prompt, then request a code.
2. Verify the email code. Login alone does not upload the library.
3. Read the account-binding notice and explicitly consent to merging/uploading
   the current local library. It includes retained trash and legacy notes/images,
   excludes AI configuration and API keys, and enables automatic synchronization.
4. Use Sync now or let the background check about every five minutes. Local saves
   also schedule a short retry. Browser alarms are recovery triggers rather than
   precise timers. Their existence is checked/recreated when the worker starts.
5. Review conflicts per problem. Both versions have a preview and can be exported
   in full. Choosing local queues an explicit conditional overwrite; choosing cloud
   atomically replaces local persisted content. Both versions remain in the local
   archive. Archives stop accepting resolutions at 100 entries instead of silently
   deleting old copies; export/contact support is required at that limit.

Signing out preserves local knowledge, queues, baselines and conflict archives.
It attempts server revocation; if offline, local credentials are still removed
and the interface explicitly says revocation was not confirmed. Signing into a
different account requires fresh consent before that account can receive the
shared local library. Content from a previous account remains local: switching
accounts is **not** an automatic isolated-library switch.

Settings include recent-login cloud account deletion with an explicit confirmation.
An unconfirmed response persists a deletion intent and pauses synchronization.
Retry deletion or verify that the account still exists before canceling the intent;
canceling leaves automatic synchronization off. Local knowledge and conflict
archives survive deletion/logout. Archive export remains available while logged out.

## Persistence and concurrency

- Library IndexedDB is upgraded additively from v5 to v6, adding a `sync` store.
  Existing knowledge rows and the settings database remain unchanged. Manual
  backups still select only the three knowledge stores; tokens and sync metadata
  are excluded. The new `alarms` permission is solely for background sync/retry.
- Auth credentials are stored only in extension IndexedDB, without extra at-rest
  encryption. Privileged RPC accepts only this extension's exact options URL;
  content scripts and the popup cannot read auth or operate synchronization. UI
  status never returns the token. HTTPS requests omit cookies and reject redirects.
- State is scoped by endpoint and server account ID. Explicit binding is required
  before every newly encountered account can upload. The local knowledge stores
  themselves are the durable change source before a scan creates an outbox item.
- Outbox document/base revision/mutation ID are persisted before uploads and stay
  unchanged until acknowledged or moved to a retained conflict. Replay after a
  lost acknowledgement is idempotent at the server; a newer cloud change becomes
  a conflict. Uploaded images are verified and resolved before local planning.
- Remote paging must finish without duplicates/regressions. A pass is capped at
  20,000 records and 64MiB of decoded record JSON, including images. Larger
  libraries stop with an error instead of applying incomplete downloads. This
  development pass limit may be smaller than the cloud image storage allowance.
- Download application compares the exact persisted local bundle and current
  auth token inside the same read/write transaction that replaces knowledge and
  advances the baseline. Local edits/storage failures abort both. Cross-problem
  solution-ID collisions are rejected. Local recency is retained when replacing
  an already-present problem.
- Remote note/solution revisions are fenced above local revisions, retained
  deletion fences and the local timestamp. Session revision caches are invalidated
  after replacement; stale drafts fail and can be recovered by reading the latest
  note. Deleted/empty notes retain revision fences. Old solutions and purged
  solutions record fences before removal. User data is not rewritten merely to
  match cloud counters: merge comparisons ignore local revision/timestamp fields,
  avoiding an echo loop.
- A serialized background task queue protects account changes and resolution.
  Abort attempts cannot recall an upload already received by a server. Status
  records whether a run was active when asynchronous reads began and exposes run
  completion counters, so a stale state read cannot falsely report completion.

Existing problem pages should be refreshed after sync to view remote changes.
Unsaved editor drafts are not uploaded, discarded or forcibly refreshed.

## Verification

`npm test` covers the original extension suite. `npm run test:sync` covers backend
contracts. `npm run test:cloud` builds and runs the dual-device integration test
(Node >=24.15 for SQLite). It uses two persistent Edge/Chromium profiles and the
real backend handler, cryptography and SQLite transactions via a local HTTP bridge;
email and R2 are simulated. Browser permission dialogs are stubbed in this test.

The integration covers UI login/binding, image restoration, conflict selection and
archive, exact-code preservation, stale drafts, local-write rollback, concurrent
local edits during application, lost acknowledgements, restart/replay, periodic
task recovery, privileged-RPC denial from the popup, logout and narrow layout.
It is not actual Cloudflare runtime, public DNS/TLS, real mail, native permission
dialog acceptance, periodic-alarm delivery or signed Web Store distribution QA.

A separate closed-pilot acceptance on 2026-10-31 exercised two isolated Edge
profiles against real HTTPS Workers/D1/R2 using a previously inbox-verified session
restored into both profiles. It passed exact code/PNG recovery, a CDP network
outage on the extension service-worker target, restart/retry, retained conflict
copies, real save-triggered alarm delivery, trash/permanent-delete propagation
and actual optional-host request/removal. No cloud response/fetch mocks were used.
Independent email logins, manual store permission prompts, the five-minute periodic
alarm and signed-distribution acceptance remain separate. See [deployment](DEPLOYMENT.md).

Cloud settings now share the existing bordered controls, spaced consent cards and
status panels. Desktop and 360px Chinese/English layouts, reauthentication and
delete-confirmation/cancel flows passed with no page errors; no real account was
deleted or extra email sent during visual QA.

The separate upgrade test accepts the saved v0.2.0 or v0.3.0 baseline ZIP. It
requires same extension ID and actual update event, verifies the new empty sync
store/schema v6, and compares every original knowledge/settings field before and
after update and offline restart. When the source version is not newer than the
baseline, only the isolated fixture receives a temporary incremented version.
