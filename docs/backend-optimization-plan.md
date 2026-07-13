# Backend Optimization Plan

## Objective

Reduce database round-trips, request memory, provider latency exposure, and unbounded work in the backend while preserving memory/idempotency semantics. The only intentional response-level change in this pass is that Project Memory Generate now returns `202 Accepted` after durable enqueue instead of waiting for provider work.

This plan treats performance changes as correctness-sensitive changes. Each phase must keep its invariants covered by tests before the next phase starts.

## Non-negotiable invariants

- Event batches remain atomic: a conflict rolls back the whole batch.
- Replaying an identical event remains accepted; replaying different content under the same ID remains a conflict.
- `(project_id, session_id, sequence)` remains unique, including duplicates inside one incoming batch.
- Project ownership checks cannot be weakened by batching or caching.
- Raw prompt, response, and patch encryption/storage policies remain unchanged. Derived pending-draft evidence is a bounded projection; encrypted raw events remain the source of truth.
- Memory windows must not skip or duplicate event sequences.
- Project Memory generation remains idempotent under retries and concurrent requests.
- Existing frontend response contracts remain compatible until a versioned replacement is shipped.

## Phase 0 — Baseline and guardrails

### Deliverables

- Add deterministic query-count/flush-count coverage for representative event batches.
- Capture local PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` for hot aggregate queries using synthetic data where needed.
- Add request and provider payload size instrumentation that does not log user content.
- Record before/after measurements in this document.

### Acceptance criteria

- Measurements are reproducible from a repository script or test.
- No benchmark writes persist after the run.
- Metrics contain counts, durations, and byte sizes only; no prompt/response content.

## Phase 1 — Event ingest

### 1A. Bound incoming work

- Put byte limits at the reverse proxy and ASGI boundary.
- Add schema limits for batch size, file/change counts, paths, patch text, and metadata strings.
- Keep existing prompt/response storage truncation behavior.
- Return a clear `413` for byte-limit violations and `422` for schema-limit violations.

### 1B. Remove row-by-row lookup work

- Validate duplicate event IDs and sequence tuples inside the batch in memory.
- Prefetch existing events, sessions, and projects once per batch.
- Cache ownership/session validation by unique project/session.
- Prefetch prompt search documents and project files in sets.
- Flush once per dependency boundary rather than once per event.
- Use bulk insert/upsert only where it preserves ORM relationship and conflict behavior.

### Acceptance criteria

- Lookup statement count scales with unique projects/sessions/paths, not ordinary event count.
- A same-session 100-event batch has O(1) explicit flushes and no per-event sequence `SELECT`.
- Identical replay, conflicting replay, intra-batch duplicate ID, intra-batch duplicate sequence, mixed-session, ownership, and FilesChanged behavior are covered.

## Phase 2 — Memory materialization and provider payloads

### 2A. Incremental memory windows

- Use indexed SQL aggregates for the latest materialized sequence and slice index instead of loading all historical draft artifacts.
- Fetch at most `prompt_target + 1` prompt rows for a due-window decision.
- Fetch and decrypt at most 500 event rows per materialization slice; persist
  the logical prompt-window end so oversized windows resume as contiguous
  continuation slices without dropping the long non-prompt interval.
- Reuse one event-range read for eligibility and context construction.
- Move idle-session materialization out of read endpoints.
- Push pending/review state filters into SQL and add targeted partial indexes.

### 2B. Separate stored evidence from provider input

- Keep full encrypted raw events as the source of truth.
- Store only a bounded, patch-free pending-draft evidence projection in derived artifact metadata.
- Build a provider DTO with per-field and total byte/token budgets.
- Remove duplicate prompt/response/event representations from provider requests.
- Persist payload-size metadata only, never raw provider input.

### Acceptance criteria

- Repeated polling does not mutate or rescan every historical session.
- Window generation covers each eligible sequence exactly once under retries.
- Memory Draft and Project Memory provider inputs have deterministic hard byte ceilings.
- Large prompts, responses, patches, and multi-draft batches have explicit truncation tests.

## Phase 3 — Durable background generation

- Keep batch creation/claiming in a short transaction.
- Return `202` with a batch ID before provider calls begin.
- Run chunk generation and final compilation in a separate worker process.
- Add lease heartbeat, attempt fencing, bounded concurrency, and retry scheduling.
- Store chunk-level progress so retries do not repeat successful provider calls.
- Keep the current polling endpoint compatible.

### Acceptance criteria

- The primary Project Memory Generate request does not sleep or wait on model providers.
- A worker crash can be recovered without duplicate committed artifacts.
- Lease expiry cannot allow two attempts to finalize the same batch.
- Provider timeouts/retries are shorter than the active heartbeat window.

Implementation note: successful chunk responses are checkpointed on the batch
under a key derived from immutable draft-version IDs. Missing chunks run with a
bounded default concurrency of two, while reused and newly generated results
are always flattened in snapshot order before final compilation.

Implemented limits: draft prompt `131072` bytes, derived draft evidence `98304`
bytes (minimum operational envelope `4096` bytes), and Project Memory compile
prompt `262144` bytes. Each value is configurable through the documented env
settings. Provider success bodies are read incrementally with a `1048576`-byte
default ceiling, generation requests ask for at most `8192` output tokens, and
the complete request/read/retry cycle has a monotonic `120`-second deadline.
Each event materialization slice reads at most `500` rows by default. The
`PROMPTHUB_MEMORY_SLICE_EVENT_MAX_ROWS`/`PROMTY_MEMORY_SLICE_EVENT_MAX_ROWS`
setting controls this ceiling, while persisted continuation progress provides
eventual, non-overlapping coverage for longer logical prompt windows.
Each call persists at most four slices. The worker resumes unfinished groups
in later transactions from the persisted logical-end/covered-end aggregate or
an operational marker written when the cap lands exactly on a completed
window boundary. This keeps request transactions and their in-memory artifact
lists bounded without stranding a subsequent due window.
Continuation slices carry one bounded context-only prompt anchor for semantic
continuity; the anchor is not counted in their coverage timeline or source IDs.

Each Project Memory batch claims at most 60 pending drafts in deterministic
`(created_at, id)` order; excess drafts remain pending for a later batch. Manual
Project Memory edits have a `131072`-byte UTF-8 body ceiling enforced by the
schema and service, plus a `1048576`-byte ASGI request-body ceiling before JSON
parsing. Generated Project Memory uses the same UTF-8 body ceiling.

## Phase 4 — Secondary hot paths

### Admin dashboard

- Replace individual counts with conditional aggregates.
- Replace correlated per-user/per-project subqueries with grouped CTEs.
- Count pending drafts without loading Artifact JSON/Text columns.
- Add short-lived cache only after query consolidation.

### GitHub

- Use a shared pooled HTTP client with explicit connect/read deadlines.
- Release database connections before remote calls.
- On a stale cached default branch, refresh repository metadata only after a
  `404`, retry once, and persist the new branch with a compare-and-swap update.
- Cache repository trees using branch SHA/ETag and prefer lazy directory reads
  over full recursive trees for large repositories in a later API revision.

### Lists and summaries

- Consolidate project mutation summary aggregates and avoid querying empty
  projects in the review queue.
- Paginate project lists in a later response-contract revision.
- Make expensive exact totals optional or first-page-only.
- Introduce compact list projections for events and artifacts, retaining detail endpoints for full payloads.
- Consolidate project mutation summary aggregates.

### Database/runtime

- Verify index usage with `pg_stat_user_indexes` before dropping the event payload GIN index.
- Add partial/expression indexes only with matching query evidence.
- Make pool size, overflow, timeout, recycle, and statement/lock timeouts configurable.
- Separate liveness and database-backed readiness checks.
- Size web workers and connection pools against the PostgreSQL connection budget.

## Phase 5 — Verification and rollout

- Run the complete backend and collector suites plus Ruff.
- Upgrade a clean PostgreSQL database through every migration.
- Exercise rollback for each new migration.
- Compare query count, latency, rows read, payload bytes, and memory before/after.
- Roll out schema/index changes first, then application changes, then worker activation.
- Observe error rate, ingest latency, DB pool wait, slow queries, provider latency, lease retries, and queue depth.

## Measurement log

| Area | Baseline | Target | Result |
| --- | --- | --- | --- |
| Same-session event batch lookup/flush scaling | 1 event: 14 SQL/5 flushes; 20: 128/24; 100: 609/104; 500: 3,009/504 | No per-event lookup or flush | 1: 14 SQL/2 flushes; 20: 14/2; 100: 15/2; final 500-event run: 12 SQL/2 flushes (502.995-1,433.669 ms across the last two local runs) |
| Multi-session ingest post-processing | Memory eligibility was checked once per touched session | One bulk eligibility query plus output-sensitive generation | 100 prompt-only sessions remain <= 20 statements with no generator calls; late lower-sequence prompts are included in the bulk check so an already stored response/file pair is not missed |
| Memory due-window rows/queries | Next/exact/under-target decisions: 4/4/2 queries; slice state loaded historical artifact rows; event range was unbounded | Bounded by one slice | Prompt scan and decrypted event range are each <= 500 rows; each call persists <= 4 slices; long gaps resume contiguously with crash-safe logical-end/operational markers and a context-only anchor excluded from coverage |
| Memory read index plan (10,000 rollback-only synthetic artifacts) | State aggregation read 5,000 pending rows (2.685 ms, 530 buffer hits in the final comparison) | One indexed state row | Runtime state used `ix_artifacts_memory_slice_session_end` in 0.029 ms with 3 buffer hits; generated list used `ix_artifacts_generated_memory_project_updated` in 0.026 ms |
| Provider request/evidence bytes | Unbounded pending evidence, success response, and Project Memory compile prompt | Deterministic hard ceiling | Draft prompt <= 131,072 bytes; derived evidence <= 98,304 bytes; Project Memory prompt <= 262,144 bytes; success response <= 1,048,576 bytes; output <= 8,192 requested tokens; full retry cycle <= 120 seconds |
| Provider blocking/read behavior | Per-request timeout did not enforce a total retry/read deadline | Bound every blocking read and retry | Every response read lowers the underlying HTTP/SSL socket timeout to the remaining wall deadline; no unbounded `read()` fallback, response/error prefixes are byte-capped, and metrics contain no content |
| Provider result cardinality/storage | Model-controlled semantic lists and a full generation response duplicated into every draft | Bounded normalized result without full-response duplication | Semantic lists <= 32 items; source IDs <= 128 entries of <= 200 chars; Project Memory body <= 131,072 UTF-8 bytes; edit warnings are unique and <= 32; draft metadata stores counts/reason summary only |
| Admin overview SQL statements | Approximately 32 by static inspection | Single digits plus bounded detail queries | Exactly 7 statements in PostgreSQL contract/query-count test |
| Project mutation summary SQL statements | 9 scalar/list statements | One aggregate statement | 1 statement |
| Review queue summary/range reads | Two project-summary aggregates plus one range query for every project | One summary read and only pending projects queried | 1 summary aggregate plus one bounded range query per project with pending work |
| GitHub remote calls per tree/file read | 2 sequential calls, no shared pool | 1 metadata-cache hit plus content/tree call | 1 steady-state call through a shared pool; DB transaction released first; stale branch recovery only on 404 |
| Project Memory generation request | Provider work ran in the web request and one batch could claim every pending draft | Durable enqueue and bounded worker execution | `202` enqueue; separate worker, lease heartbeat/fencing, concurrency 2, durable per-chunk retry checkpoints; <= 60 drafts per batch with overflow left pending |
| Project Memory version/future fan-out | Latest-version selection loaded all version history; all missing chunk futures could be submitted before a failure | One latest row per draft and concurrency-window submission | PostgreSQL `DISTINCT ON` returns one latest `ArtifactVersion` per claimed draft; at most 2 provider futures are in flight by default and a first failure submits no further work |
| Memory generation failure recovery | A caught job failure could commit a cleared resume marker and partial slice | Preserve job outcome but roll back memory mutations | Generation runs inside a nested savepoint; PostgreSQL regression coverage restores the marker, removes the partial row, and retains the failed job state |
| Manual Project Memory edit | Unbounded request and persisted body | Reject or normalize before allocation/version writes | Request <= 1,048,576 bytes at ASGI boundary; body <= 131,072 UTF-8 bytes at schema and service boundaries |

## Verification log

- `benchmark_event_ingest.py` and `benchmark_memory_reads.py` are rollback-only.
- The memory benchmark uses transaction-local `enable_seqscan=off` and
  `enable_sort=off` so its rollback-only, unanalyzed synthetic rows demonstrate
  exact partial-index predicate/order compatibility without persisting
  misleading table statistics.
- Alembic `0024_memory_chunk_progress` was upgraded, downgraded to
  `0023_memory_read_indexes`, and upgraded to head again on PostgreSQL.
- `alembic check` reports no drift for the new `0022`-`0024` indexes/column. It
  still reports older repository-wide metadata drift for legacy
  `published_prompt*`, `published_flow*`, and pre-existing index definitions;
  that drift predates this optimization pass and was not auto-generated into a
  destructive migration.
- PostgreSQL-enabled backend suite: `197 passed`.
- Collector suite: `39 passed`; backend Ruff, Python compilation, Compose
  rendering, EC2 bootstrap shell syntax, and `git diff --check` all passed.
- Final new-limit regression set: `78 passed`, covering event/body limits,
  bounded memory windows, batch claim/future caps, manual body limits, streamed
  provider body/deadline limits, semantic cleaning, safe provider metrics, and
  compact generation metadata.
- The 10,000-row memory read benchmark rolled back all synthetic users,
  projects, sessions, and artifacts.

## Explicit follow-ups

These are intentionally not hidden inside the completed measurements:

- Materialized slice coverage is monotonic. A missing event that arrives later
  with `sequence <= covered_end_sequence` is retained in the raw event store but
  does not retroactively rebuild an already consumed memory slice. Define and
  enforce a collector ordering contract, or add explicit slice invalidation and
  downstream memory regeneration before supporting arbitrary gap filling.
- `POST /api/projects/{project_id}/memory/project/compile` is a legacy direct
  compilation endpoint. Its DB transaction is released before provider work
  and its prompt is now bounded, but the HTTP request still waits for the
  provider. Move it to a dedicated durable compile job if this endpoint is
  used by the product UI.
- GitHub tree reads still use GitHub's recursive tree endpoint. Introduce
  directory-level pagination plus SHA/ETag caching before supporting very large
  monorepositories through this browser.
- The top-level project list remains unpaginated to preserve its existing
  response contract. Add cursor pagination together with the frontend contract
  change rather than silently truncating results.
- Reconcile the pre-existing Alembic/model metadata drift before making
  `alembic check` a blocking CI step. In particular, decide whether legacy
  `published_prompt*` tables remain supported before generating any drop-table
  migration.
- Manual Project Memory edits are now bounded per request, but edited artifact
  versions remain intentionally durable. Define tenant storage quotas,
  rate-limits, and a version-retention policy before exposing high-volume edit
  automation.
