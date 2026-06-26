# Codex Hook Verification

This document verifies the first milestone:

```text
Codex CLI
|
v
UserPromptSubmit
|
v
PromptSubmitted
|
v
events.jsonl
|
v
Backend
|
v
Stored successfully
```

## Hook Configuration

The repo-local Codex hook lives at:

```text
.codex/hooks.json
```

It captures `UserPromptSubmit` and runs:

```bash
python3 "$(git rev-parse --show-toplevel)/collector/src/cli.py" capture --tool codex-cli
```

The hook only writes to the local queue. It does not upload to the backend.

Default queue path:

```text
~/.prompthub/events.jsonl
```

Default sequence path:

```text
~/.prompthub/sequences.json
```

After adding or changing a Codex hook, open `/hooks` in Codex and trust the hook if prompted.

## Local Simulation

Run a Codex-style `UserPromptSubmit` payload through the collector:

```bash
printf '%s\n' '{
  "session_id": "codex-smoke-session",
  "transcript_path": "/tmp/codex-transcript.jsonl",
  "cwd": "/Users/nahyeongyu/Desktop/development/PromptHub",
  "hook_event_name": "UserPromptSubmit",
  "model": "gpt-5-codex",
  "permission_mode": "default",
  "turn_id": "turn-001",
  "prompt": "Codex smoke prompt"
}' | python3 collector/src/cli.py capture \
  --tool codex-cli \
  --queue-path /tmp/prompthub-codex-smoke-events.jsonl \
  --sequence-path /tmp/prompthub-codex-smoke-sequences.json
```

Expected JSONL event:

```json
{
  "schema_version": 1,
  "tool": "codex-cli",
  "event_type": "PromptSubmitted",
  "sequence": 1,
  "payload": {
    "prompt": "Codex smoke prompt",
    "model": "gpt-5-codex",
    "permission_mode": "default",
    "transcript_path": "/tmp/codex-transcript.jsonl",
    "turn_id": "turn-001",
    "session_id": "codex-smoke-session",
    "hook_event_name": "UserPromptSubmit"
  }
}
```

## Backend Smoke

Install backend dependencies:

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install -r backend/requirements.txt
```

Start the backend:

```bash
./.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8011
```

Upload queued events:

```bash
./.venv/bin/python collector/src/cli.py upload \
  --api-url http://127.0.0.1:8011 \
  --queue-path /tmp/prompthub-codex-smoke-events.jsonl
```

Verify the stored event:

```bash
curl -sS http://127.0.0.1:8011/api/events
```

Expected result:

```text
tool = codex-cli
event_type = PromptSubmitted
payload.prompt = Codex smoke prompt
```
