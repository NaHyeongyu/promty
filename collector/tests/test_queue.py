from __future__ import annotations

from pathlib import Path

from events import BaseEvent, PromptSubmittedPayload
from uploader.queue import JSONLQueue


def _event(sequence: int) -> BaseEvent:
    return BaseEvent(
        id=f"00000000-0000-4000-8000-{sequence:012d}",
        project_id="00000000-0000-4000-8000-000000000001",
        session_id="00000000-0000-4000-8000-000000000002",
        sequence=sequence,
        tool="codex-cli",
        event_type="PromptSubmitted",
        timestamp="2026-07-12T00:00:00+00:00",
        payload=PromptSubmittedPayload(prompt=f"prompt {sequence}"),
    )


def test_queue_round_trip_and_acknowledgement(tmp_path: Path) -> None:
    queue = JSONLQueue(tmp_path / "events.jsonl")
    queue.push(_event(1))
    queue.push(_event(2))

    batch = queue.read_batch(10)
    assert [event["sequence"] for event in batch] == [1, 2]

    queue.ack({batch[0]["id"]})
    assert [event["sequence"] for event in queue.read_batch(10)] == [2]
