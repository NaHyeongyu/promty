from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import NAMESPACE_DNS, UUID, uuid5

from sqlalchemy import desc, select
from sqlalchemy.orm import Session as DBSession

from app.models.events import Event
from app.models.projects import Project
from app.models.sessions import Session
from app.models.users import User
from app.schemas.events import EventCreate, EventRead
from app.services.event_payload_security import (
    apply_event_storage_policy,
    decrypt_event_payload,
    encrypt_event_payload,
)
from app.services.memory.artifacts import generate_due_memory_artifacts_for_session
from app.services.projects.search import upsert_prompt_search_document
from app.services.projects.resources import sync_project_resources_from_event

SYSTEM_USER_ID = uuid5(NAMESPACE_DNS, "prompthub.system_user")


class EventIngestConflict(ValueError):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


def _dump_model(value):
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value.dict()


def _payload_value(event: EventCreate, key: str) -> str | None:
    payload = _dump_model(event.payload)
    value = payload.get(key)
    return value if isinstance(value, str) and value else None


def _project_name(event: EventCreate) -> str:
    cwd = _payload_value(event, "cwd")
    if cwd:
        return Path(cwd).name or str(event.project_id)
    return f"Project {str(event.project_id)[:8]}"


def _project_git_remote(event: EventCreate) -> str | None:
    return _payload_value(event, "github_url") or _payload_value(event, "git_remote")


def _ensure_system_user(db: DBSession) -> User:
    user = db.get(User, SYSTEM_USER_ID)
    if user is not None:
        return user

    user = User(
        id=SYSTEM_USER_ID,
        github_id="system",
        email="system@prompthub.local",
        username="system",
        avatar_url=None,
    )
    db.add(user)
    db.flush()
    return user


def _ensure_project_owner(project: Project, owner: User | None) -> None:
    if owner is None:
        return
    if project.owner_id == owner.id:
        return
    if project.owner_id == SYSTEM_USER_ID:
        project.owner_id = owner.id
        return
    raise EventIngestConflict("Event project_id belongs to a different user")


def _ensure_project(db: DBSession, event: EventCreate, owner: User | None = None) -> Project:
    project = db.get(Project, event.project_id)
    if project is not None:
        _ensure_project_owner(project, owner)
        git_remote = _project_git_remote(event)
        if git_remote and not project.git_remote:
            project.git_remote = git_remote
        return project

    project_owner = owner or _ensure_system_user(db)
    branch = _payload_value(event, "branch") or "main"
    project = Project(
        id=event.project_id,
        owner_id=project_owner.id,
        name=_project_name(event),
        slug=f"project-{str(event.project_id)[:8]}",
        description=None,
        visibility="private",
        git_remote=_project_git_remote(event),
        local_path_hash=None,
        default_branch=branch,
    )
    db.add(project)
    db.flush()
    return project


def _ensure_session(db: DBSession, event: EventCreate, owner: User | None = None) -> Session:
    session = db.get(Session, event.session_id)
    if session is not None:
        if session.project_id != event.project_id:
            raise EventIngestConflict(
                "Event session_id belongs to a different project_id"
            )
        project = db.get(Project, event.project_id)
        if project is None:
            raise EventIngestConflict("Event project_id does not exist")
        _ensure_project_owner(project, owner)
        _apply_session_metadata(session, event)
        return session

    project = _ensure_project(db, event, owner)
    session = Session(
        id=event.session_id,
        project_id=project.id,
        device_id=None,
        tool=event.tool,
        tool_version=None,
        model=_payload_value(event, "model"),
        cwd=_payload_value(event, "cwd"),
        branch=_payload_value(event, "branch"),
        started_at=event.timestamp,
        ended_at=None,
    )
    _apply_session_metadata(session, event)
    db.add(session)
    db.flush()
    return session


def _apply_session_metadata(session: Session, event: EventCreate) -> None:
    model = _payload_value(event, "model")
    cwd = _payload_value(event, "cwd")
    branch = _payload_value(event, "branch")

    if model and not session.model:
        session.model = model
    if cwd and not session.cwd:
        session.cwd = cwd
    if branch and not session.branch:
        session.branch = branch
    if event.event_type == "SessionEnded":
        session.ended_at = event.timestamp


