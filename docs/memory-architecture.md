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

The current generator is deterministic (`local-session-v1`) so the memory pipeline works without an external LLM. Gemini generation is the next upgrade to the same job path.

## Next Build Order

1. Replace `local-session-v1` with Gemini-backed session summarization.
2. Add embedding generation for every `MemoryTask`.
3. Store embeddings in pgvector.
4. Add semantic project-memory search.
5. Build a Context Builder that retrieves artifacts, prompts, diffs, commits, and changed files.
6. Add Project Chat with cited answers from actual project history.

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
