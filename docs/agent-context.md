# Agent Context bridge

Promty exposes the existing compiled Project Memory to coding agents without adding a new
storage model or changing the capture pipeline.

## CLI

Authenticate with `promty login`, then run this inside a captured repository:

```sh
promty context
promty context --format json
```

The CLI derives the same deterministic project UUID used by event capture. Use
`--project-id <uuid>` only when the working directory cannot identify the repository.

## MCP

Configure an MCP client to start the following stdio server:

```json
{
  "command": "promty",
  "args": ["mcp"]
}
```

It publishes one read-only tool, `get_project_context`. The tool returns Project Memory as
Markdown plus structured JSON. It accepts optional `cwd`, `project_id`, and `format` arguments.

## API and security

`GET /api/agent/projects/{project_id}/context` accepts only an active, user-owned collector
token. It intentionally rejects the global ingest token and anonymous ingest mode. Project
ownership is checked before private memory is returned.
