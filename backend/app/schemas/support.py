from __future__ import annotations

from datetime import datetime
import re
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SupportInquiryCreateRequest(BaseModel):
    category: Literal["question", "bug", "feature", "privacy", "other"]
    reply_email: str = Field(min_length=3, max_length=320)
    subject: str = Field(min_length=4, max_length=160)
    message: str = Field(min_length=20, max_length=5_000)

    @field_validator("reply_email")
    @classmethod
    def validate_reply_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not EMAIL_PATTERN.fullmatch(normalized):
            raise ValueError("Enter a valid reply email address")
        return normalized

    @field_validator("subject")
    @classmethod
    def normalize_subject(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Value must not be blank")
        return normalized

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Value must not be blank")
        return normalized


class SupportInquiryResponse(BaseModel):
    id: UUID
    created_at: datetime
    status: Literal["received"] = "received"
