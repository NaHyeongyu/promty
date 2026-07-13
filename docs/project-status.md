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
collector init/login
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
~/.prompthub/events/<project_id>/<session_id>/events.jsonl
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

Validation status:

```text
codex-cli   validated with the repo-local Codex hooks
claude-code adapter and repo-local hook installer exist, real payload validation pending
cursor      adapter exists, hook installation and real payload validation pending
gemini-cli  adapter exists, hook installation and real payload validation pending
```

Payloads are typed. The backend does not parse raw Codex, Claude Code, Cursor, or Gemini payloads.

### Collector

Implemented commands:

```bash
python3 collector/src/cli.py init
python3 collector/src/cli.py login
python3 collector/src/cli.py install-hooks --tool codex-cli
python3 collector/src/cli.py install-hooks --tool claude-code
python3 collector/src/cli.py capture --tool codex-cli
python3 collector/src/cli.py capture --tool claude-code
python3 collector/src/cli.py capture-changes --tool codex-cli
python3 collector/src/cli.py capture-changes --tool claude-code
python3 collector/src/cli.py capture-raw --output docs/real-codex-payload.json
python3 collector/src/cli.py upload --api-url http://127.0.0.1:8011
python3 collector/src/cli.py upload --api-url http://127.0.0.1:8011 --watch --interval 2
python3 collector/src/cli.py start-uploader
python3 collector/src/cli.py doctor
python3 collector/src/cli.py doctor --tool claude-code
```

Collector responsibilities currently implemented:

```text
read hook JSON from stdin
normalize tool-specific payloads into PromptHub Events
assign per-session sequence numbers
detect projects from cwd, preferring the enclosing git root
remember tool session ids for later events without cwd
store git baselines when prompts are submitted
emit FilesChanged events from Stop hooks when git changes are detected
persist events to a local JSONL queue
upload queued events outside the hook path
ack uploaded events from the queue
retry uploads in watch mode without blocking hooks
open PromptHub login from the terminal
store local API URL/token config at ~/.prompthub/config.json
install or repair repo-local Codex and Claude Code hooks
start the uploader as a background process
diagnose login, hooks, queue, backend, and uploader status
```

Default local files:

```text
~/.prompthub/config.json
~/.prompthub/events/<project_id>/<session_id>/events.jsonl
~/.prompthub/sequences.json
~/.prompthub/session-index.json
~/.prompthub/change-baselines.json
~/.prompthub/uploader.pid
~/.prompthub/uploader.log
```

The session index lets later events that only include a tool session id reuse the already detected PromptHub project and session.

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

The current project Stop hook captures code changes:

```bash
python3 "$(git rev-parse --show-toplevel)/collector/src/cli.py" capture-changes --tool codex-cli
```

### Backend

FastAPI endpoints:

```text
GET  /api/auth/github/start
GET  /api/auth/github/web/start
GET  /api/auth/github/callback
GET  /api/auth/me
POST /api/auth/logout
GET  /api/projects
POST /api/events/batch
GET  /api/events
GET  /health
GET  /health/live
GET  /health/ready
```

The backend validates PromptHub Event v1 models and persists events to PostgreSQL.

Current ingest behavior:

```text
creates a deterministic system user when needed
creates a placeholder project when project_id is new
creates a session when session_id is new
inserts new events and treats exact event-id replays as idempotent no-ops
stores payloads as PostgreSQL JSONB
stores project git_remote/github_url metadata when collector payloads include it
requires Bearer auth by default
accepts per-user collector tokens issued through GitHub OAuth
optionally accepts a global PROMPTHUB_API_TOKEN
issues HttpOnly JWT session cookies for web users
requires web JWT auth for GET /api/events
filters event reads by the authenticated project owner
rejects empty batches and batches larger than 500 events
accepts exact event-id replays as idempotent no-ops
rejects event-id replays with changed content
rejects project/session mismatches
rejects duplicate sequences within a project/session
```

### PostgreSQL Persistence

Implemented tables:

```text
users
devices
collector_tokens
projects
sessions
events
artifacts
```

Alembic migration:

```text
0001_initial_schema
0002_event_security_indexes
0003_collector_tokens
```

Current DB hardening:

```text
unique(project_id, session_id, sequence)
check constraints for event sequence, schema_version, tool, and event_type
check constraint for session ended_at >= started_at
indexes for latest, event_type, session, and project/session timeline queries
GIN index on events.payload for future JSONB filtering
hashed per-user collector tokens for CLI upload auth
```

Database docs:

```text
docs/database.md
```

### Frontend App

The current frontend is a React/Vite app with a project dashboard and CLI login entrypoint:

```text
frontend/src/App.tsx
frontend/src/App.css
frontend/src/tokens.css
```

Current behavior:

```text
renders project cards with latest update and connected model depth
fetches current user from /api/auth/me with credentials included
fetches project metadata from /api/projects with credentials included
fetches recent events from /api/events with credentials included
groups real API events into project cards
renders GitHub repository links when a project has a GitHub origin remote
shows GitHub login when the JWT session cookie is missing or expired
opens project detail with overview/folder/introduce tabs
keeps profile/settings navigation shells
renders /cli/login as the terminal-initiated GitHub login screen
links /cli/login to /api/auth/github/start with CLI state and callback URI
links web login to /api/auth/github/web/start
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

Start the Project Memory worker in another terminal:

```bash
cd backend
../.venv/bin/python -m app.workers.project_memory
```

Start frontend:

```bash
cd frontend
npm run dev -- --port 5173
```

Start near-real-time uploader:

```bash
./.venv/bin/python collector/src/cli.py upload \
  --api-url http://127.0.0.1:8011 \
  --watch \
  --interval 2
```

Run the one-command local setup flow:

```bash
./.venv/bin/python collector/src/cli.py init \
  --app-url http://127.0.0.1:5173 \
  --api-url http://127.0.0.1:8011
```

Open:

```text
http://127.0.0.1:5173
http://127.0.0.1:5173/cli/login
```

## Verification Commands

Check backend:

```bash
curl -sS http://127.0.0.1:8011/health/ready
curl -sS -i 'http://127.0.0.1:8011/api/auth/github/start?redirect_uri=http%3A%2F%2F127.0.0.1%3A54321%2Fcallback&state=abc'
curl -sS -i 'http://127.0.0.1:8011/api/auth/github/web/start?return_to=http%3A%2F%2F127.0.0.1%3A5173%2F'
curl -sS 'http://127.0.0.1:8011/api/events?limit=5'
curl -sS 'http://127.0.0.1:8011/api/events?event_type=FilesChanged&limit=5'
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
find ~/.prompthub/events -name events.jsonl -print
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

Event storage uses inserts for new events. Re-uploading the same event id is idempotent only when the replayed event content is identical; changed content is rejected.

## Known Boundaries

Not implemented yet:

```text
published npm registry release
device registration
production routing/auth shell
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
frontend still uses polling rather than server-pushed updates
npm publish for promty-collector is pending npm OTP or recovery code
```

## Next Recommended Milestones

1. Publish and validate the collector flow with `npx promty-collector init`.
2. Add event ownership checks after project/device registration lands.
3. Validate Claude Code hooks end-to-end.
4. Add backend tests around OAuth token issuance, ingest auth, and idempotency.
5. Reconnect the frontend to live event data with latest/session views.
