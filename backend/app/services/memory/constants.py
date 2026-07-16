from __future__ import annotations

from datetime import timedelta

MEMORY_ARTIFACT_TYPE = "MemoryTask"
MEMORY_DRAFT_ARTIFACT_TYPE = "MemoryDraft"
PROJECT_MEMORY_ARTIFACT_TYPE = "ProjectMemory"
LOCAL_MEMORY_GENERATOR = "local-memory-slice-v1"
PENDING_MEMORY_DRAFT_GENERATOR = "local-pending-memory-draft-v1"
MEMORY_WINDOW_STRATEGY = "prompt_window_v1"
SESSION_IDLE_COMPLETE_AFTER = timedelta(hours=1)
LONG_TEXT_AI_PREVIEW_AFTER = 10_000
LONG_TEXT_AI_PREVIEW_EDGE = 300
PENDING_DRAFT_STAGE = "pending_draft"
REVIEW_STATE_DRAFT = "draft"
REVIEW_STATE_EDITED = "edited"
REVIEW_STATE_GENERATION_FAILED = "generation_failed"
REVIEW_STATE_GENERATED = "generated"
REVIEW_STATE_IGNORED = "ignored"
REVIEW_STATE_SAVED = "saved"
REVIEW_STATE_VERIFIED = "verified"
