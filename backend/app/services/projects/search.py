from __future__ import annotations

import hashlib
import hmac
import re
from collections.abc import Iterable
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utc_now
from app.models.events import Event
from app.models.prompt_search_documents import PromptSearchDocument
from app.services.projects.activity import iso, payload_model, payload_prompt

PROMPT_SEARCH_PURPOSE = "prompthub:prompt-search:v1"
SEARCH_TERM_RE = re.compile(
    r"[0-9a-z\u3040-\u30ff\u3400-\u9fff\uac00-\ud7a3]{2,}",
    re.IGNORECASE,
)
MIN_TERM_CHARS = 2
PREFIX_TOKEN_CHARS = 2
NGRAM_SIZE = 3
MAX_TERM_CHARS = 80
MAX_INDEX_HASHES = 1024
MAX_QUERY_HASHES = 64
HASH_HEX_CHARS = 32


class PromptSearchConfigurationError(RuntimeError):
    pass


def _search_secret() -> str:
    secret = (
        settings.app_encryption_key
        or settings.jwt_secret
        or settings.oauth_state_secret
        or settings.api_token
    )
    if not secret:
        raise PromptSearchConfigurationError("Prompt search token key is not configured")
    return secret


def _hash_token(token: str) -> str:
    digest = hmac.new(
        _search_secret().encode("utf-8"),
        f"{PROMPT_SEARCH_PURPOSE}:{token}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return digest[:HASH_HEX_CHARS]


def _terms(value: str) -> list[str]:
    normalized = value.casefold()
    return [match.group(0)[:MAX_TERM_CHARS] for match in SEARCH_TERM_RE.finditer(normalized)]


def _index_variants(term: str) -> list[str]:
    variants: list[str] = [term]
    if len(term) >= PREFIX_TOKEN_CHARS:
        variants.append(term[:PREFIX_TOKEN_CHARS])
    if len(term) >= NGRAM_SIZE:
        variants.extend(
            term[index : index + NGRAM_SIZE] for index in range(0, len(term) - NGRAM_SIZE + 1)
        )
    return variants


def _query_variants(term: str) -> list[str]:
    if len(term) <= NGRAM_SIZE:
        return [term]
    return [term[index : index + NGRAM_SIZE] for index in range(0, len(term) - NGRAM_SIZE + 1)]


def _dedupe_limited(values: list[str], limit: int) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
        if len(deduped) >= limit:
            break
    return deduped


def prompt_search_hashes_for_text(value: str) -> list[str]:
    variants: list[str] = []
    for term in _terms(value):
        variants.extend(_index_variants(term))
        if len(variants) >= MAX_INDEX_HASHES:
            break
    return sorted(_hash_token(token) for token in _dedupe_limited(variants, MAX_INDEX_HASHES))


def prompt_search_hashes_for_query(value: str) -> list[str]:
    variants: list[str] = []
    for term in _terms(value):
        variants.extend(_query_variants(term))
        if len(variants) >= MAX_QUERY_HASHES:
            break
    return sorted(_hash_token(token) for token in _dedupe_limited(variants, MAX_QUERY_HASHES))


def prompt_search_text(event: Event, payload: dict[str, Any]) -> str:
    return " ".join(
        [
            payload_prompt(payload),
            payload_model(payload, event.tool),
            event.tool,
            str(event.sequence),
            str(event.session_id),
            iso(event.created_at) or "",
        ]
    )


def upsert_prompt_search_document(
    db: Session,
    event: Event,
    payload: dict[str, Any],
) -> None:
    upsert_prompt_search_documents(db, ((event, payload),))


def upsert_prompt_search_documents(
    db: Session,
    event_payloads: Iterable[tuple[Event, dict[str, Any]]],
) -> None:
    prompt_events: dict[Any, tuple[Event, dict[str, Any]]] = {}
    for event, payload in event_payloads:
        if event.event_type == "PromptSubmitted":
            prompt_events.setdefault(event.id, (event, payload))

    if not prompt_events:
        return

    documents_by_event_id = {
        document.prompt_event_id: document
        for document in db.scalars(
            select(PromptSearchDocument).where(
                PromptSearchDocument.prompt_event_id.in_(prompt_events),
            )
        )
    }
    for event, payload in prompt_events.values():
        token_hashes = prompt_search_hashes_for_text(prompt_search_text(event, payload))
        document = documents_by_event_id.get(event.id)
        if document is None:
            document = PromptSearchDocument(
                project_id=event.project_id,
                session_id=event.session_id,
                prompt_event_id=event.id,
                token_hashes=token_hashes,
            )
            db.add(document)
            documents_by_event_id[event.id] = document
            continue

        document.project_id = event.project_id
        document.session_id = event.session_id
        document.token_hashes = token_hashes
        document.updated_at = utc_now()
