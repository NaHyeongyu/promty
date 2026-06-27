# PromptHub Event Specification v1

## 목적

PromptHub는 AI 개발 과정을 저장하는 플랫폼이다.

Claude Code, Codex CLI, Cursor, Gemini CLI 등 다양한 AI 개발 도구가 존재하지만 각각 전달하는 데이터 구조는 모두 다르다.

Collector의 역할은 각 도구의 데이터를 PromptHub의 표준 Event 형태로 변환하는 것이다.

Backend는 어떤 AI 도구에서 왔는지 신경 쓰지 않고 PromptHub Event만 처리한다.

## Event Flow

```text
AI Tool
|
v
Collector Adapter
|
v
PromptHub Event
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

PromptHub에서 가장 중요한 Event이다.

Claude/Codex에서 제공하는 유용한 metadata는 이 typed payload 안에 보존한다.

## ResponseReceived

AI 응답이 완료되면 발생한다.

Payload model: `ResponseReceivedPayload`

```json
{
  "tokens": 1350,
  "duration_ms": 4210,
  "success": true,
  "model": "claude-sonnet-4",
  "session_id": "tool-session-id"
}
```

V1에서는 response 전문은 저장하지 않는다.

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
      "deletions_delta": 8
    },
    {
      "path": "auth.py",
      "status": "added",
      "git_status": "??",
      "additions": 4,
      "insertions_delta": 4,
      "deletions_delta": 0
    }
  ]
}
```

Codex hooks provide lifecycle timing, not a ready-made code diff payload. The collector stores a git baseline on `UserPromptSubmit`, then computes the delta on `Stop`.

`insertions_delta` and `deletions_delta` are the canonical git delta fields. `files_changed`, `additions`, and `deletions` are included as UI-friendly aliases for timeline summaries.

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

Collector는 이를 PromptHub Event로 변환한다.

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

Backend는 PromptHub Event만 처리한다.

## Local Queue

Collector는 Hook 내부에서 네트워크 요청을 하지 않는다.

`project_id`는 명시값이 없으면 `cwd`의 git root를 우선 사용하고, git root가 없으면 `cwd`를 기반으로 만든다. 같은 tool session id로 들어오는 후속 이벤트는 session index를 통해 이미 감지한 project/session에 붙인다.

순서:

```text
Hook
|
v
PromptHub Event 생성
|
v
project/session queue에 events.jsonl 저장
|
v
Uploader가 백그라운드 업로드
```

저장 위치:

```text
~/.prompthub/events/<project_id>/<session_id>/events.jsonl
```

Sequence state 저장 위치:

```text
~/.prompthub/sequences.json
```

Session index 저장 위치:

```text
~/.prompthub/session-index.json
```

Git baseline 저장 위치:

```text
~/.prompthub/change-baselines.json
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

PromptHub Timeline은 Event를 session별 sequence 순서로 정렬하여 생성한다.

## Design Principle

PromptHub는 Prompt를 저장하는 서비스가 아니다.

PromptHub는 AI 개발 Event를 저장하는 플랫폼이다.

모든 AI Tool은 PromptHub Event로 변환된다.

Backend는 Event만 이해한다.
