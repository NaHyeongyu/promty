from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.core.config import settings
from app.core.encryption import encrypt_app_text, maybe_decrypt_app_text

PROMPT_TEXT_PURPOSE = "event.prompt"
RESPONSE_TEXT_PURPOSE = "event.response"
EVENT_PATCH_PURPOSE = "event.change.patch"
CODE_CHANGE_PATCH_PURPOSE = "code_change_patch.patch"
PROMPT_MAX_CHARS_FLOOR = 1


def _prompt_max_chars() -> int:
    return max(settings.prompt_max_chars, PROMPT_MAX_CHARS_FLOOR)


def _response_max_chars() -> int:
    return max(settings.response_max_chars, PROMPT_MAX_CHARS_FLOOR)


def apply_event_storage_policy(event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    prepared = deepcopy(payload)
    if event_type == "PromptSubmitted":
        _apply_text_policy(
            prepared,
            field="prompt",
            metadata_prefix="prompt",
            limit=_prompt_max_chars(),
        )
    if event_type == "ResponseReceived":
        _apply_text_policy(
            prepared,
            field="response",
            metadata_prefix="response",
            limit=_response_max_chars(),
        )
    return prepared


def encrypt_event_payload(event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    secured = deepcopy(payload)
    if event_type == "PromptSubmitted":
        prompt = secured.get("prompt")
        if isinstance(prompt, str):
            secured["prompt"] = encrypt_app_text(prompt, purpose=PROMPT_TEXT_PURPOSE)
    if event_type == "ResponseReceived":
        response = secured.get("response")
        if isinstance(response, str):
            secured["response"] = encrypt_app_text(response, purpose=RESPONSE_TEXT_PURPOSE)
    if event_type == "FilesChanged":
        _transform_change_patches(secured, encrypt=True)
    return secured


def decrypt_event_payload(event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    restored = deepcopy(payload)
    if event_type == "PromptSubmitted":
        prompt = maybe_decrypt_app_text(restored.get("prompt"), purpose=PROMPT_TEXT_PURPOSE)
        if prompt is not None:
            restored["prompt"] = prompt
    if event_type == "ResponseReceived":
        response = maybe_decrypt_app_text(
            restored.get("response"),
            purpose=RESPONSE_TEXT_PURPOSE,
        )
        if response is not None:
            restored["response"] = response
    if event_type == "FilesChanged":
        _transform_change_patches(restored, encrypt=False)
    return restored


def _apply_text_policy(
    payload: dict[str, Any],
    *,
    field: str,
    metadata_prefix: str,
    limit: int,
) -> None:
    text = payload.get(field)
    if not isinstance(text, str):
        return

    original_length_key = f"{metadata_prefix}_original_length"
    storage_limit_key = f"{metadata_prefix}_storage_limit"
    truncated_key = f"{metadata_prefix}_truncated"
    stored_original_length = payload.get(original_length_key)
    original_length = (
        stored_original_length if isinstance(stored_original_length, int) else len(text)
    )
    stored_truncated = payload.get(truncated_key) is True
    payload[original_length_key] = original_length
    payload[storage_limit_key] = limit
    payload[truncated_key] = (
        stored_truncated or original_length > limit or len(text) > limit
    )
    if len(text) > limit:
        payload[field] = text[:limit]


def _transform_change_patches(payload: dict[str, Any], *, encrypt: bool) -> None:
    changes = payload.get("changes")
    if not isinstance(changes, list):
        return

    for change in changes:
        if not isinstance(change, dict):
            continue
        patch = change.get("patch")
        if encrypt:
            if isinstance(patch, str) and patch:
                change["patch"] = encrypt_app_text(patch, purpose=EVENT_PATCH_PURPOSE)
            continue
        decrypted = maybe_decrypt_app_text(patch, purpose=EVENT_PATCH_PURPOSE)
        if decrypted is not None:
            change["patch"] = decrypted
