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


def locale_from_accept_language(value: str | None) -> AppLocale:
    candidates: list[tuple[float, int, str]] = []
    for index, raw_candidate in enumerate((value or "").split(",")):
        parts = [part.strip() for part in raw_candidate.split(";")]
        language_tag = parts[0].lower()
        quality = 1.0
        for parameter in parts[1:]:
            name, separator, raw_quality = parameter.partition("=")
            if name.strip().lower() != "q" or not separator:
                continue
            try:
                quality = float(raw_quality)
            except ValueError:
                quality = 0.0
        if language_tag and quality > 0:
            candidates.append((-quality, index, language_tag))

    for _, _, language_tag in sorted(candidates):
        primary_language = language_tag.replace("_", "-").split("-", 1)[0]
        if primary_language in SUPPORTED_APP_LOCALES:
            return primary_language  # type: ignore[return-value]
    return DEFAULT_APP_LOCALE


def ai_output_language_instruction(value: str | None) -> str:
    locale = normalize_app_locale(value)
    language = LOCALE_NAMES[locale]
    return (
        f"Write every user-facing string in {language}. "
        "Keep JSON property names, enum values, identifiers, file paths, code, and product names "
        "unchanged. Preserve source text when quoting evidence."
    )
