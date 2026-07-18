from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class CurrentUserResponse(BaseModel):
    avatar_url: str | None
    email: str | None
    github_repository_access: bool
    id: str
    is_admin: bool
    preferred_locale: Literal["en", "ja", "ko"]
    username: str


class LogoutResponse(BaseModel):
    status: Literal["ok"]


class RefreshSessionResponse(BaseModel):
    status: Literal["ok"]
