from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from adapters import normalize_collector_event
from events import SUPPORTED_EVENT_TYPES, TOOL_ALIASES, normalize_event_type, normalize_tool
from sequence import SequenceStore
from uploader.client import PromptHubUploader
from uploader.queue import JSONLQueue


def _read_stdin_json() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("Expected hook JSON on stdin")

    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("Expected hook JSON object on stdin")
    return payload


def capture_raw(args: argparse.Namespace) -> int:
    payload = _read_stdin_json()
    output_path = Path(args.output).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2, sort_keys=True)
        file.write("\n")
    return 0


def capture(args: argparse.Namespace) -> int:
    payload = _read_stdin_json()
    tool = args.tool or args.source
    if not tool:
        raise ValueError("Expected --tool")
    event_type = normalize_event_type(args.event_type) if args.event_type else None
    event = normalize_collector_event(normalize_tool(tool), payload, event_type)
    SequenceStore(args.sequence_path).assign(event)
    JSONLQueue(args.queue_path).push(event)
    return 0


def upload(args: argparse.Namespace) -> int:
    queue = JSONLQueue(args.queue_path)
    events = queue.read_batch(args.limit)
    if not events:
        print("No events queued")
        return 0

    uploader = PromptHubUploader(
        api_url=args.api_url,
        token=args.token,
        timeout=args.timeout,
    )
    uploaded_ids = uploader.upload_events(events)
    queue.ack(set(uploaded_ids))
    print(f"Uploaded {len(uploaded_ids)} events")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="prompthub-collector")
    subparsers = parser.add_subparsers(dest="command", required=True)

    capture_parser = subparsers.add_parser("capture")
    capture_parser.add_argument(
        "--tool",
        choices=sorted(TOOL_ALIASES),
        help="AI tool that produced the hook payload",
    )
    capture_parser.add_argument(
        "--source",
        choices=("claude", "codex"),
        help="Deprecated alias for --tool",
    )
    capture_parser.add_argument(
        "--event-type",
        choices=SUPPORTED_EVENT_TYPES,
        help="PromptHub event type. Defaults to payload event_type or PromptSubmitted.",
    )
    capture_parser.add_argument("--queue-path")
    capture_parser.add_argument("--sequence-path")
    capture_parser.set_defaults(func=capture)

    capture_raw_parser = subparsers.add_parser("capture-raw")
    capture_raw_parser.add_argument(
        "--output",
        default="docs/real-codex-payload.json",
        help="Path where the raw hook JSON should be written.",
    )
    capture_raw_parser.set_defaults(func=capture_raw)

    upload_parser = subparsers.add_parser("upload")
    upload_parser.add_argument(
        "--api-url",
        default=os.environ.get("PROMPTHUB_API_URL", "http://localhost:8000"),
    )
    upload_parser.add_argument("--token", default=os.environ.get("PROMPTHUB_API_TOKEN"))
    upload_parser.add_argument("--queue-path")
    upload_parser.add_argument("--limit", type=int, default=100)
    upload_parser.add_argument("--timeout", type=float, default=10)
    upload_parser.set_defaults(func=upload)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except Exception as exc:
        print(f"prompthub collector error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
