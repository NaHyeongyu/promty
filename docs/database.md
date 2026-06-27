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
PROMPTHUB_OAUTH_STATE_SECRET
PROMPTHUB_JWT_SECRET
PROMPTHUB_ACCESS_TOKEN_TTL_SECONDS
PROMPTHUB_SESSION_COOKIE_NAME
PROMPTHUB_SESSION_COOKIE_SECURE
PROMPTHUB_SESSION_COOKIE_SAMESITE
PROMPTHUB_OAUTH_STATE_COOKIE_NAME
```

Browser reads require GitHub login and a valid PromptHub JWT session cookie. The session cookie is HttpOnly; JavaScript does not read the token directly.

If `PROMPTHUB_API_TOKEN` is set, `POST /api/events/batch` accepts that global `Authorization: Bearer <token>`. GitHub CLI login issues per-user collector tokens stored as hashes in `collector_tokens`. Web JWTs and collector tokens are intentionally separate.

The web OAuth flow stores a short-lived HttpOnly nonce cookie and verifies it against the signed OAuth state in the callback. `PROMPTHUB_CORS_ORIGINS` is a comma-separated allowlist and defaults to the local Vite origins.

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

### session constraints

```text
ended_at is null or ended_at >= started_at
```

### artifacts

```text
id UUID PK
project_id UUID FK -> projects.id on delete cascade
event_id UUID nullable FK -> events.id on delete set null
type string
title string
storage_key string
created_at timestamptz
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
