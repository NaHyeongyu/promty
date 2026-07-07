# PromptHub Database

PromptHub uses PostgreSQL with SQLAlchemy 2.x models and Alembic migrations.

## Stack

```text
PostgreSQL
SQLAlchemy 2.x
Alembic
UUID primary keys
JSONB event payloads
timezone-aware UTC timestamps
```

## Initialization

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Install backend dependencies:

```bash
./.venv/bin/python -m pip install -r backend/requirements.txt
```

Run migrations:

```bash
./.venv/bin/alembic -c backend/alembic.ini upgrade head
```

The backend reads `DATABASE_URL` and falls back to:

```text
postgresql+psycopg://prompthub:prompthub@localhost:5432/prompthub
```

Optional security environment variables:

```text
PROMPTHUB_API_TOKEN
PROMPTHUB_CORS_ORIGINS
PROMPTHUB_API_PUBLIC_URL
PROMPTHUB_APP_URL
PROMPTHUB_GITHUB_CLIENT_ID
PROMPTHUB_GITHUB_CLIENT_SECRET
PROMPTHUB_GITHUB_TOKEN_ENCRYPTION_KEY
PROMPTHUB_APP_ENCRYPTION_KEY
PROMPTHUB_APP_ENCRYPTION_KEY_ID
PROMPTHUB_PROMPT_MAX_CHARS
PROMPTHUB_RESPONSE_MAX_CHARS
PROMTY_GEMINI_API_KEY
PROMTY_GEMINI_MODEL
PROMTY_GEMINI_TIMEOUT_SECONDS
PROMTY_MEMORY_GENERATOR
PROMTY_MEMORY_DRAFT_GENERATOR
PROMTY_PROJECT_MEMORY_GENERATOR
PROMPTHUB_OAUTH_STATE_SECRET
PROMPTHUB_JWT_SECRET
PROMPTHUB_ACCESS_TOKEN_TTL_SECONDS
PROMPTHUB_SESSION_COOKIE_NAME
PROMPTHUB_SESSION_COOKIE_SECURE
PROMPTHUB_SESSION_COOKIE_SAMESITE
PROMPTHUB_OAUTH_STATE_COOKIE_NAME
```

Browser reads require GitHub login and a valid PromptHub JWT session cookie. The session cookie is HttpOnly; JavaScript does not read the token directly. Set `PROMPTHUB_ACCESS_TOKEN_TTL_SECONDS=15552000` for 180-day web sessions.

Gemini-backed memory generation reads `PROMTY_GEMINI_API_KEY` from `.env.local`, `backend/.env.local`, or the process environment. The backend must be restarted after changing this key. `GET /api/projects/_memory/generator` reports whether Gemini is configured without exposing the key.

If `PROMPTHUB_API_TOKEN` is set, `POST /api/events/batch` accepts that global `Authorization: Bearer <token>`. GitHub CLI login issues per-user collector tokens stored as hashes in `collector_tokens`. Web JWTs and collector tokens are intentionally separate.

The web OAuth flow stores a short-lived HttpOnly nonce cookie and verifies it against the signed OAuth state in the callback. `PROMPTHUB_CORS_ORIGINS` is a comma-separated allowlist and defaults to the local Vite origins.

Application-level encryption protects sensitive development context at rest. `PROMPTHUB_APP_ENCRYPTION_KEY` is the preferred dedicated key for prompt text, AI response text, and unified diff patch text. If it is not configured, the backend falls back to the JWT/OAuth/API secret chain for local compatibility. Decryption keeps that fallback key chain available so local data written before a dedicated app key is added can still be read. Production deployments should always set a dedicated app encryption key and key id.

## ERD

```text
users
  |
  | 1:N
  v
devices

users
  |
  | 1:N
  v
collector_tokens

users
  |
  | 1:N
  v
projects
  |
  | 1:N
  v
sessions
  |
  | 1:N
  v
events
  |
  | 1:N
  v
artifacts
```

`artifacts.event_id` is nullable. Artifacts are deleted when their project is deleted. If an event is deleted directly, the artifact is preserved and `event_id` is set to null.

## Tables

### users

```text
id UUID PK
github_id string unique
email string unique nullable
username string unique
avatar_url string nullable
created_at timestamptz
updated_at timestamptz
```

### devices

```text
id UUID PK
user_id UUID FK -> users.id on delete cascade
hostname string
os string
collector_version string nullable
last_seen timestamptz
created_at timestamptz
```

### collector_tokens

```text
id UUID PK
user_id UUID FK -> users.id on delete cascade
token_hash string unique
name string
created_at timestamptz
last_used_at timestamptz nullable
revoked_at timestamptz nullable
```

Only token hashes are persisted. Raw collector tokens are returned once to the CLI login callback.

### projects

```text
id UUID PK
owner_id UUID FK -> users.id on delete cascade
name string
slug string
description text nullable
visibility string public/private
git_remote string nullable
local_path_hash string nullable
default_branch string
created_at timestamptz
updated_at timestamptz
```

Constraints:

```text
visibility in ('public', 'private')
unique(owner_id, slug)
```

