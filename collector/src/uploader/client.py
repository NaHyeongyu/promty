from __future__ import annotations

import json
from typing import Any
from urllib import request


class PromptHubUploader:
    def __init__(self, api_url: str, token: str | None = None, timeout: float = 10) -> None:
        self.api_url = api_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def upload_events(self, events: list[dict[str, Any]]) -> list[str]:
        if not events:
            return []

        body = json.dumps({"events": events}).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        req = request.Request(
            f"{self.api_url}/api/events/batch",
            data=body,
            headers=headers,
            method="POST",
        )
        with request.urlopen(req, timeout=self.timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))

        event_ids = payload.get("event_ids")
        if isinstance(event_ids, list):
            return [event_id for event_id in event_ids if isinstance(event_id, str)]
        return [event["id"] for event in events if isinstance(event.get("id"), str)]
