from __future__ import annotations

import os
from dataclasses import dataclass, field


def _optional_env(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None or not value.strip():
        return None
    return value


def _csv_env(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    value = os.environ.get(name)
    if value is None:
        return default

    parsed = tuple(item.strip() for item in value.split(",") if item.strip())
    return parsed or default


def _bool_env(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int_env(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    database_url: str = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg://prompthub:prompthub@localhost:5432/prompthub",
    )
    api_public_url: str = os.environ.get("PROMPTHUB_API_PUBLIC_URL", "http://127.0.0.1:8011")
    app_url: str = os.environ.get("PROMPTHUB_APP_URL", "http://127.0.0.1:5173")
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: _csv_env(
            "PROMPTHUB_CORS_ORIGINS",
            ("http://127.0.0.1:5173", "http://localhost:5173"),
        )
    )
    api_token: str | None = field(default_factory=lambda: _optional_env("PROMPTHUB_API_TOKEN"))
    github_client_id: str | None = field(
        default_factory=lambda: _optional_env("PROMPTHUB_GITHUB_CLIENT_ID")
    )
    github_client_secret: str | None = field(
        default_factory=lambda: _optional_env("PROMPTHUB_GITHUB_CLIENT_SECRET")
    )
    github_token_encryption_key: str | None = field(
        default_factory=lambda: _optional_env("PROMPTHUB_GITHUB_TOKEN_ENCRYPTION_KEY")
    )
    oauth_state_secret: str | None = field(
        default_factory=lambda: _optional_env("PROMPTHUB_OAUTH_STATE_SECRET")
    )
    jwt_secret: str | None = field(default_factory=lambda: _optional_env("PROMPTHUB_JWT_SECRET"))
    jwt_issuer: str = os.environ.get("PROMPTHUB_JWT_ISSUER", "prompthub")
    jwt_audience: str = os.environ.get("PROMPTHUB_JWT_AUDIENCE", "prompthub-web")
    access_token_ttl_seconds: int = field(
        default_factory=lambda: _int_env("PROMPTHUB_ACCESS_TOKEN_TTL_SECONDS", 3600)
    )
    session_cookie_name: str = os.environ.get("PROMPTHUB_SESSION_COOKIE_NAME", "prompthub_session")
    oauth_state_cookie_name: str = os.environ.get(
        "PROMPTHUB_OAUTH_STATE_COOKIE_NAME",
        "prompthub_oauth_state",
    )
    session_cookie_secure: bool = field(
        default_factory=lambda: _bool_env("PROMPTHUB_SESSION_COOKIE_SECURE", False)
    )
    session_cookie_samesite: str = os.environ.get("PROMPTHUB_SESSION_COOKIE_SAMESITE", "lax")


settings = Settings()
