# Promty Event Specification v1

## 목적

Promty는 AI 개발 과정을 저장하는 플랫폼이다.

Claude Code, Codex CLI, Cursor, Gemini CLI 등 다양한 AI 개발 도구가 존재하지만 각각 전달하는 데이터 구조는 모두 다르다.

Collector의 역할은 각 도구의 데이터를 Promty의 표준 Event 형태로 변환하는 것이다.

Backend는 어떤 AI 도구에서 왔는지 신경 쓰지 않고 Promty Event만 처리한다.

## Event Flow

```text
AI Tool
|
v
Collector Adapter
|
v
Promty Event
|
v
Local Queue(JSONL)
|
v
Uploader
|
v
Backend API
|
v
PostgreSQL
```

Collector는 Hook 내부에서 네트워크 요청을 하지 않는다.

## Base Event

모든 Event는 아래 공통 필드를 가진다.

```text
id: UUID
schema_version: int
project_id: UUID
session_id: UUID
sequence: int
tool: str
event_type: str
timestamp: datetime
payload: typed object
```

`schema_version`의 기본값은 `1`이다.

Timeline 정렬은 같은 session 안에서 `session_id + sequence`를 기준으로 한다.

## Supported Tool

```text
claude-code
codex-cli
cursor
gemini-cli
```

새로운 AI Tool이 추가되면 Adapter만 추가한다.

Backend는 수정하지 않는다.

## Event Type

V1에서는 아래 Event만 지원한다.

```text
SessionStarted
PromptSubmitted
ResponseReceived
FilesChanged
CommitCreated
SessionEnded
```

Event 이름은 이미 발생한 일을 표현하기 위해 과거형을 사용한다.

## SessionStarted

AI 세션이 시작될 때 발생한다.

Payload model: `SessionStartedPayload`

```json
{
  "cwd": "/projects/football",
  "branch": "main",
  "git_remote": "git@github.com:OWNER/football.git",
  "github_url": "https://github.com/OWNER/football",
  "model": "claude-sonnet-4",
  "permission_mode": "default",
  "session_id": "tool-session-id"
}
```

## PromptSubmitted

사용자가 AI에게 prompt를 입력한 순간 발생한다.

Payload model: `PromptSubmittedPayload`

```json
{
  "prompt": "로그인 기능 만들어줘",
  "cwd": "/projects/football",
  "model": "claude-sonnet-4",
  "permission_mode": "default",
  "transcript_path": "...",
  "turn_id": 12,
  "session_id": "tool-session-id",
  "branch": "main",
  "git_remote": "git@github.com:OWNER/football.git",
  "github_url": "https://github.com/OWNER/football",
  "hook_event_name": "UserPromptSubmit",
  "approval_policy": "on-request",
  "sandbox_mode": "workspace-write"
}
```

Promty에서 가장 중요한 Event이다.

Claude/Codex에서 제공하는 유용한 metadata는 이 typed payload 안에 보존한다.

Backend storage policy:

```text
payload.prompt is capped at 50000 characters by default before storage.
prompt_truncated, prompt_original_length, and prompt_storage_limit are added by the backend.
The stored prompt text is encrypted at rest with application-level encryption.
API responses decrypt the prompt for authorized users.
```

## ResponseReceived

AI 응답이 완료되면 발생한다.

Payload model: `ResponseReceivedPayload`

```json
{
  "response": "구현 완료했습니다...",
  "response_truncated": false,
  "response_original_length": 1234,
  "response_storage_limit": 50000,
  "response_source": "transcript",
  "transcript_path": "...",
  "turn_id": "tool-turn-id",
  "duration_ms": 4210,
  "success": true,
  "model": "claude-sonnet-4",
  "session_id": "tool-session-id"
}
```

`response`는 optional이다. Hook payload에 답변 본문이 직접 있으면 그 값을 사용하고, 없으면 `transcript_path`에서 마지막 assistant message를 추출한다. Backend는 response text를 저장 전에 기본 50000자로 제한하고 application-level encryption으로 암호화한다.

## FilesChanged

AI가 수정한 파일 목록과 git 기반 변경 요약.

Payload model: `FilesChangedPayload`

