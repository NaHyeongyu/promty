from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.github_connections import GitHubConnection
from app.models.tokens import CollectorToken
from app.models.users import User
from app.schemas.admin import AdminConfirmationRequest
from app.services.admin.control_center import (
    disconnect_admin_github_response,
    revoke_admin_collector_token_response,
    revoke_all_admin_collector_tokens_response,
)


class FakeScalarResult:
    def __init__(self, items: list[object]) -> None:
        self.items = items

    def all(self) -> list[object]:
        return self.items


class FakeSession:
    def __init__(
        self,
        *,
        connection: GitHubConnection | None = None,
        tokens: list[CollectorToken] | None = None,
        user: User,
    ) -> None:
        self.connection = connection
        self.tokens = tokens or []
        self.user = user
        self.flushed = False

    def get(self, model: type[object], item_id: object) -> object | None:
        if model is User:
            return self.user if self.user.id == item_id else None
        if model is CollectorToken:
            return next((token for token in self.tokens if token.id == item_id), None)
        return None

    def scalar(self, _statement: object) -> GitHubConnection | None:
        return self.connection

    def scalars(self, _statement: object) -> FakeScalarResult:
        return FakeScalarResult([token for token in self.tokens if token.revoked_at is None])

    def flush(self) -> None:
        self.flushed = True


def _user() -> User:
    return User(
        email="managed@example.com",
        github_id="managed-github-id",
        id=uuid4(),
        username="managed-user",
    )


def test_admin_token_revocation_requires_exact_username_confirmation() -> None:
    user = _user()
    token = CollectorToken(
        id=uuid4(),
        name="Workstation",
        token_hash="hash",
        user_id=user.id,
    )
    db = FakeSession(tokens=[token], user=user)

    with pytest.raises(HTTPException) as exc_info:
        revoke_admin_collector_token_response(
            db,
            confirmation="wrong-user",
            token_id=token.id,
            user_id=user.id,
        )

    assert exc_info.value.status_code == 400
    assert token.revoked_at is None


def test_admin_can_revoke_one_or_all_active_collector_tokens() -> None:
    user = _user()
    first = CollectorToken(
        id=uuid4(),
        name="Laptop",
        token_hash="hash-one",
        user_id=user.id,
    )
    second = CollectorToken(
        id=uuid4(),
        name="Desktop",
        token_hash="hash-two",
        user_id=user.id,
    )
    db = FakeSession(tokens=[first, second], user=user)

    response = revoke_admin_collector_token_response(
        db,
        confirmation=user.username,
        token_id=first.id,
        user_id=user.id,
    )
    bulk_response = revoke_all_admin_collector_tokens_response(
        db,
        confirmation=user.username,
        user_id=user.id,
    )

    assert response["status"] == "revoked"
    assert bulk_response == {"revoked": 1, "user_id": str(user.id)}
    assert first.revoked_at is not None
    assert second.revoked_at is not None
    assert db.flushed is True


def test_admin_can_disconnect_github_without_deleting_identity() -> None:
    user = _user()
    connection = GitHubConnection(
        access_token_encrypted="encrypted",
        id=uuid4(),
        user_id=user.id,
    )
    db = FakeSession(connection=connection, user=user)

    response = disconnect_admin_github_response(
        db,
        confirmation=user.username,
        user_id=user.id,
    )

    assert response == {"disconnected": True, "user_id": str(user.id)}
    assert connection.revoked_at is not None
    assert db.flushed is True


def test_admin_routes_publish_control_center_contracts() -> None:
    from app.main import app

    paths = app.openapi()["paths"]

    assert "/api/admin/users" in paths
    assert "/api/admin/projects" in paths
    assert "/api/admin/jobs" in paths
    assert "/api/admin/events" in paths
    assert "/api/admin/system" in paths
    assert "/api/admin/audit-logs" in paths
    assert "post" in paths["/api/admin/projects"]
    assert set(paths["/api/admin/projects/{project_id}"]) == {"delete", "patch"}
    assert "delete" in paths["/api/admin/users/{user_id}"]
    assert "post" in paths["/api/admin/jobs/{batch_id}/cancel"]
    assert "post" in paths["/api/admin/jobs/{batch_id}/retry"]
    assert "post" in paths["/api/admin/exports/events"]
    revoke_operation = paths["/api/admin/users/{user_id}/collector-tokens/{token_id}/revoke"][
        "post"
    ]
    assert revoke_operation["requestBody"]["required"] is True


def test_admin_mutation_requests_reject_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        AdminConfirmationRequest.model_validate(
            {"confirmation": "managed-user", "confirmaton": "typo"}
        )
