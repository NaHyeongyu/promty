from __future__ import annotations

from uuid import uuid4
from app.models.tokens import CollectorToken
from app.models.users import User
from app.services.account_settings import (
    account_overview_response,
    create_collector_token_response,
    update_account_preferences_response,
)


def test_account_routes_publish_response_contracts() -> None:
    from app.main import app

    schema = app.openapi()
    paths = schema["paths"]

    assert paths["/api/account/overview"]["get"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]["$ref"].endswith("AccountOverviewResponse")
    assert paths["/api/account/collector-tokens"]["post"]["responses"]["200"][
        "content"
    ]["application/json"]["schema"]["$ref"].endswith("CollectorTokenCreateResponse")


class FakeScalarResult:
    def __init__(self, items: list[object]) -> None:
        self.items = items

    def all(self) -> list[object]:
        return self.items


class FakeSession:
    def __init__(
        self,
        *,
        tokens: list[CollectorToken] | None = None,
    ) -> None:
        self.tokens = tokens or []

    def add(self, item: object) -> None:
        if isinstance(item, CollectorToken):
            self.tokens.append(item)

    def flush(self) -> None:
        return None

    def get(self, model: type[CollectorToken], item_id: object) -> CollectorToken | None:
        if model is not CollectorToken:
            return None
        return next((token for token in self.tokens if token.id == item_id), None)

    def scalar(self, _statement: object) -> None:
        return None

    def scalars(self, _statement: object) -> FakeScalarResult:
        return FakeScalarResult(self.tokens)


def _user() -> User:
    return User(
        email="member@example.com",
        github_id="github-member",
        id=uuid4(),
        username="member",
    )


def test_create_collector_token_response_returns_secret_once() -> None:
    user = _user()
    db = FakeSession()

    response = create_collector_token_response(db, name="Local laptop", user=user)

    assert response["token"].startswith("ph_")
    assert response["collector_token"]["name"] == "Local laptop"
    assert response["collector_token"]["status"] == "active"
    assert len(db.tokens) == 1
    assert db.tokens[0].token_hash != response["token"]


def test_account_overview_response_includes_connection_and_tokens() -> None:
    user = _user()
    db = FakeSession(
        tokens=[
            CollectorToken(
                id=uuid4(),
                name="Local laptop",
                token_hash="hash",
                user_id=user.id,
            )
        ]
    )

    response = account_overview_response(db, user=user)

    assert response["user"]["id"] == str(user.id)
    assert response["user"]["preferred_locale"] == "en"
    assert response["github_connection"]["connected"] is False
    assert response["collector_tokens"][0]["name"] == "Local laptop"


def test_account_language_preference_is_saved() -> None:
    user = _user()
    db = FakeSession()

    response = update_account_preferences_response(
        db,
        preferred_locale="ko",
        user=user,
    )

    assert response == {"preferred_locale": "ko"}
    assert user.preferred_locale == "ko"
