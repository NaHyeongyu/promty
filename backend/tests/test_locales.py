from app.core.locales import locale_from_accept_language


def test_locale_from_accept_language_uses_highest_priority_supported_locale() -> None:
    assert locale_from_accept_language("ko-KR,ko;q=0.9,en-US;q=0.8") == "ko"
    assert locale_from_accept_language("fr-FR,ja-JP;q=0.9,en-US;q=0.8") == "ja"
    assert locale_from_accept_language("en-US;q=0.5,ko-KR;q=0.9") == "ko"
    assert locale_from_accept_language("zh-CN,zh;q=0.9,en-US;q=0.8") == "zh"


def test_locale_from_accept_language_falls_back_to_english() -> None:
    assert locale_from_accept_language(None) == "en"
    assert locale_from_accept_language("") == "en"
    assert locale_from_accept_language("fr-FR,es-ES;q=0.8") == "en"
    assert locale_from_accept_language("ja-JP;q=0") == "en"
