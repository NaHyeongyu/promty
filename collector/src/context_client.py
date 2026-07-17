from __future__ import annotations

import json
import os
from typing import Any
from urllib import error, request

from events import coerce_uuid, resolve_project_id
from version import COLLECTOR_VERSION


class ContextClientError(RuntimeError):
    pass


def project_id_for_context(*, cwd: str | None = None, project_id: str | None = None) -> str:
    explicit = coerce_uuid(project_id)
    if project_id is not None and explicit is None:
        raise ContextClientError("project_id must be a UUID")
    if explicit:
        return explicit
    return resolve_project_id({"cwd": cwd or os.getcwd()}, {})


def fetch_project_context(
    *,
    api_url: str,
    token: str | None,
    project_id: str,
    timeout: float = 10,
) -> dict[str, Any]:
    if not token:
        raise ContextClientError("Promty login required: run `promty login` first")

    req = request.Request(
        f"{api_url.rstrip('/')}/api/agent/projects/{project_id}/context",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "X-Promty-Collector-Version": COLLECTOR_VERSION,
        },
        method="GET",
    )
    try:
        with request.urlopen(req, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = None
        try:
            body = json.loads(exc.read().decode("utf-8"))
            detail = body.get("detail") if isinstance(body, dict) else None
        except (UnicodeDecodeError, json.JSONDecodeError):
            pass
        message = detail if isinstance(detail, str) else f"Promty API returned HTTP {exc.code}"
        raise ContextClientError(message) from exc
    except error.URLError as exc:
        raise ContextClientError(f"Could not reach Promty API: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise ContextClientError("Promty API returned invalid JSON") from exc

    if not isinstance(payload, dict):
        raise ContextClientError("Promty API returned an invalid context response")
    return payload


def render_project_context(payload: dict[str, Any]) -> str:
    project = payload.get("project") if isinstance(payload.get("project"), dict) else {}
    memory = payload.get("memory") if isinstance(payload.get("memory"), dict) else None
    project_name = project.get("name") if isinstance(project.get("name"), str) else "Project"
    project_id = project.get("id") if isinstance(project.get("id"), str) else "unknown"

    lines = [
        "# Promty Agent Context",
        "",
        f"Project: {project_name}",
        f"Project ID: {project_id}",
    ]
    updated_at = payload.get("updated_at")
    if isinstance(updated_at, str):
        lines.append(f"Memory updated: {updated_at}")

    if memory is None:
        lines.extend(
            [
                "",
                "No compiled Project Memory is available yet.",
                "Capture activity and generate Project Memory in Promty, then retry.",
            ]
        )
        return "\n".join(lines).rstrip() + "\n"

    body = memory.get("body_markdown")
    if isinstance(body, str) and body.strip():
        lines.extend(["", body.strip()])
    warnings = memory.get("warnings")
    if isinstance(warnings, list) and warnings:
        lines.extend(["", "## Context warnings"])
        lines.extend(f"- {warning}" for warning in warnings if isinstance(warning, str))
    return "\n".join(lines).rstrip() + "\n"
