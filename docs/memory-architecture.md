# Promty AI Memory Architecture

## Vision

Promty is not another AI model.

Promty gives AI long-term memory and understanding of a software project.

GitHub stores what changed. Promty stores why it changed, how it changed, and which decisions led to the final implementation.

## High-Level Architecture

```text
Collector
    ↓
Event Store
    ↓
Pending Memory Draft
    ↓
Generated Context Memory
    ↓
Project Memory
    ↓
Context Builder
    ↓
LLM
    ↓
User Answer
```

## Current Implementation

Promty currently uses a pull-request-style memory pipeline:

- Collector events are normalized and stored in PostgreSQL JSONB.
- Pending `MemoryDraft` evidence packages are created after 20 user prompts, `SessionEnded`, or 1 hour without a new prompt.
- A pending draft is created only after the latest prompt has both a `ResponseReceived` payload with response text and a `FilesChanged` marker.
- Pending drafts store the original user prompt input, original AI output, changed-file evidence, and metadata needed for one-time AI generation.
- Prompts over 10,000 characters are sent to AI as first 300 characters, last 300 characters, and original size while the stored evidence keeps the original text.
- The user runs one Generate action for pending drafts. Successfully generated drafts are marked as sent and are not sent to AI again.
- Generated `MemoryTask` artifacts are shown in History and can be edited or removed through the memory APIs.
- Artifact generation is recorded in `artifact_generation_jobs`.
- Project Memory is compiled from generated and user-edited memories, not pending drafts.

Configuration:

```text
PROMTY_OPENAI_API_KEY
PROMTY_OPENAI_MODEL=gpt-5-mini
PROMTY_MEMORY_DRAFT_GENERATOR=openai
PROMTY_PROJECT_MEMORY_GENERATOR=openai
PROMTY_GEMINI_API_KEY
PROMTY_GEMINI_MODEL=gemini-2.5-flash
PROMTY_GEMINI_TIMEOUT_SECONDS=30
```

`PROMTY_MEMORY_GENERATOR` remains accepted as a shared default for draft and project memory generators. Legacy `PROMPTHUB_*` names are still accepted for compatibility.

Use [promty.env.example](promty.env.example) as the copy source for `.env.local` or `backend/.env.local`. After setting the key, restart the backend process so the setting is loaded.

Generator status is available to authenticated web users:

```text
GET /api/projects/_memory/generator
```

The response reports configured providers and active generators without returning API keys.

## Next Build Order

1. Add generated-memory CRUD coverage for every History action.
2. Store embeddings for generated `MemoryTask` artifacts in pgvector.
3. Add semantic project-memory search.
4. Build a Context Builder that retrieves generated memories, prompts, diffs, commits, and changed files.
5. Add Project Chat with cited answers from actual project history.

## Memory Artifact

A `MemoryTask` represents one generated context memory inferred from one or more pending drafts.

Core fields:

- Title
- Summary
- Reason
- Outcome
- Changed files
- Prompt event IDs
- Commit SHA
- Tags
- Generator

These artifacts are the domain layer Promty will use for timeline, docs, replay, analytics, search, and AI explanations.

## Product Direction

Promty should focus on decision memory, not raw prompt history.

Important content surfaces:

- Project Memory timeline
- File memory: why a file changed over time
- Decision notes
- Implementation stories
- AI handoff briefs
- "Why did this change?" explanations
- Project Chat grounded in artifacts and original evidence
