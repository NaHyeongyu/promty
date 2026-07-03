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
Session Complete
    ↓
Artifact Generator
    ↓
Embedding Generation
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

Promty currently has the first project-memory slice:

- Collector events are normalized and stored in PostgreSQL JSONB.
- Sessions can be completed explicitly through `SessionEnded` or manually through the web API.
- Completed sessions generate a `MemoryTask` artifact.
- Artifact generation is recorded in `artifact_generation_jobs`.
- The project overview shows recent Project Memory artifacts.

The generator path supports Gemini-backed summaries (`gemini-session-v1`) with deterministic fallback (`local-session-v1`). If a Gemini API key is missing or generation fails, Promty still creates a memory artifact from local session evidence.

Configuration:

```text
PROMTY_GEMINI_API_KEY
PROMTY_GEMINI_MODEL=gemini-2.5-flash
PROMTY_GEMINI_TIMEOUT_SECONDS=30
PROMTY_MEMORY_GENERATOR=gemini
```

Legacy `PROMPTHUB_*` names are still accepted for compatibility.

## Next Build Order

1. Add embedding generation for every `MemoryTask`.
2. Store embeddings in pgvector.
3. Add semantic project-memory search.
4. Build a Context Builder that retrieves artifacts, prompts, diffs, commits, and changed files.
5. Add Project Chat with cited answers from actual project history.

## Memory Artifact

A `MemoryTask` represents one meaningful development task inferred from a completed session.

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
