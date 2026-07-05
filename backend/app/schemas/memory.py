from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, validator


class SourceConfidenceItem(BaseModel):
    source_event_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0, le=1)


class ChunkUserIntent(SourceConfidenceItem):
    intent: str


class ChunkAiExplanation(SourceConfidenceItem):
    explanation: str
    based_on: Literal["ai_answer", "user_input", "changed_files", "commit_metadata"]
    is_inferred: bool = False


class ChunkDirection(SourceConfidenceItem):
    content: str
    reason: str | None = None


class ChunkImplementationSignal(SourceConfidenceItem):
    content: str
    based_on: Literal["changed_files", "commit_metadata", "ai_answer", "user_input"]


class ChunkImportantMemory(SourceConfidenceItem):
    content: str
    reason: str


class ChunkOpenQuestion(BaseModel):
    question: str
    source_event_ids: list[str] = Field(default_factory=list)


class ChunkUncertainty(BaseModel):
    content: str
    reason: str
    source_event_ids: list[str] = Field(default_factory=list)


class ChunkSummary(BaseModel):
    chunk_index: int = 1
    summary_level: Literal[1] = 1
    chunk_purpose: Literal["internal_summary"] = "internal_summary"
    source_event_ids: list[str] = Field(default_factory=list)
    main_topics: list[str] = Field(default_factory=list)
    user_intents: list[ChunkUserIntent] = Field(default_factory=list)
    ai_explanations: list[ChunkAiExplanation] = Field(default_factory=list)
    decisions_or_directions: list[ChunkDirection] = Field(default_factory=list)
    rejected_directions: list[ChunkDirection] = Field(default_factory=list)
    implementation_signals: list[ChunkImplementationSignal] = Field(default_factory=list)
    important_for_project_memory: list[ChunkImportantMemory] = Field(default_factory=list)
    open_questions: list[ChunkOpenQuestion] = Field(default_factory=list)
    uncertainties: list[ChunkUncertainty] = Field(default_factory=list)
    handoff_summary_for_second_pass: str


class DraftDecision(BaseModel):
    decision: str
    reason: str
    source_event_ids: list[str] = Field(default_factory=list)
    source_chunk_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0, le=1)


class DraftRejectedDirection(BaseModel):
    content: str
    reason: str | None = None
    source_event_ids: list[str] = Field(default_factory=list)
    source_chunk_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0, le=1)


class DraftOpenQuestion(BaseModel):
    question: str
    source_event_ids: list[str] = Field(default_factory=list)
    source_chunk_ids: list[str] = Field(default_factory=list)


class MemoryDraftDetails(BaseModel):
    problem: str | None = None
    why_started: str | None = None
    what_happened: list[str] = Field(default_factory=list)
    decisions: list[DraftDecision] = Field(default_factory=list)
    rejected_directions: list[DraftRejectedDirection] = Field(default_factory=list)
    open_questions: list[DraftOpenQuestion] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)


class MemoryDraftEvidence(BaseModel):
    source_event_ids: list[str] = Field(default_factory=list)
    source_chunk_ids: list[str] = Field(default_factory=list)
    based_on: list[
        Literal[
            "chunk_summary",
            "remaining_event_preview",
            "paired_ai_output",
            "changed_files",
            "commit_metadata",
            "user_direction",
        ]
    ] = Field(default_factory=lambda: ["chunk_summary"])


class MemoryDraftItem(BaseModel):
    type: Literal["work_log", "thinking_note", "decision_note", "issue_note", "process_note"]
    title: str
    summary: str
    why_it_matters: str
    details: MemoryDraftDetails
    evidence: MemoryDraftEvidence
    confidence: float = Field(default=0.5, ge=0, le=1)
    needs_user_verification: bool = False
    suggested_user_action: Literal["save", "edit", "ignore"]


class DraftOverallUncertainty(BaseModel):
    content: str
    reason: str
    source_event_ids: list[str] = Field(default_factory=list)
    source_chunk_ids: list[str] = Field(default_factory=list)


class MemoryDraftGeneration(BaseModel):
    summary_level: Literal[2] = 2
    draft_generation_reason: str
    source_chunk_ids: list[str] = Field(default_factory=list)
    source_event_ids: list[str] = Field(default_factory=list)
    memory_drafts: list[MemoryDraftItem] = Field(default_factory=list)
    overall_uncertainties: list[DraftOverallUncertainty] = Field(default_factory=list)


class ProjectMemoryDecision(BaseModel):
    decision: str
    reason: str
    source_memory_ids: list[str] = Field(default_factory=list)


class ProjectMemoryRejectedDirection(BaseModel):
    direction: str
    reason: str
    source_memory_ids: list[str] = Field(default_factory=list)


class ProjectMemorySections(BaseModel):
    product_goal: str = ""
    current_direction: str = ""
    core_workflow: list[str] = Field(default_factory=list)
    important_decisions: list[ProjectMemoryDecision] = Field(default_factory=list)
    rejected_directions: list[ProjectMemoryRejectedDirection] = Field(default_factory=list)
    technical_assumptions: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    instructions_for_future_ai_agents: list[str] = Field(default_factory=list)


class ProjectMemorySnapshot(BaseModel):
    snapshot_type: Literal["project_memory"] = "project_memory"
    source_memory_ids: list[str] = Field(default_factory=list)
    body_markdown: str
    sections: ProjectMemorySections
    confidence: float = Field(default=0.5, ge=0, le=1)
    warnings: list[str] = Field(default_factory=list)

    @validator("body_markdown")
    def require_body(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("body_markdown must not be empty")
        return value
