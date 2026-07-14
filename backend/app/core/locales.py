from __future__ import annotations

from typing import Literal

AppLocale = Literal["en", "ja", "ko"]

DEFAULT_APP_LOCALE: AppLocale = "en"
SUPPORTED_APP_LOCALES = frozenset({"en", "ja", "ko"})

LOCALE_NAMES: dict[AppLocale, str] = {
    "en": "English",
    "ja": "Japanese (日本語)",
    "ko": "Korean (한국어)",
}


def normalize_app_locale(value: str | None) -> AppLocale:
    return value if value in SUPPORTED_APP_LOCALES else DEFAULT_APP_LOCALE  # type: ignore[return-value]


def ai_output_language_instruction(value: str | None) -> str:
    locale = normalize_app_locale(value)
    language = LOCALE_NAMES[locale]
    return (
        f"Write every user-facing string in {language}. "
        "Keep JSON property names, enum values, identifiers, file paths, code, and product names "
        "unchanged. Preserve source text when quoting evidence."
    )
