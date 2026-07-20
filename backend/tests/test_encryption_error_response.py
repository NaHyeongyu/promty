from __future__ import annotations

import asyncio
import json
import logging

from starlette.requests import Request

from app.core.encryption import EncryptionDecryptionError
from app.main import (
    ENCRYPTED_DATA_UNAVAILABLE_CODE,
    ENCRYPTED_DATA_UNAVAILABLE_DETAIL,
    encryption_error_handler,
)


def test_encryption_error_is_logged_but_not_exposed(caplog) -> None:
    error = EncryptionDecryptionError(
        "Application encryption key cannot decrypt stored data"
    )
    request = Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/events",
            "raw_path": b"/api/events",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 1234),
            "server": ("testserver", 80),
        }
    )

    with caplog.at_level(logging.ERROR, logger="promty.encryption"):
        response = asyncio.run(encryption_error_handler(request, error))

    assert response.status_code == 503
    assert json.loads(response.body) == {
        "code": ENCRYPTED_DATA_UNAVAILABLE_CODE,
        "detail": ENCRYPTED_DATA_UNAVAILABLE_DETAIL,
    }
    assert "cannot decrypt stored data" not in response.body.decode("utf-8")
    assert "cannot decrypt stored data" in caplog.text
