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
(project_id, session_id, sequence)
(project_id, created_at)
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
creates a session when session_id is new
stores the incoming event payload as JSONB
```

This keeps backend logic tool-independent. Codex, Claude Code, Cursor, and Gemini-specific normalization remains in the collector.

Future authentication and device registration work should replace the system user and null device behavior without changing the Event contract.
