from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _load_local_env() -> None:
    """Load ignored local env files for development without overriding shell env."""
    root_dir = Path(__file__).resolve().parents[3]
    for env_path in (root_dir / ".env.local", root_dir / "backend" / ".env.local"):
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name = name.strip()
            value = value.strip().strip("\"'")
            if name and name not in os.environ:
                os.environ[name] = value


_load_local_env()


def _optional_env(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None or not value.strip():
        return None
    return value


def _optional_env_any(*names: str) -> str | None:
    for name in names:
        value = _optional_env(name)
        if value is not None:
            return value
    return None


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


def _str_env_any(names: tuple[str, ...], default: str) -> str:
    for name in names:
        value = os.environ.get(name)
        if value is not None and value.strip():
            return value.strip()
    return default


def _int_env_any(names: tuple[str, ...], default: int) -> int:
    for name in names:
        value = os.environ.get(name)
        if value is None:
            continue
        try:
            return int(value)
        except ValueError:
            return default
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
    app_encryption_key: str | None = field(
        default_factory=lambda: _optional_env("PROMPTHUB_APP_ENCRYPTION_KEY")
    )
    app_encryption_key_id: str = os.environ.get("PROMPTHUB_APP_ENCRYPTION_KEY_ID", "local")
    prompt_max_chars: int = field(
        default_factory=lambda: _int_env("PROMPTHUB_PROMPT_MAX_CHARS", 50000)
    )
    response_max_chars: int = field(
        default_factory=lambda: _int_env("PROMPTHUB_RESPONSE_MAX_CHARS", 50000)
    )
    gemini_api_key: str | None = field(
        default_factory=lambda: _optional_env_any(
            "PROMTY_GEMINI_API_KEY",
            "PROMPTHUB_GEMINI_API_KEY",
            "GEMINI_API_KEY",
        )
    )
    gemini_model: str = field(
        default_factory=lambda: _str_env_any(
            ("PROMTY_GEMINI_MODEL", "PROMPTHUB_GEMINI_MODEL"),
            "gemini-2.5-flash",
        )
    )
    gemini_timeout_seconds: int = field(
        default_factory=lambda: _int_env_any(
            ("PROMTY_GEMINI_TIMEOUT_SECONDS", "PROMPTHUB_GEMINI_TIMEOUT_SECONDS"),
            30,
        )
    )
    memory_generator: str = field(
        default_factory=lambda: _str_env_any(
            ("PROMTY_MEMORY_GENERATOR", "PROMPTHUB_MEMORY_GENERATOR"),
            "gemini",
        )
    )
    memory_slice_prompt_count: int = field(
        default_factory=lambda: _int_env_any(
            ("PROMTY_MEMORY_SLICE_PROMPT_COUNT", "PROMPTHUB_MEMORY_SLICE_PROMPT_COUNT"),
            12,
        )
    )
    memory_slice_max_minutes: int = field(
        default_factory=lambda: _int_env_any(
            ("PROMTY_MEMORY_SLICE_MAX_MINUTES", "PROMPTHUB_MEMORY_SLICE_MAX_MINUTES"),
            120,
        )
    )
    published_flow_asset_root: str = os.environ.get(
        "PROMPTHUB_PUBLISHED_FLOW_ASSET_ROOT",
        "~/.prompthub/published-flow-assets",
    )
    published_flow_asset_max_bytes: int = field(
        default_factory=lambda: _int_env("PROMPTHUB_PUBLISHED_FLOW_ASSET_MAX_BYTES", 5_242_880)
    )
    oauth_state_secret: str | None = field(
        default_factory=lambda: _optional_env("PROMPTHUB_OAUTH_STATE_SECRET")
    )
    jwt_secret: str | None = field(default_factory=lambda: _optional_env("PROMPTHUB_JWT_SECRET"))
    jwt_issuer: str = os.environ.get("PROMPTHUB_JWT_ISSUER", "prompthub")
    jwt_audience: str = os.environ.get("PROMPTHUB_JWT_AUDIENCE", "prompthub-web")
    access_token_ttl_seconds: int = field(
        # Set PROMPTHUB_ACCESS_TOKEN_TTL_SECONDS=15552000 for a 180-day web session.
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
