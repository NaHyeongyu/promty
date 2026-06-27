from __future__ import annotations

from pathlib import Path
from uuid import NAMESPACE_DNS, UUID, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.models.events import Event
from app.models.projects import Project
from app.models.sessions import Session
from app.models.users import User
from app.schemas.events import EventCreate, EventRead

SYSTEM_USER_ID = uuid5(NAMESPACE_DNS, "prompthub.system_user")


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


def _ensure_project(db: DBSession, event: EventCreate) -> Project:
    project = db.get(Project, event.project_id)
    if project is not None:
        return project

    owner = _ensure_system_user(db)
    branch = _payload_value(event, "branch") or "main"
    project = Project(
        id=event.project_id,
        owner_id=owner.id,
        name=_project_name(event),
        slug=f"project-{str(event.project_id)[:8]}",
        description=None,
        visibility="private",
        git_remote=None,
        local_path_hash=None,
        default_branch=branch,
    )
    db.add(project)
    db.flush()
    return project


def _ensure_session(db: DBSession, event: EventCreate) -> Session:
    session = db.get(Session, event.session_id)
    if session is not None:
        _apply_session_metadata(session, event)
        return session

    project = _ensure_project(db, event)
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
        payload=event.payload,
    )


def add_events(db: DBSession, events: list[EventCreate]) -> list[str]:
    event_ids: list[str] = []

    for event in events:
        _ensure_session(db, event)
        payload = _dump_model(event.payload)
        existing = db.get(Event, event.id)

        if existing is None:
            db.add(
                Event(
                    id=event.id,
                    project_id=event.project_id,
                    session_id=event.session_id,
                    sequence=event.sequence,
                    schema_version=event.schema_version,
                    tool=event.tool,
                    event_type=event.event_type,
                    payload=payload,
                    created_at=event.timestamp,
                )
            )
        else:
            existing.project_id = event.project_id
            existing.session_id = event.session_id
            existing.sequence = event.sequence
            existing.schema_version = event.schema_version
            existing.tool = event.tool
            existing.event_type = event.event_type
            existing.payload = payload
            existing.created_at = event.timestamp

        event_ids.append(str(event.id))

    db.commit()
    return event_ids


def list_recent_events(db: DBSession, limit: int = 100) -> list[EventRead]:
    rows = db.execute(
        select(Event)
        .order_by(Event.project_id, Event.session_id, Event.sequence)
        .limit(limit)
    ).scalars()
    return [_to_read_model(event) for event in rows]