```json
{
  "files": [
    "auth.py",
    "login.tsx",
    "middleware.py"
  ],
  "cwd": "/projects/football",
  "session_id": "tool-session-id",
  "prompt_event_id": "0db26f22-26a1-4b4b-b42f-8a6248eb65d8",
  "turn_id": "tool-turn-id",
  "git_root": "/projects/football",
  "branch": "main",
  "git_remote": "git@github.com:OWNER/football.git",
  "github_url": "https://github.com/OWNER/football",
  "base_commit": "abc123",
  "head_commit": "abc123",
  "source": "git",
  "summary": {
    "total": 2,
    "files_changed": 2,
    "files": 2,
    "added": 1,
    "modified": 1,
    "deleted": 0,
    "renamed": 0,
    "additions": 42,
    "deletions": 8,
    "insertions_delta": 42,
    "deletions_delta": 8
  },
  "changes": [
    {
      "path": "login.tsx",
      "status": "modified",
      "git_status": " M",
      "additions": 38,
      "insertions_delta": 38,
      "deletions_delta": 8,
      "patch": "--- a/login.tsx\n+++ b/login.tsx\n@@ ...",
      "patch_truncated": false
    },
    {
      "path": "auth.py",
      "status": "added",
      "git_status": "??",
      "additions": 4,
      "insertions_delta": 4,
      "deletions_delta": 0,
      "patch_omitted_reason": "sensitive_path"
    }
  ]
}
```

Codex hooks provide lifecycle timing, not a ready-made code diff payload. The collector stores a git baseline on `UserPromptSubmit`, then computes the delta on `Stop`.

`insertions_delta` and `deletions_delta` are the canonical git delta fields. `files_changed`, `additions`, and `deletions` are included as UI-friendly aliases for timeline summaries.

Promty stores line-level code review data at the prompt/turn boundary, not on every filesystem write. For each changed file, the collector attempts to include a unified diff in `changes[].patch`. Patch capture is bounded and defensive:

```text
default max source file bytes: 524288
default max stored patch bytes: 262144
excluded directories: .git, node_modules, dist, build, coverage, .venv
sensitive paths: .env*, *.key, *.pem, *secret*, *token*, *id_rsa*
```

When patch content is not stored, `patch_omitted_reason` explains why. Expected values include `sensitive_path`, `excluded_path`, `binary`, `content_unavailable`, and `empty_patch`.

Backend storage policy:

```text
changes[].patch is encrypted at rest in the event payload.
The extracted code_change_patches.patch copy is also encrypted.
File path, status, additions, deletions, and omission reason remain plaintext metadata.
```

## CommitCreated

Git commit이 생성되면 발생한다.

Payload model: `CommitCreatedPayload`

```json
{
  "hash": "abc123",
  "message": "Implement JWT Login",
  "branch": "main",
  "git_remote": "git@github.com:OWNER/football.git",
  "github_url": "https://github.com/OWNER/football",
  "cwd": "/projects/football",
  "session_id": "tool-session-id"
}
```

## SessionEnded

AI 세션이 종료되면 발생한다.

Payload model: `SessionEndedPayload`

```json
{
  "reason": "exit",
  "duration": 352,
  "session_id": "tool-session-id"
}
```

## Collector 역할

각 AI Tool은 서로 다른 JSON 구조를 제공한다.

예시:

Claude Code:

```json
{
  "prompt": "..."
}
```

Codex CLI:

```json
{
  "input": "..."
}
```

Collector는 이를 Promty Event로 변환한다.

예시:

```json
{
  "event_type": "PromptSubmitted",
  "tool": "claude-code",
  "payload": {
    "prompt": "로그인 기능 만들어줘"
  }
}
```

Backend는 Promty Event만 처리한다.

## Local Queue

Collector는 Hook 내부에서 네트워크 요청을 하지 않는다.

`project_id`는 명시값이 없으면 `cwd`의 git root를 우선 사용하고, git root가 없으면 `cwd`를 기반으로 만든다. 같은 tool session id로 들어오는 후속 이벤트는 session index를 통해 이미 감지한 project/session에 붙인다.

순서:

```text
Hook
|
v
Promty Event 생성
|
v
project/session queue에 events.jsonl 저장
|
v
Uploader가 백그라운드 업로드
```

저장 위치:

```text
~/.promty/events/<project_id>/<session_id>/events.jsonl
```

Sequence state 저장 위치:

```text
~/.promty/sequences.json
```

Session index 저장 위치:

```text
~/.promty/session-index.json
```

Git baseline 저장 위치:

```text
~/.promty/change-baselines.json
```

## Session 구조

```text
Project
|
v
Session
|
v
PromptSubmitted
|
v
ResponseReceived
|
v
FilesChanged
|
v
CommitCreated
|
v
PromptSubmitted
|
v
SessionEnded
```

Promty Timeline은 Event를 session별 sequence 순서로 정렬하여 생성한다.

## Design Principle

Promty는 Prompt를 저장하는 서비스가 아니다.

Promty는 AI 개발 Event를 저장하는 플랫폼이다.

모든 AI Tool은 Promty Event로 변환된다.

Backend는 Event만 이해한다.
