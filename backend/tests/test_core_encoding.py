from __future__ import annotations

from app.core.encoding import base64_urldecode, base64_urlencode


def test_base64_url_round_trip_without_padding() -> None:
    samples = [
        b"",
        b"f",
        b"fo",
        b"foo",
        b"hello world",
        bytes(range(32)),
    ]

    for sample in samples:
        encoded = base64_urlencode(sample)

        assert "=" not in encoded
        assert base64_urldecode(encoded) == sample
