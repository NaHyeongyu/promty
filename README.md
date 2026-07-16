# Promty

Promty collects AI development events from local coding tools and turns completed sessions into long-term project memory.

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
Promty Event
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

The collector receives hook JSON through stdin and normalizes each tool payload into a Promty Event.

User-facing setup flow:

```bash
python3 collector/src/cli.py init \
  --profile dev
```

`init` opens the Promty login page, uses GitHub sign-in to receive a collector token, writes local Promty config, installs Codex and Claude Code hooks, and starts the uploader in the background.

If the local repository has a GitHub `origin` remote, Promty automatically links the captured project to that GitHub repository:

```bash
git remote add origin git@github.com:OWNER/REPO.git
```

Supported remote formats include `git@github.com:OWNER/REPO.git`, `ssh://git@github.com/OWNER/REPO.git`, and `https://github.com/OWNER/REPO.git`.

Run the published npm package with:

```bash
npx promty-collector init
```

Use `--profile dev` for local development and `--profile prod` for production.
Profiles isolate login credentials, uploader processes, logs, and event queues so
switching environments cannot overwrite another environment's collector state.

To store every captured event in both environments, initialize both profiles
explicitly:

```bash
npx promty-collector init --profiles dev,prod
```

The collector creates each event once, writes the same event ID to independent
profile queues, and uploads each queue separately. A backend outage therefore
does not block or remove the other profile's pending events. Verify all targets
with `npx promty-collector doctor --profiles dev,prod --tool all`.

The background uploader checks npm for a newer collector every six hours. When
an update is available, it installs the content-addressed runtime and restarts
itself with the same profile and queue. Pass `--no-auto-update` to `init` or
`start-uploader` to opt out. Installations older than `0.1.2` require one manual
`npx promty-collector@latest init --profile <dev|prod>` upgrade before automatic
updates become available.

The npm package includes the Python collector and uses `python3` by default. Set
`PROMTY_PYTHON` when a different Python executable is required.

For a Python-native installation, run `pipx install ./collector` and use the
same `promty` command.

Installable integrations:

```text
claude-code
codex-cli
```

Current validation status:

```text
codex-cli   adapter + repository hook + real payload path validated
claude-code adapter + repository hook installer implemented
```

Cursor and Gemini CLI adapters remain experimental and are not exposed by
`init`, `install-hooks`, or `doctor` until their hook paths are validated.

`init` installs a content-addressed runtime under `~/.promty/runtime` and writes
the durable `~/.promty/bin/promty` launcher into repository hooks. Hooks do not
depend on the npm cache, the source checkout, or the directory where setup ran.

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

Capture code changes at the end of a Claude Code turn:

```bash
python3 collector/src/cli.py capture-changes --tool claude-code
```

Install or repair Codex hooks without logging in:

```bash
python3 collector/src/cli.py install-hooks --tool codex-cli
```

Install or repair Claude Code hooks without logging in:

```bash
python3 collector/src/cli.py install-hooks --tool claude-code
```

Run local diagnostics:

```bash
python3 collector/src/cli.py doctor
```

Run Claude Code diagnostics:

```bash
python3 collector/src/cli.py doctor --tool claude-code
```

Upload queued events:

```bash
python3 collector/src/cli.py upload --api-url http://localhost:8011
```

Run the uploader in the background for near-real-time sync:

```bash
python3 collector/src/cli.py upload --api-url http://localhost:8011 --watch --interval 2
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
GET  /health/live
GET  /health/ready
```

`POST /api/events/batch` requires `Authorization: Bearer <token>` in production and accepts:

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
Runtime dependencies are declared in `backend/requirements.txt` and the fully
resolved Python 3.12 build is pinned in `backend/requirements.lock` for CI and
Docker.

## AWS And GitHub

The repository includes a production deployment runbook for AWS and GitHub Actions:

```text
.github/workflows/ci.yml
.github/workflows/aws-deploy.yml
backend/Dockerfile
docs/aws-github-deployment.md
docs/aws-resource-inventory.md
```

`CI` runs Python static checks, backend and collector tests, collector package
validation, and the frontend production build. `AWS Deploy` is a manual workflow
that builds the frontend for S3/CloudFront, publishes the backend image to ECR,
and restarts the EC2 backend through AWS Systems Manager. See
[AWS and GitHub Deployment Runbook](docs/aws-github-deployment.md) for the
complete Git, AWS CLI, domain, secret, deployment, and troubleshooting guide.
Published flow assets can use S3 by setting:

