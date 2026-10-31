# Private image storage (development, not deployed)

Apply migrations 0001–0003 to the **independent CodeVault D1**. Bind a dedicated
private R2 bucket as `ASSETS`. Do not share Guidy's database or bucket. Do not
enable R2 public access or public custom-domain image URLs. Missing binding fails
image operations closed; text-only synchronization remains available.

## Wire protocol 2

Record responses now identify `protocol: 2`. Images in the wire document use
`codevault-asset:<sha256>` rather than base64. Inline images are rejected at the
cloud record boundary. The extension's local schema and backup format do not
change: they still contain full PNG data URLs.

`toWireDocument` validates a local problem bundle, extracts and deduplicates PNG
bytes (including legacy backups), and returns the wire document and upload map.
Upload all assets before committing the document. `fromWireDocument` downloads
each distinct hash, verifies size, structural PNG validity and SHA-256 integrity,
then validates actual image byte totals against the existing local schema. Do
not run the local merge planner on unresolved wire documents. Failed/missing
downloads are errors, never an instruction to remove local images or notes.

## Authenticated API

- `PUT /v1/sync/assets/<64 lowercase hex SHA-256>`: raw PNG body, Content-Type
  `image/png`, maximum 2MiB. Returns `{hash,bytes}`. Hash, signature, chunks, CRC,
  IHDR dimensions and ending are checked. Animated PNG is rejected. Dimensions
  are limited to 8192 per axis and 16,777,216 pixels. This is structural validation,
  not full PNG pixel decoding or an antivirus scan.
- `GET` on that path: owner's PNG only; fixed MIME, nosniff, private/no-store and
  restrictive CSP. Missing cloud bytes with known metadata return 503, not a
  pretend deletion. A repeat upload verifies existing bytes and repairs a missing
  or damaged object using the same validated content.
- `DELETE` on that path: 202 queues cleanup only if no committed document uses the
  image; referenced images return 409. Removing images from notes normally uses
  document synchronization, not this explicit orphan-discard endpoint.

Ownership always comes from the validated session. Equal content in two accounts
has separate storage objects. Object keys contain a hashed account namespace and
random generation ID; callers cannot select or traverse a bucket key. Assets are
immutable by content; repairs write identical verified bytes. Each account may
reserve at most 100MiB / 1,000 objects. Pending/deleting objects count until cleanup
finishes. Limits are provisional for development, not a published storage plan.
An interrupted pending upload may need the scheduled cleanup before retrying.

Wire document text remains limited to 700KiB (request 768KiB), independently of
image uploads. Current and legacy note groups each retain the existing 5-image /
6MiB limits; repeated image slots count toward their group's byte total.

## References and cleanup

Document CAS and image-reference replacement are one D1 batch. Readiness is
rechecked by exact immutable object key inside CAS. Dependent writes are gated on
the committed mutation ID, revision **and canonical document**, so changing the
payload of an old mutation cannot remove live image references on a 409 response.
SQL failure rolls document and reference changes back together.

`asset_objects` is a durable journal, created before external storage writes:

- `pending`: upload in progress. Publication rechecks the live session and state.
- `ready`: usable by owner documents; references prevent collection.
- `deleting`: permanently fenced from new document references; deletion retries
  are durable and generations never reuse these keys.

Trash retains references. Removing a document/image refreshes the last-reference
timestamp, then unused ready objects have a 24-hour grace period. Pending uploads
expire after 15 minutes. Account deletion atomically clears references and queues
all its objects for physical deletion, returning `attachmentCleanup: "queued"`;
it does not claim that external deletion completed synchronously. R2 failures
leave journal rows for retry. Local knowledge and exported backups are untouched.

Each scheduled cleanup processes at most 10 deletion rows and scans at most 10
R2 objects under `v1/`, persisting a reconciliation cursor. Untracked orphan bytes
are removed even if a late external write arrived after its journal was cleaned.
The dedicated bucket requirement is essential: untracked objects under this
namespace are treated as garbage. Physical cleanup is eventual and depends on
Cron frequency, queue depth and successful storage calls; no deadline is promised.
Production rollout must configure recurring cleanup and verify actual platform
limits/latency, quotas and deletion progress.

Tests use actual SQLite transactions and repository PNGs with a memory R2 double.
They cover integrity, isolation, shared references, rollback, conflicting replay,
GC/publication races, late writes, cursor continuation, quotas, revocation and
account deletion retries. They do not verify actual Workers/R2/D1 runtime behavior,
real cloud resources or an extension UI. No production bucket was created.
