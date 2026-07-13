from __future__ import annotations

from pathlib import Path
from argparse import Namespace

from cli import _push_captured_event
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


def test_captured_event_is_mirrored_with_the_same_identity(tmp_path: Path) -> None:
    primary_path = tmp_path / "dev-events.jsonl"
    mirror_path = tmp_path / "prod-events.jsonl"
    event = _event(1)

    _push_captured_event(
        Namespace(
            queue_path=str(primary_path),
            mirror_queue_paths=[str(mirror_path)],
        ),
        event,
    )

    primary = JSONLQueue(primary_path).read_batch(10)
    mirror = JSONLQueue(mirror_path).read_batch(10)
    assert primary == mirror
    assert primary[0]["id"] == event.id

    JSONLQueue(primary_path).ack({event.id})
    assert JSONLQueue(primary_path).read_batch(10) == []
    assert JSONLQueue(mirror_path).read_batch(10) == mirror
