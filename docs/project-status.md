# PromptHub Project Status

Snapshot date: 2026-06-27

This document summarizes the current implementation state after the initial collector, backend, database, and timeline preview work.

## Current Goal

PromptHub records AI development events from local tools and renders them as a timeline.

The current validated path is:

```text
Codex CLI
|
v
UserPromptSubmit hook
|
v
collector capture
|
v
PromptHub Event v1
|
v
~/.prompthub/events.jsonl
|
v
collector upload --watch
|
v
FastAPI
|
v
PostgreSQL
|
v
Timeline preview
```

## Implemented

### Repository Structure

```text
frontend/
backend/
collector/
docs/
docker/
docker-compose.yml
README.md
.github/
```

### Event Architecture

PromptHub Event v1 is the boundary between collector and backend.

Base fields:

```text
id
schema_version
project_id
session_id
sequence
tool
event_type
timestamp
payload
```

Supported event types:

```text
SessionStarted
PromptSubmitted
ResponseReceived
FilesChanged
CommitCreated
SessionEnded
```

Supported tools:

```text
claude-code
codex-cli
cursor
gemini-cli
```

Payloads are typed. The backend does not parse raw Codex, Claude Code, Cursor, or Gemini payloads.

### Collector

Implemented commands:

```bash
python3 collector/src/cli.py capture --tool codex-cli
python3 collector/src/cli.py capture-raw --output docs/real-codex-payload.json
python3 collector/src/cli.py upload --api-url http://127.0.0.1:8011
python3 collector/src/cli.py upload --api-url http://127.0.0.1:8011 --watch --interval 2
```

Collector responsibilities currently implemented:

```text
read hook JSON from stdin
normalize tool-specific payloads into PromptHub Events
assign per-session sequence numbers
persist events to a local JSONL queue
upload queued events outside the hook path
ack uploaded events from the queue
retry uploads in watch mode without blocking hooks
```

Default local files:

```text
~/.prompthub/events.jsonl
~/.prompthub/sequences.json
```

### Codex Hook Validation

Real Codex `UserPromptSubmit` hook payload capture is documented in:

```text
docs/real-codex-payload.json
docs/codex-hook-verification.md
```

Observed Codex fields:

```text
cwd
hook_event_name
model
permission_mode
prompt
session_id
transcript_path
turn_id
```

The current project hook captures normalized prompt events:

```bash
python3 "$(git rev-parse --show-toplevel)/collector/src/cli.py" capture --tool codex-cli
```

### Backend

FastAPI endpoints:

```text
POST /api/events/batch
GET  /api/events
GET  /health
```

The backend validates PromptHub Event v1 models and persists events to PostgreSQL.

Current ingest behavior:

```text
creates a deterministic system user when needed
creates a placeholder project when project_id is new
creates a session when session_id is new
inserts or updates events by event id for idempotent uploads
stores payloads as PostgreSQL JSONB
```

### PostgreSQL Persistence

Implemented tables:

```text
users
devices
projects
sessions
events
artifacts
```

Alembic migration:

```text
0001_initial_schema
```

Database docs:

```text
docs/database.md
```

### Frontend Timeline Preview

The current frontend is a lightweight static timeline preview in:

```text
frontend/index.html
```

Current behavior:

```text
fetches events from http://127.0.0.1:8011/api/events
sorts by session_id and sequence
renders prompt, session, project, model, cwd, and transcript metadata
auto-refreshes every 2 seconds
keeps a manual Refresh button
```

## Local Runbook

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Run migrations:

```bash
./.venv/bin/alembic -c backend/alembic.ini upgrade head
```

Start backend:

```bash
cd backend
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8011
```

Start frontend preview:

```bash
cd frontend
python3 -m http.server 5173 --bind 127.0.0.1
```

Start near-real-time uploader:

```bash
./.venv/bin/python collector/src/cli.py upload \
  --api-url http://127.0.0.1:8011 \
  --watch \
  --interval 2
```

Open:

```text
http://127.0.0.1:5173
```

## Verification Commands

Check backend:

```bash
curl -sS http://127.0.0.1:8011/health
curl -sS http://127.0.0.1:8011/api/events
```

Check database migration:

```bash
docker compose exec -T postgres psql -U prompthub -d prompthub -c "select version_num from alembic_version;"
```

Check event count:

```bash
docker compose exec -T postgres psql -U prompthub -d prompthub -c "select count(*) from events;"
```

Check local queue:

```bash
wc -l ~/.prompthub/events.jsonl
```

Compile Python code:

```bash
./.venv/bin/python -m compileall collector/src backend/app
```

## Current Runtime Behavior

Hook capture intentionally does not upload directly to the backend.

This is deliberate:

```text
hook path stays fast
AI tool prompt submission is not blocked by network or backend failures
events remain durable while offline
background uploader handles retries
frontend still feels near-real-time through polling
```

Event storage uses inserts for new events. Re-uploading the same event id is idempotent and updates the existing row instead of creating a duplicate.

## Known Boundaries

Not implemented yet:

```text
authentication
real user ownership
device registration
production React app
SSE or WebSocket updates
Claude Code end-to-end validation
Cursor and Gemini validation
artifact upload/storage
test suite
```

Temporary behavior:

```text
backend creates a system user for ingested events
device_id remains null
frontend is a static preview, not the final React app
```

## Next Recommended Milestones

1. Add a small process manager script for local dev.
2. Validate Claude Code hooks end-to-end.
3. Add backend tests around event ingestion and idempotency.
4. Replace the static frontend preview with the React app shell.
5. Add device registration before multi-machine sync.