```bash
export PROMPTHUB_PUBLISHED_FLOW_ASSET_STORAGE="s3"
export PROMPTHUB_AWS_REGION="ap-southeast-2"
export PROMPTHUB_AWS_S3_BUCKET="your-private-asset-bucket"
```

Optional ingest security:

```bash
export PROMPTHUB_API_TOKEN="replace-with-local-secret"
export PROMPTHUB_CORS_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
export PROMPTHUB_API_PUBLIC_URL="https://api.prompthub.example"
export PROMPTHUB_APP_URL="https://app.prompthub.example"
export PROMPTHUB_GITHUB_CLIENT_ID="github-oauth-client-id"
export PROMPTHUB_GITHUB_CLIENT_SECRET="github-oauth-client-secret"
export PROMPTHUB_GITHUB_TOKEN_ENCRYPTION_KEY="replace-with-github-token-encryption-secret"
export PROMPTHUB_GITHUB_TOKEN_ENCRYPTION_PREVIOUS_KEYS=""
export PROMPTHUB_APP_ENCRYPTION_KEY="replace-with-app-data-encryption-secret"
export PROMPTHUB_APP_ENCRYPTION_KEY_ID="local"
export PROMPTHUB_ADMIN_GITHUB_IDS="immutable-numeric-github-id"
export PROMPTHUB_AUTH_RATE_LIMIT_REQUESTS="30"
export PROMPTHUB_AUTH_RATE_LIMIT_WINDOW_SECONDS="60"
export PROMPTHUB_ADMIN_RATE_LIMIT_REQUESTS="120"
export PROMPTHUB_ADMIN_RATE_LIMIT_WINDOW_SECONDS="60"
export PROMPTHUB_ADMIN_AUDIT_RETENTION_DAYS="180"
export PROMPTHUB_PROMPT_MAX_CHARS="50000"
export PROMPTHUB_RESPONSE_MAX_CHARS="50000"
export PROMPTHUB_EVENT_BATCH_MAX_BODY_BYTES="33554432"
export PROMPTHUB_MEMORY_SLICE_EVENT_MAX_ROWS="500"
export PROMPTHUB_MEMORY_SLICE_MAX_SLICES_PER_CALL="4"
export PROMPTHUB_MEMORY_DRAFT_PROMPT_MAX_BYTES="131072"
export PROMPTHUB_MEMORY_DRAFT_EVIDENCE_MAX_BYTES="98304"
export PROMPTHUB_PROJECT_MEMORY_PROMPT_MAX_BYTES="262144"
export PROMPTHUB_MEMORY_PROVIDER_RESPONSE_MAX_BYTES="1048576"
export PROMPTHUB_MEMORY_PROVIDER_OUTPUT_MAX_TOKENS="8192"
export PROMPTHUB_MEMORY_PROVIDER_WALL_DEADLINE_SECONDS="120"
export PROMPTHUB_PROJECT_MEMORY_BATCH_MAX_DRAFTS="60"
export PROMPTHUB_MEMORY_WORKER_POLL_SECONDS="2"
export PROMPTHUB_MEMORY_WORKER_HEARTBEAT_SECONDS="60"
export PROMPTHUB_MEMORY_WORKER_CHUNK_CONCURRENCY="2"
export PROMPTHUB_OAUTH_STATE_SECRET="replace-with-oauth-state-secret"
export PROMPTHUB_JWT_SECRET="replace-with-jwt-secret"
export PROMPTHUB_ACCESS_TOKEN_TTL_SECONDS="3600"
# export PROMPTHUB_ACCESS_TOKEN_TTL_SECONDS="15552000" # 180-day web sessions
```

Web users sign in through GitHub OAuth. The backend issues a short-lived HS256 JWT in an HttpOnly session cookie and requires it for browser reads such as `GET /api/events`.

Prompt text, AI response text, and unified diff patch text in raw event storage are encrypted at rest with application-level encryption. Project/session IDs, timestamps, file paths, line counts, and status metadata remain queryable for sorting and filtering. Prompt and response text are capped before encryption and default to 50,000 characters. Derived memory artifacts and artifact-version metadata are not covered by this envelope yet and must not be treated as secret storage.

Collectors do not use the web JWT. CLI login issues a separate per-user collector token stored as a hash in PostgreSQL. `POST /api/events/batch` accepts that collector token as `Authorization: Bearer <token>`. `PROMPTHUB_API_TOKEN` remains available as an optional local/global ingest token. Anonymous ingest is disabled by default; only set `PROMPTHUB_ALLOW_ANONYMOUS_INGEST=true` for isolated local development.

The web OAuth flow uses a signed state value plus a short-lived HttpOnly nonce cookie to reduce login CSRF risk.