### sessions

```text
id UUID PK
project_id UUID FK -> projects.id on delete cascade
device_id UUID FK -> devices.id on delete set null
tool string
tool_version string nullable
model string nullable
cwd string nullable
branch string nullable
started_at timestamptz
ended_at timestamptz nullable
```

### events

```text
id UUID PK
project_id UUID FK -> projects.id on delete cascade
session_id UUID FK -> sessions.id on delete cascade
sequence int
schema_version int
tool string
event_type string
payload JSONB
created_at timestamptz
```

Storage policy:

```text
PromptSubmitted.payload.prompt is encrypted before persistence.
Prompt text is capped by PROMPTHUB_PROMPT_MAX_CHARS, default 50000 characters.
Prompt truncation metadata is stored as prompt_truncated, prompt_original_length, and prompt_storage_limit.
ResponseReceived.payload.response is encrypted before persistence.
Response text is capped by PROMPTHUB_RESPONSE_MAX_CHARS, default 50000 characters.
Response truncation metadata is stored as response_truncated, response_original_length, and response_storage_limit.
FilesChanged.payload.changes[].patch is encrypted before persistence.
Queryable metadata such as project_id, session_id, event_type, timestamps, file paths, and line counts remains plaintext.
```

Indexes:

```text
unique(project_id, session_id, sequence)
(project_id, created_at)
(created_at, sequence)
(event_type, created_at)
(session_id, created_at)
(project_id, session_id, created_at)
GIN(payload)
```

Constraints:

```text
sequence > 0
schema_version >= 1
tool in supported tools
event_type in supported event types
```

### code_change_patches

Prompt/turn-level file diffs extracted from `FilesChanged` events. This table is optimized for showing GitHub-style code review UI without scanning every event payload.

```text
id UUID PK
project_id UUID FK -> projects.id on delete cascade
session_id UUID FK -> sessions.id on delete cascade
event_id UUID FK -> events.id on delete cascade
prompt_event_id UUID nullable
path string
old_path string nullable
status string
additions int nullable
deletions int nullable
patch text nullable
patch_truncated boolean
binary boolean
metadata JSONB
created_at timestamptz
```

Indexes:

```text
(project_id, prompt_event_id)
(project_id, created_at)
event_id
session_id
```

Patch policy:

```text
Store unified diffs per PromptSubmitted -> FilesChanged turn.
Do not store full before/after file bodies.
Encrypt stored patch text with application-level encryption.
Do not store patch text for sensitive paths, excluded directories, binary files, or oversized files.
Use metadata.patch_omitted_reason when patch text is omitted.
```

### session constraints

```text
ended_at is null or ended_at >= started_at
```

### artifacts

```text
id UUID PK
schema_version int
project_id UUID FK -> projects.id on delete cascade
session_id UUID nullable FK -> sessions.id on delete set null
event_id UUID nullable FK -> events.id on delete set null
type string
title string
summary text nullable
reason text nullable
outcome text nullable
storage_key string
tags JSONB array
changed_files JSONB array
prompt_event_ids JSONB array
commit_sha string nullable
model string nullable
generator string nullable
metadata JSONB object
created_at timestamptz
updated_at timestamptz
```

`MemoryTask` artifacts are generated from completed sessions and form Promty's project memory layer.

### artifact_generation_jobs

```text
id UUID PK
project_id UUID FK -> projects.id on delete cascade
session_id UUID FK -> sessions.id on delete cascade
artifact_id UUID nullable FK -> artifacts.id on delete set null
status pending/running/succeeded/failed
reason string
generator string
error text nullable
metadata JSONB object
created_at timestamptz
updated_at timestamptz
completed_at timestamptz nullable
```

## Current Ingest Behavior

The current Event API contract does not include user, device, project, or session setup fields beyond `project_id` and `session_id`.

To keep the API contract unchanged, the persistence layer currently:

```text
creates a deterministic system user when needed
creates a placeholder project when project_id is new
assigns projects uploaded with collector tokens to the token owner
creates a session when session_id is new
stores the incoming event payload as JSONB
optionally requires Bearer auth when PROMPTHUB_API_TOKEN is set
accepts per-user collector tokens issued through GitHub OAuth
requires web JWT auth for browser event reads
rejects empty batches and batches larger than 500 events
accepts exact event-id replays as idempotent no-ops
rejects event-id replays with changed content
rejects project/session mismatches
rejects duplicate sequences within a project/session
```

This keeps backend logic tool-independent. Codex, Claude Code, Cursor, and Gemini-specific normalization remains in the collector.

Future authentication and device registration work should replace the system user and null device behavior without changing the Event contract.

## Migrations

```text
0001_initial_schema
0002_event_security_indexes
0003_collector_tokens
```

`0002_event_security_indexes` adds event sequence uniqueness, event check constraints, session time ordering, latest/event-type/session query indexes, and a JSONB GIN index for future payload filtering.

`0003_collector_tokens` adds hashed per-user collector tokens for CLI login and upload authentication.

`0011_promty_memory_artifacts` extends artifacts for generated project memory and adds artifact generation jobs.