def _to_read_model(event: Event) -> EventRead:
    return EventRead(
        id=event.id,
        schema_version=event.schema_version,
        project_id=event.project_id,
        session_id=event.session_id,
        sequence=event.sequence,
        tool=event.tool,
        event_type=event.event_type,
        timestamp=event.created_at,
        payload=decrypt_event_payload(event.event_type, event.payload),
    )


def _event_values(event: EventCreate, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "project_id": event.project_id,
        "session_id": event.session_id,
        "sequence": event.sequence,
        "schema_version": event.schema_version,
        "tool": event.tool,
        "event_type": event.event_type,
        "payload": payload,
        "created_at": event.timestamp,
    }


def _stored_event_values(event: Event) -> dict[str, Any]:
    payload = apply_event_storage_policy(
        event.event_type,
        decrypt_event_payload(event.event_type, event.payload),
    )
    return {
        "project_id": event.project_id,
        "session_id": event.session_id,
        "sequence": event.sequence,
        "schema_version": event.schema_version,
        "tool": event.tool,
        "event_type": event.event_type,
        "payload": payload,
        "created_at": event.created_at,
    }


def _ensure_replayed_event_matches(
    existing: Event,
    incoming: EventCreate,
    payload: dict[str, Any],
) -> None:
    if _stored_event_values(existing) == _event_values(incoming, payload):
        return

    raise EventIngestConflict("Event id already exists with different content")


def _ensure_sequence_available(db: DBSession, event: EventCreate) -> None:
    existing = db.execute(
        select(Event.id).where(
            Event.project_id == event.project_id,
            Event.session_id == event.session_id,
            Event.sequence == event.sequence,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise EventIngestConflict(
            "Event sequence already exists for this project_id/session_id"
        )


def add_events(
    db: DBSession,
    events: list[EventCreate],
    *,
    owner: User | None = None,
) -> list[str]:
    event_ids: list[str] = []
    touched_session_ids: set[UUID] = set()

    for event in events:
        payload = apply_event_storage_policy(event.event_type, _dump_model(event.payload))
        storage_payload = encrypt_event_payload(event.event_type, payload)
        existing = db.get(Event, event.id)

        if existing is not None:
            _ensure_replayed_event_matches(existing, event, payload)
            upsert_prompt_search_document(db, existing, payload)
            event_ids.append(str(event.id))
            continue

        _ensure_sequence_available(db, event)
        session = _ensure_session(db, event, owner)
        event_row = Event(
            id=event.id,
            project_id=event.project_id,
            session_id=event.session_id,
            sequence=event.sequence,
            schema_version=event.schema_version,
            tool=event.tool,
            event_type=event.event_type,
            payload=storage_payload,
            created_at=event.timestamp,
        )
        db.add(event_row)
        db.flush()
        upsert_prompt_search_document(db, event_row, payload)
        sync_project_resources_from_event(db, event_row, payload)
        if event.session_id is not None:
            touched_session_ids.add(event.session_id)

        event_ids.append(str(event.id))

    for session_id in touched_session_ids:
        session = db.get(Session, session_id)
        if session is None:
            continue
        generate_due_memory_artifacts_for_session(
            db,
            session,
            finalize=session.ended_at is not None,
        )

    return event_ids


def list_recent_events(
    db: DBSession,
    *,
    owner: User,
    project_id: UUID | None = None,
    session_id: UUID | None = None,
    event_type: str | None = None,
    limit: int = 100,
) -> list[EventRead]:
    query = select(Event).join(Project, Event.project_id == Project.id).where(
        Project.owner_id == owner.id
    )
    if project_id is not None:
        query = query.where(Event.project_id == project_id)
    if session_id is not None:
        query = query.where(Event.session_id == session_id)
    if event_type is not None:
        query = query.where(Event.event_type == event_type)

    rows = db.execute(
        query.order_by(desc(Event.created_at), desc(Event.sequence)).limit(limit)
    ).scalars()
    return [_to_read_model(event) for event in rows]
