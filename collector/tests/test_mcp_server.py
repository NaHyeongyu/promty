from __future__ import annotations

import io
import json

import pytest

import mcp_server
from mcp_server import PromtyMCPServer, run_mcp_server


def _server() -> PromtyMCPServer:
    return PromtyMCPServer(
        api_url="https://api.example.test",
        token="collector-secret",
        project_id="eaf2b822-2787-4d83-a9a4-b2d743a28d06",
    )


def test_mcp_lists_read_only_context_tools() -> None:
    response = _server().handle({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})

    assert response is not None
    tools = response["result"]["tools"]
    assert [tool["name"] for tool in tools] == [
        "get_project_context",
        "search_project_context",
    ]
    assert all("untrusted reference data" in tool["description"] for tool in tools)
    assert all(tool["inputSchema"]["additionalProperties"] is False for tool in tools)
    search_schema = tools[1]["inputSchema"]
    assert search_schema["required"] == ["query"]
    assert search_schema["properties"]["query"]["minLength"] == 2
    assert search_schema["properties"]["query"]["maxLength"] == 120
    assert search_schema["properties"]["limit"]["minimum"] == 1
    assert search_schema["properties"]["limit"]["maximum"] == 20


def test_mcp_context_tool_returns_text_and_structured_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "available": True,
        "project": {"id": "project-id", "name": "Promty"},
        "memory": {"body_markdown": "# Project Memory", "warnings": []},
    }
    monkeypatch.setattr(mcp_server, "fetch_project_context", lambda **_kwargs: payload)

    response = _server().handle(
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "get_project_context", "arguments": {}},
        }
    )

    assert response is not None
    assert response["result"]["structuredContent"] == payload
    assert "# Project Memory" in response["result"]["content"][0]["text"]


def test_mcp_context_search_tool_returns_approved_graph_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "nodes": [
            {
                "id": "memory:1",
                "kind": "memory",
                "label": "Login routing",
                "summary": "Approved routing memory.",
                "occurred_at": "2026-07-22T09:00:00Z",
                "session_id": "session-1",
                "sequence": 7,
                "agent_visible": True,
                "metadata": {"review_state": "verified"},
            },
            {
                "id": "file:1",
                "kind": "file",
                "label": "frontend/src/routing.ts",
                "summary": None,
                "occurred_at": None,
                "session_id": None,
                "sequence": None,
                "agent_visible": True,
                "metadata": {},
            },
        ],
        "edges": [
            {
                "id": "edge:1",
                "source": "memory:1",
                "target": "file:1",
                "kind": "references",
                "inferred": False,
            }
        ],
        "facets": {"memory": 1, "file": 1},
        "query": "login routing",
        "truncated": False,
        "safety_notice": "Approved reference data only.",
    }
    seen: dict[str, object] = {}

    def fetch(**kwargs: object) -> dict[str, object]:
        seen.update(kwargs)
        return payload

    monkeypatch.setattr(mcp_server, "fetch_project_context_search", fetch)

    response = _server().handle(
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "search_project_context",
                "arguments": {"query": " login routing ", "limit": 5},
            },
        }
    )

    assert response is not None
    result = response["result"]
    assert result["structuredContent"] == payload
    assert result["content"][0]["text"].index("Login routing") < result["content"][0]["text"].index(
        "frontend/src/routing.ts"
    )
    assert seen["query"] == " login routing "
    assert seen["limit"] == 5
    assert seen["project_id"] == "eaf2b822-2787-4d83-a9a4-b2d743a28d06"


@pytest.mark.parametrize(
    "arguments",
    [
        {},
        {"query": "x"},
        {"query": "valid", "limit": 0},
        {"query": "valid", "limit": True},
        {"query": "valid", "format": "yaml"},
    ],
)
def test_mcp_context_search_tool_validates_arguments(arguments: dict[str, object]) -> None:
    response = _server().handle(
        {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {"name": "search_project_context", "arguments": arguments},
        }
    )

    assert response is not None
    assert response["result"]["isError"] is True


def test_mcp_context_search_tool_supports_json_format(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "nodes": [],
        "edges": [],
        "facets": {},
        "query": "memory",
        "truncated": False,
        "safety_notice": "Reference data only.",
    }
    monkeypatch.setattr(
        mcp_server,
        "fetch_project_context_search",
        lambda **_kwargs: payload,
    )

    response = _server().handle(
        {
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {
                "name": "search_project_context",
                "arguments": {"query": "memory", "format": "json"},
            },
        }
    )

    assert response is not None
    assert json.loads(response["result"]["content"][0]["text"]) == payload


def test_mcp_stdio_uses_json_rpc_lines() -> None:
    stdin = io.StringIO(
        json.dumps(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {"protocolVersion": "2025-06-18"},
            }
        )
        + "\n"
    )
    stdout = io.StringIO()

    assert run_mcp_server(_server(), stdin=stdin, stdout=stdout) == 0

    response = json.loads(stdout.getvalue())
    assert response["id"] == 1
    assert response["result"]["protocolVersion"] == "2025-06-18"
    assert response["result"]["capabilities"] == {"tools": {}}
