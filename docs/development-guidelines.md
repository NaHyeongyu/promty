# Promty Development Guidelines

## Core Rule

Promty uses one task per commit.

A task is one logical change that can be reviewed, reverted, and tested independently.

Good examples:

```text
feat(collector): normalize codex prompt events
fix(backend): reject invalid event types
docs: define branch and module rules
```

Bad examples:

```text
feat: add frontend and refactor backend and update docker
fix: misc changes
```

## Branch Rules

`main` is the stable branch.

Work branches must be created from the latest `main`.

Branch names use:

```text
<type>/<scope>-<short-description>
```

Allowed types:

```text
feat
fix
docs
chore
refactor
test
infra
```

Examples:

```text
feat/collector-codex-hooks
feat/backend-event-ingest
docs/development-guidelines
infra/postgres-compose
```

Rules:

- Use lowercase English and kebab-case.
- Keep branches scoped to one feature, fix, or documentation task.
- Do not push directly to `main` after remote branch protection is enabled.
- Rebase or merge the latest `main` before opening a PR if the branch is stale.
- Delete merged branches.

## Commit Rules

Commits use Conventional Commits:

```text
<type>(<scope>): <summary>
```

Scope is optional but preferred when the change is inside one module.

Common scopes:

```text
collector
backend
frontend
docs
docker
```

Rules:

- One task per commit.
- Do not mix unrelated feature, fix, refactor, and docs work.
- Keep generated files out of commits unless they are required source artifacts.
- Include tests or verification updates in the same commit as the behavior change.
- Database schema and matching application code should be committed together.

## Module Boundaries

Promty is split into four main domains.

```text
collector -> backend -> frontend
docs
```

### Collector

Collector owns tool-specific input parsing.

Responsibilities:

- Read hook JSON from AI tools.
- Convert external payloads into Promty Event v1.
- Write events to the local JSONL queue.
- Upload queued events to the backend outside the hook path.

Rules:

- Hook capture must not make network requests.
- Tool-specific logic belongs only in `collector/src/adapters/<tool>/`.
- Shared event construction belongs in `collector/src/events.py`.
- Shared adapter helpers belong in `collector/src/adapters/common.py`.
- Queue persistence belongs in `collector/src/uploader/queue.py`.
- HTTP upload logic belongs in `collector/src/uploader/client.py`.

Adding a new AI tool should normally require only:

```text
collector/src/adapters/<tool>/
collector/src/events.py
docs/event-spec-v1.md if the standard contract changes
```

### Backend

Backend owns the Promty Event API and persistence.

Responsibilities:

- Accept Promty Events.
- Validate event shape.
- Persist events.
- Return events for timeline views.

Rules:

- Backend must not parse Claude, Codex, Cursor, or Gemini raw payloads.
- Backend only understands the Promty Event contract.
- HTTP routes belong in `backend/app/api/`.
- Pydantic request/response models belong in `backend/app/schemas/`.
- Business logic belongs in `backend/app/services/`.
- ORM models belong in `backend/app/models/`.
- Database sessions and migrations belong in `backend/app/db/`.
- Configuration belongs in `backend/app/core/`.

### Frontend

Frontend owns user-facing views.

Responsibilities:

- Fetch Promty Events from the backend.
- Render project/session timelines.
- Keep UI components independent from transport details.

Rules:

- The frontend starts from the standard Vite React scaffold.
- Frontend UI work must follow `design.md`.
- Introduce folders only when a real feature needs them.
- API calls should not be embedded directly in presentation-only components.
- Shared TypeScript types should stay close to the feature until they have multiple consumers.
- Components should receive data through props where practical.

### Docs

Docs capture contracts and engineering decisions.

Rules:

- Event contract changes must update `docs/event-spec-v1.md` or create a new versioned spec.
- Process changes must update this file.
- README should stay high-level and link to detailed docs.

## Event Contract Rules

Promty Event v1 is the boundary between collector and backend.

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

Event names use past tense:

```text
SessionStarted
PromptSubmitted
ResponseReceived
FilesChanged
CommitCreated
SessionEnded
```

Payloads must use typed models. Do not pass arbitrary JSON through the backend.

Backend changes are required only when the Promty Event contract changes, not when a tool changes its own hook payload.

If a tool payload changes:

```text
update collector adapter
add or update adapter tests
do not add tool-specific backend branches
```

## Verification

Before committing Python collector/backend changes:

```bash
python3 -m compileall collector/src backend/app
```

Before committing frontend changes, run the project frontend checks once the React toolchain is installed.

Before committing backend runtime changes, run backend tests once the test suite exists.
