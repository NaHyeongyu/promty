from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.encryption import maybe_decrypt_app_text_from_string
from app.models.code_change_patches import CodeChangePatch
from app.models.events import Event
from app.services.event_payload_security import (
    CODE_CHANGE_PATCH_PURPOSE,
)

TOOL_LABELS = {
    "claude-code": "Claude Code",
    "codex-cli": "Codex",
    "cursor": "Cursor",
    "gemini-cli": "Gemini CLI",
}
TOOL_MODEL_ALIASES = {
    "claude code",
    "claude-code",
    "codex",
    "codex-cli",
    "cursor",
    "gemini cli",
    "gemini-cli",
}


def iso(value: Any) -> str | None:
    return value.isoformat() if value else None


def string_or_none(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def first_int(*values: Any) -> int | None:
    for value in values:
        if isinstance(value, int):
            return value
    return None


def tool_label(tool: str | None) -> str | None:
    if tool is None:
        return None
    return TOOL_LABELS.get(tool, tool)


def model_name(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    model = value.strip()
    if not model or model.lower() in TOOL_MODEL_ALIASES:
        return None
    return model


def payload_model(payload: dict[str, Any], tool: str) -> str:
    return model_name(payload.get("model")) or tool_label(tool) or tool


def payload_prompt(payload: dict[str, Any]) -> str:
    prompt = payload.get("prompt")
    if isinstance(prompt, str) and prompt.strip():
        return prompt.strip()
    return "Untitled prompt"


def event_sort_key(event: Event) -> tuple[datetime, int]:
    return event.created_at, event.sequence


def file_changes_from_files_changed(payload: dict[str, Any]) -> list[dict[str, Any]]:
    changes = payload.get("changes")
    if isinstance(changes, list):
        file_changes: list[dict[str, Any]] = []
        for change in changes:
            if not isinstance(change, dict):
                continue
            path = change.get("path")
            if not isinstance(path, str) or not path:
                continue
            file_changes.append(
                {
                    "additions": first_int(
                        change.get("additions"),
                        change.get("insertions_delta"),
                    ),
                    "binary": change.get("binary") is True,
                    "deletions": first_int(
                        change.get("deletions_delta"),
                        change.get("deletions"),
                    ),
                    "old_path": change.get("old_path")
                    if isinstance(change.get("old_path"), str)
                    else None,
                    "patch": change.get("patch") if isinstance(change.get("patch"), str) else None,
                    "patch_omitted_reason": change.get("patch_omitted_reason")
                    if isinstance(change.get("patch_omitted_reason"), str)
                    else None,
                    "patch_truncated": change.get("patch_truncated") is True,
                    "path": path,
                    "status": change.get("status")
                    if isinstance(change.get("status"), str)
                    else "changed",
                }
            )
        if file_changes:
            return file_changes

    files = payload.get("files")
    if isinstance(files, list):
        return [
            {
                "additions": None,
                "deletions": None,
                "path": path,
                "status": "changed",
            }
            for path in files
            if isinstance(path, str) and path
        ]
    return []


def file_change_from_patch(patch: CodeChangePatch) -> dict[str, Any]:
    return {
        "additions": patch.additions,
        "binary": patch.binary,
        "deletions": patch.deletions,
        "event_id": str(patch.event_id),
        "old_path": patch.old_path,
        "patch": maybe_decrypt_app_text_from_string(
            patch.patch,
            purpose=CODE_CHANGE_PATCH_PURPOSE,
        ),
        "patch_omitted_reason": patch.metadata_.get("patch_omitted_reason")
        if isinstance(patch.metadata_, dict)
        else None,
        "patch_truncated": patch.patch_truncated,
        "path": patch.path,
        "status": patch.status,
    }


def response_payloads_by_prompt(
    events: Iterable[Event],
    payloads: dict[UUID, dict[str, Any]],
) -> dict[str, tuple[Event, dict[str, Any]]]:
    prompt_responses: dict[str, tuple[Event, dict[str, Any]]] = {}
    prompt_by_session_turn: dict[tuple[UUID, str], str] = {}
    latest_prompt_by_session: dict[UUID, Event] = {}

    for event in sorted(events, key=event_sort_key):
        payload = payloads[event.id]
        if event.event_type == "PromptSubmitted":
            latest_prompt_by_session[event.session_id] = event
            turn_id = payload.get("turn_id")
            if turn_id is not None:
                prompt_by_session_turn[(event.session_id, str(turn_id))] = str(event.id)
            continue

        if event.event_type != "ResponseReceived":
            continue

        prompt_event_id = string_or_none(payload.get("prompt_event_id"))
        if prompt_event_id is None:
            turn_id = payload.get("turn_id")
            if turn_id is not None:
                prompt_event_id = prompt_by_session_turn.get((event.session_id, str(turn_id)))
        if prompt_event_id is None:
            prompt_event = latest_prompt_by_session.get(event.session_id)
            prompt_event_id = str(prompt_event.id) if prompt_event else None
        if prompt_event_id is not None:
            prompt_responses[prompt_event_id] = (event, payload)

    return prompt_responses


def patch_file_changes_by_prompt(
    db: Session,
    *,
    descending: bool = False,
    project_id: UUID,
    prompt_event_ids: Iterable[UUID],
) -> dict[str, list[dict[str, Any]]]:
    prompt_event_id_values = list(prompt_event_ids)
    if not prompt_event_id_values:
        return {}

    order_by = (
        CodeChangePatch.created_at.desc()
        if descending
        else CodeChangePatch.created_at
    )
    patch_rows = list(
        db.execute(
            select(CodeChangePatch)
            .where(
                CodeChangePatch.project_id == project_id,
                CodeChangePatch.prompt_event_id.in_(prompt_event_id_values),
            )
            .order_by(order_by, CodeChangePatch.path)
        ).scalars()
    )
    prompt_changes: dict[str, list[dict[str, Any]]] = {}
    for patch in patch_rows:
        if patch.prompt_event_id is None:
            continue
        prompt_changes.setdefault(str(patch.prompt_event_id), []).append(
            file_change_from_patch(patch)
        )
    return prompt_changes


def files_changed_by_prompt_from_events(
    events: Iterable[Event],
    payloads: dict[UUID, dict[str, Any]],
    *,
    existing_prompt_ids: set[str] | None = None,
    prompt_event_ids: set[str],
) -> dict[str, list[dict[str, Any]]]:
    existing = existing_prompt_ids or set()
    prompt_changes: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        if event.event_type != "FilesChanged":
            continue
        payload = payloads[event.id]
        prompt_event_id = payload.get("prompt_event_id")
        if (
            not isinstance(prompt_event_id, str)
            or prompt_event_id not in prompt_event_ids
            or prompt_event_id in existing
        ):
            continue
        prompt_changes.setdefault(prompt_event_id, []).extend(
            file_changes_from_files_changed(payload)
        )
    return prompt_changes


def format_response_summary(event: Event, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "response": string_or_none(payload.get("response")),
        "response_original_length": payload.get("response_original_length")
        if isinstance(payload.get("response_original_length"), int)
        else None,
        "response_received_at": iso(event.created_at),
        "response_source": string_or_none(payload.get("response_source")),
        "response_storage_limit": payload.get("response_storage_limit")
        if isinstance(payload.get("response_storage_limit"), int)
        else None,
        "response_truncated": payload.get("response_truncated") is True,
    }