Administrator authorization uses only immutable numeric GitHub IDs from
`PROMPTHUB_ADMIN_GITHUB_IDS`; usernames and email addresses do not grant administrator
access. OAuth and administrator endpoints have per-client sliding-window rate limits.
Administrator console access and cross-owner project access are recorded in
`admin_audit_logs` without storing session tokens, email addresses, prompts, or responses.

The standalone operations console is available at `/admin`. It provides system-wide
overview, user and credential inventory, full project management, decrypted event search
and export, memory-generation job control, database/runtime telemetry, security posture,
and the administrator audit trail. The configured administrator can suspend, restore, or
delete non-admin users; issue and revoke collector tokens; disconnect GitHub access;
create, update, export, or delete projects; and cancel or safely retry eligible memory
jobs. Destructive and sensitive actions require typing the target username or project
slug, are authorized again by the API, and are written to the audit trail. Raw events and
administrator audit entries remain append-only from the console to preserve provenance.

Administrator control endpoints:

```text
GET  /api/admin/overview
GET  /api/admin/users
GET  /api/admin/projects
GET  /api/admin/jobs
GET  /api/admin/events
GET  /api/admin/system
GET  /api/admin/audit-logs
POST /api/admin/users/{user_id}/suspend
POST /api/admin/users/{user_id}/restore
DELETE /api/admin/users/{user_id}
POST /api/admin/users/{user_id}/collector-tokens
POST /api/admin/users/{user_id}/collector-tokens/{token_id}/revoke
POST /api/admin/users/{user_id}/collector-tokens/revoke-all
POST /api/admin/users/{user_id}/github-connection/disconnect
POST /api/admin/projects
PATCH /api/admin/projects/{project_id}
DELETE /api/admin/projects/{project_id}
POST /api/admin/jobs/{batch_id}/cancel
POST /api/admin/jobs/{batch_id}/retry
POST /api/admin/exports/events
POST /api/admin/exports/projects/{project_id}
```

Signed-in users can publish a project from its Overview settings and browse shared
projects from the Explore sidebar. Public project reads use dedicated read-only
contracts:

```text
GET /api/projects/public
GET /api/projects/public/{project_id}
```

The public response includes project metadata, aggregate activity, and generated or
verified memory. Raw prompts, AI responses, unified diffs, and tracked file contents
remain owner-only. Changing the project back to private immediately removes it from the
public list and makes its public URL return not found.

GitHub OAuth endpoints:

```text
GET /api/auth/github/start
GET /api/auth/github/web/start
GET /api/auth/github/web/repository/start
GET /api/auth/github/callback
GET /api/auth/me
POST /api/auth/logout
```

See [Event Specification v1](docs/event-spec-v1.md) for the normalized event contract.

See [Development Guidelines](docs/development-guidelines.md) for branch, commit, and module rules.

See [Memory Architecture](docs/memory-architecture.md) for the project memory roadmap.

See [Artifact Model](docs/artifact-model.md) for the current memory artifact direction.

Gemini-backed memory generation is enabled when `PROMTY_GEMINI_API_KEY` is set in `.env.local` or `backend/.env.local`. Use [Promty env example](docs/promty.env.example) as the copy source. Without the key, Promty falls back to deterministic local session summaries.

See [Codex Hook Verification](docs/codex-hook-verification.md) for the first hook smoke path.

See [Database](docs/database.md) for the PostgreSQL schema and migration commands.

See [Project Status](docs/project-status.md) for the current implementation snapshot and local runbook.

Start the complete local stack, including migrations:

```bash
docker compose up --build
```

The frontend is available at `http://127.0.0.1:5173` and the API readiness check at
`http://127.0.0.1:8011/health/ready`. To run only PostgreSQL and manage processes on
the host instead:

```bash
docker compose up -d postgres
./.venv/bin/alembic -c backend/alembic.ini upgrade head
```

Then run the API and Project Memory worker in separate terminals:

```bash
cd backend
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8011
```

```bash
cd backend
../.venv/bin/python -m app.workers.project_memory
```

Compose loads development-only fallback secrets from `docker/compose.env` and
then applies overrides from the ignored root `.env.local` when it exists.

Run unit, PostgreSQL integration, and authenticated browser CRUD checks with:

```bash
cd backend && PROMPTHUB_RUN_POSTGRES_TESTS=1 ../.venv/bin/pytest -q
cd frontend && npm test
cd frontend && npm run test:e2e
```

The E2E suite expects the Compose stack to be running. It creates an isolated
short-lived browser user inside the backend container and removes it after the run.
