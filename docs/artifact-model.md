# Promty Artifact Model

Artifacts are the domain layer that turns raw Promty events into long-term project memory.

## Purpose

Artifacts are durable outputs, context files, or generated memory records produced during an AI development session.

Examples:

```text
design.md
agent.md
skill.md
image.png
demo.mp4
```

Events answer what happened.

Artifacts answer what was produced, attached, or decided.

## Current Memory Model

```text
Artifact
id: UUID
schema_version: int
project_id: UUID
session_id: UUID | null
event_id: UUID | null
type: str
title: str
summary: str | null
reason: str | null
outcome: str | null
storage_key: str
tags: JSON array
changed_files: JSON array
prompt_event_ids: JSON array
commit_sha: str | null
model: str | null
generator: str | null
metadata: JSON object
created_at: datetime
updated_at: datetime
```

## Artifact Type

Current and candidate types:

```text
MemoryTask
Document
AgentDefinition
SkillDefinition
Image
Video
CodePatch
Log
Other
```

## Relationship To Events

An artifact can be linked to a specific event.

Examples:

```text
PromptSubmitted -> design.md attached as context
ResponseReceived -> generated agent.md
FilesChanged -> CodePatch artifact
CommitCreated -> patch summary artifact
SessionEnded -> MemoryTask artifact
```

The Event model must remain independent.

Artifact implementation should not add tool-specific logic to the backend.

## Generation Jobs

Generated artifacts are tracked through `artifact_generation_jobs`.

Current job execution is inline and deterministic with `local-session-v1`.

The job table is intentionally shaped so a future Redis + Celery or Dramatiq worker can process pending jobs without changing the API contract.

## Storage Direction

Current memory artifacts store structured metadata in PostgreSQL.

Future split for binary or large artifacts:

```text
PostgreSQL -> artifact metadata
Object storage or local volume -> artifact bytes
```

## Rules

- Keep artifacts separate from events.
- Link artifacts to projects, sessions, and optionally events.
- Do not store large binary data directly in event payloads.
- Use typed metadata per artifact type when implementation begins.
- Version the artifact schema with `schema_version`.
