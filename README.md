# PromptHub

PromptHub collects AI development events from local coding tools and shows them in a timeline.

## Flow

```text
AI Tool
    |
    v
Hook
    |
    v
Adapter
    |
    v
PromptHub Event
    |
    v
Queue (JSONL)
    |
    v
Uploader
    |
    v
Backend API
    |
    v
PostgreSQL
    |
    v
React Timeline
```

## Project Structure

```text
prompthub/
├── frontend/          # React
├── backend/           # FastAPI
├── collector/         # User-installed CLI
├── docs/
├── docker/
├── docker-compose.yml
├── README.md
└── .github/
```

## Collector

The collector receives hook JSON through stdin and normalizes each tool payload into a PromptHub Event.

Supported tools:

```text
claude-code
codex-cli
cursor
gemini-cli
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

Capture a Claude Code prompt:

```bash
python3 collector/src/cli.py capture --tool claude-code
```

Capture a Codex prompt:

```bash
python3 collector/src/cli.py capture --tool codex-cli
```

Capture a non-prompt event:

```bash
python3 collector/src/cli.py capture --tool codex-cli --event-type FilesChanged
```

Upload queued events:

```bash
python3 collector/src/cli.py upload --api-url http://localhost:8000
```

Run the uploader in the background for near-real-time sync:

```bash
python3 collector/src/cli.py upload --api-url http://localhost:8000 --watch --interval 2
```

By default, queued events are stored at:

```text
~/.prompthub/events.jsonl
```

## Backend

Current API contract:

```text
POST /api/events/batch
GET  /api/events
GET  /health
```

`POST /api/events/batch` accepts:

```json
{
  "events": [
    {
      "id": "0db26f22-26a1-4b4b-b42f-8a6248eb65d8",
      "schema_version": 1,
      "project_id": "56828395-f94c-56f7-9ff9-a2feb027ae19",
      "session_id": "7d9f16c5-76ef-5a7a-82f7-356b25b897b5",
      "sequence": 12,
      "tool": "codex-cli",
      "event_type": "PromptSubmitted",
      "timestamp": "2026-06-27T00:00:00+00:00",
      "payload": {
        "prompt": "Build a FastAPI endpoint",
        "cwd": "/projects/prompthub",
        "model": "gpt-5",
        "turn_id": 12
      }
    }
  ]
}
```

The backend persists events to PostgreSQL through SQLAlchemy and Alembic.

See [Event Specification v1](docs/event-spec-v1.md) for the normalized event contract.

See [Development Guidelines](docs/development-guidelines.md) for branch, commit, and module rules.

See [Artifact Model Draft](docs/artifact-model.md) for the future artifact architecture.

See [Codex Hook Verification](docs/codex-hook-verification.md) for the first hook smoke path.

See [Database](docs/database.md) for the PostgreSQL schema and migration commands.

See [Project Status](docs/project-status.md) for the current implementation snapshot and local runbook.

Start the local PostgreSQL service:

```bash
docker compose up -d postgres
```

Run database migrations:

```bash
./.venv/bin/alembic -c backend/alembic.ini upgrade head
```
