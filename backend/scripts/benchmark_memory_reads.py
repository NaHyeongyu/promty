from __future__ import annotations

import argparse
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import Integer, cast, desc, insert, select, text

from app.db.session import SessionLocal
from app.models.artifacts import Artifact
from app.models.projects import Project
from app.models.sessions import Session
from app.models.users import User
from app.services.memory.constants import (
    MEMORY_ARTIFACT_TYPE,
    MEMORY_DRAFT_ARTIFACT_TYPE,
    MEMORY_WINDOW_STRATEGY,
    PENDING_DRAFT_STAGE,
    REVIEW_STATE_GENERATED,
)


def _artifact_values(
    *,
    created_at: datetime,
    index: int,
    project_id,
    session_id,
) -> list[dict]:
    common = {
        "changed_files": [],
        "created_at": created_at,
        "generator": "benchmark",
        "id": uuid4(),
        "metadata_": {},
        "project_id": project_id,
        "prompt_event_ids": [],
        "schema_version": 1,
        "sections": [],
        "session_id": session_id,
        "summary": "Synthetic rollback-only benchmark row.",
        "tags": [],
        "technologies": [],
        "title": f"Benchmark {index}",
        "updated_at": created_at,
    }
    return [
        {
            **common,
            "id": uuid4(),
            "metadata_": {
                "artifact_stage": PENDING_DRAFT_STAGE,
                "end_sequence": index * 10,
                "memory_strategy": MEMORY_WINDOW_STRATEGY,
                "review_state": "draft",
                "slice_index": index,
            },
            "storage_key": f"benchmark/slice/{index}",
            "type": MEMORY_DRAFT_ARTIFACT_TYPE,
        },
        {
            **common,
            "id": uuid4(),
            "metadata_": {
                "artifact_stage": ("generated_memory" if index % 10 == 0 else "internal_chunk"),
                "review_state": REVIEW_STATE_GENERATED,
            },
            "storage_key": f"benchmark/generated/{index}",
            "type": MEMORY_ARTIFACT_TYPE,
        },
    ]


def _explain(db, statement) -> list[str]:
    compiled = statement.compile(
        dialect=db.bind.dialect,
        compile_kwargs={"literal_binds": True},
    )
    return list(db.execute(text(f"EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) {compiled}")).scalars())


def run(rows: int) -> None:
    db = SessionLocal()
    try:
        now = datetime.now(UTC)
        marker = str(uuid4())
        user = User(
            github_id=f"memory-benchmark-{marker}",
            email=f"memory-benchmark-{marker}@example.com",
            username=f"memory-benchmark-{marker}",
        )
        project = Project(
            owner=user,
            name="Rollback-only memory benchmark",
            slug=f"memory-benchmark-{marker}",
            visibility="private",
            default_branch="main",
        )
        session = Session(
            project=project,
            tool="codex-cli",
            started_at=now,
        )
        db.add_all((user, project, session))
        db.flush()

        batch: list[dict] = []
        for index in range(1, rows + 1):
            batch.extend(
                _artifact_values(
                    created_at=now + timedelta(microseconds=index),
                    index=index,
                    project_id=project.id,
                    session_id=session.id,
                )
            )
            if len(batch) >= 1_000:
                db.execute(insert(Artifact), batch)
                batch.clear()
        if batch:
            db.execute(insert(Artifact), batch)
        db.flush()

        # Synthetic rows are intentionally rolled back. Disabling sequential
        # scans and explicit sorts demonstrates that each exact query predicate
        # and ordering are compatible with its checked-in partial index without
        # persisting misleading ANALYZE stats.
        db.execute(text("SET LOCAL enable_seqscan = off"))
        db.execute(text("SET LOCAL enable_sort = off"))
        end_sequence_column = cast(Artifact.metadata_["end_sequence"].astext, Integer)
        slice_runtime_state = (
            select(
                end_sequence_column,
                cast(Artifact.metadata_["slice_index"].astext, Integer),
                cast(
                    Artifact.metadata_["materialization_end_sequence"].astext,
                    Integer,
                ),
                Artifact.metadata_["memory_resume_required"].astext == "true",
            )
            .where(
                Artifact.project_id == project.id,
                Artifact.session_id == session.id,
                Artifact.type == MEMORY_DRAFT_ARTIFACT_TYPE,
                Artifact.metadata_["artifact_stage"].astext == PENDING_DRAFT_STAGE,
                Artifact.metadata_["memory_strategy"].astext == MEMORY_WINDOW_STRATEGY,
                end_sequence_column.is_not(None),
            )
            .order_by(desc(end_sequence_column))
            .limit(1)
        )
        memory_list = (
            select(Artifact.id, Artifact.title, Artifact.updated_at)
            .where(
                Artifact.project_id == project.id,
                Artifact.type == MEMORY_ARTIFACT_TYPE,
                Artifact.metadata_["review_state"].astext.in_(["generated", "verified"]),
                Artifact.metadata_["artifact_stage"].astext.in_(
                    ["generated_memory", "verified_memory"]
                ),
            )
            .order_by(desc(Artifact.updated_at), desc(Artifact.created_at), desc(Artifact.id))
            .limit(20)
        )

        print(f"synthetic_artifacts={rows * 2} persisted=false")
        print("memory_slice_runtime_state:")
        print("\n".join(_explain(db, slice_runtime_state)))
        print("memory_list:")
        print("\n".join(_explain(db, memory_list)))
    finally:
        db.rollback()
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rollback-only EXPLAIN benchmark for Project Memory read indexes."
    )
    parser.add_argument("--rows", type=int, default=5_000)
    args = parser.parse_args()
    if args.rows < 1:
        parser.error("--rows must be positive")
    run(args.rows)


if __name__ == "__main__":
    main()
