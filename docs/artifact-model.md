# PromptHub Artifact Model Draft

This document prepares the future artifact architecture. It does not define a database implementation yet.

## Purpose

Artifacts are durable outputs or context files produced during an AI development session.

Examples:

```text
design.md
agent.md
skill.md
image.png
demo.mp4
```

Events answer what happened.

Artifacts answer what was produced or attached.

## Future Model

```text
Artifact
id: UUID
schema_version: int
project_id: UUID
session_id: UUID
event_id: UUID | null
artifact_type: str
name: str
path: str | null
mime_type: str | null
size_bytes: int | null
checksum: str | null
metadata: typed object
created_at: datetime
```

## Artifact Type

Initial candidate types:

```text
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
```

The Event model must remain independent.

Artifact implementation should not add tool-specific logic to the backend.

## Storage Direction

Do not implement storage yet.

Likely future split:

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
