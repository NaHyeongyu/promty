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

User-facing setup flow:

```bash
python3 collector/src/cli.py init \
  --app-url http://127.0.0.1:5173 \
  --api-url http://127.0.0.1:8011
```

`init` opens the PromptHub login page, uses GitHub sign-in to receive a collector token, writes local PromptHub config, installs Codex hooks, and starts the uploader in the background.

If the local repository has a GitHub `origin` remote, PromptHub automatically links the captured project to that GitHub repository:

```bash
git remote add origin git@github.com:OWNER/REPO.git
```

Supported remote formats include `git@github.com:OWNER/REPO.git`, `ssh://git@github.com/OWNER/REPO.git`, and `https://github.com/OWNER/REPO.git`.

The production packaging target is:

```bash
npx @prompthub/cli init
```

The local CLI commands are already split so that packaging can wrap the same flow.

Supported tools:

```text
claude-code
codex-cli
cursor
gemini-cli
```

Current validation status:

```text
codex-cli   adapter + repo hook + real payload path validated
claude-code adapter scaffolded, end-to-end hook validation pending
cursor      adapter scaffolded, end-to-end hook validation pending
gemini-cli  adapter scaffolded, end-to-end hook validation pending
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

Capture code changes at the end of a Codex turn:

```bash
python3 collector/src/cli.py capture-changes --tool codex-cli
```

Install or repair Codex hooks without logging in:

```bash
python3 collector/src/cli.py install-hooks --tool codex-cli
```

Run local diagnostics:

```bash
python3 collector/src/cli.py doctor
```

Upload queued events:

```bash
python3 collector/src/cli.py upload --api-url http://localhost:8000
```

Run the uploader in the background for near-real-time sync:

```bash
python3 collector/src/cli.py upload --api-url http://localhost:8000 --watch --interval 2
```

By default, queued events are stored by project and session at:

```text
~/.prompthub/events/<project_id>/<session_id>/events.jsonl
```

If `PROMPTHUB_QUEUE_PATH` or `--queue-path` is set, the collector uses that single JSONL file instead. The uploader also reads the legacy `~/.prompthub/events.jsonl` queue if it exists.

Prompt baselines for git-backed change tracking are stored at:

```text
~/.prompthub/change-baselines.json
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

Optional ingest security:

```bash
export PROMPTHUB_API_TOKEN="replace-with-local-secret"
export PROMPTHUB_CORS_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
export PROMPTHUB_API_PUBLIC_URL="https://api.prompthub.example"
export PROMPTHUB_APP_URL="https://app.prompthub.example"
export PROMPTHUB_GITHUB_CLIENT_ID="github-oauth-client-id"
export PROMPTHUB_GITHUB_CLIENT_SECRET="github-oauth-client-secret"
export PROMPTHUB_GITHUB_TOKEN_ENCRYPTION_KEY="replace-with-github-token-encryption-secret"
export PROMPTHUB_OAUTH_STATE_SECRET="replace-with-oauth-state-secret"
export PROMPTHUB_JWT_SECRET="replace-with-jwt-secret"
export PROMPTHUB_ACCESS_TOKEN_TTL_SECONDS="3600"
```

Web users sign in through GitHub OAuth. The backend issues a short-lived HS256 JWT in an HttpOnly session cookie and requires it for browser reads such as `GET /api/events`.

Collectors do not use the web JWT. CLI login issues a separate per-user collector token stored as a hash in PostgreSQL. `POST /api/events/batch` accepts that collector token as `Authorization: Bearer <token>`. `PROMPTHUB_API_TOKEN` remains available as an optional local/global ingest token.

The web OAuth flow uses a signed state value plus a short-lived HttpOnly nonce cookie to reduce login CSRF risk.

GitHub OAuth endpoints:

```text
GET /api/auth/github/start
GET /api/auth/github/web/start
GET /api/auth/github/callback
GET /api/auth/me
POST /api/auth/logout
```

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
