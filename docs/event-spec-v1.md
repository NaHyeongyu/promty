# PromptHub Event Specification v1

## 목적

PromptHub는 AI 개발 과정을 저장하는 플랫폼이다.

Claude Code, Codex CLI, Cursor, Gemini CLI 등 다양한 AI 개발 도구가 존재하지만 각각 전달하는 데이터 구조는 모두 다르다.

Collector의 역할은 각 도구의 데이터를 PromptHub의 표준 Event 형태로 변환하는 것이다.

Backend는 어떤 AI 도구에서 왔는지 신경 쓰지 않고 Event만 처리한다.

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

## Base Event

모든 Event는 아래 공통 필드를 가진다.

```text
id: UUID
project_id: UUID
session_id: UUID
tool: str
event_type: str
timestamp: datetime
payload: object
```

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
SESSION_STARTED
PROMPT_SENT
PROMPT_RESPONSE
FILES_CHANGED
COMMIT_CREATED
SESSION_ENDED
```

## SESSION_STARTED

AI 세션이 시작될 때 발생한다.

Payload:

```json
{
  "cwd": "/projects/football",
  "branch": "main",
  "model": "claude-sonnet-4"
}
```

## PROMPT_SENT

사용자가 AI에게 Prompt를 입력한 순간 발생한다.

Payload:

```json
{
  "prompt": "로그인 기능 만들어줘",
  "cwd": "/projects/football",
  "model": "claude-sonnet-4",
  "transcript_path": "...",
  "turn": 12
}
```

PromptHub에서 가장 중요한 Event이다.

## PROMPT_RESPONSE

AI 응답이 완료되면 발생한다.

Payload:

```json
{
  "tokens": 1350,
  "duration_ms": 4210,
  "success": true
}
```

V1에서는 Response 전문은 저장하지 않는다.

## FILES_CHANGED

AI가 수정한 파일 목록.

Payload:

```json
{
  "files": [
    "auth.py",
    "login.tsx",
    "middleware.py"
  ]
}
```

## COMMIT_CREATED

Git Commit이 생성되면 발생한다.

Payload:

```json
{
  "hash": "abc123",
  "message": "Implement JWT Login"
}
```

## SESSION_ENDED

AI 세션이 종료되면 발생한다.

Payload:

```json
{
  "reason": "exit",
  "duration": 352
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
  "event_type": "PROMPT_SENT",
  "tool": "claude-code",
  "payload": {
    "prompt": "로그인 기능 만들어줘"
  }
}
```

Backend는 PromptHub Event만 처리한다.

## Local Queue

Collector는 Hook 내부에서 네트워크 요청을 하지 않는다.

순서:

```text
Hook
|
v
PromptHub Event 생성
|
v
events.jsonl 저장
|
v
Uploader가 백그라운드 업로드
```

저장 위치:

```text
~/.prompthub/events.jsonl
```

## Session 구조

```text
Project
|
v
Session
|
v
Prompt
|
v
Prompt
|
v
Files Changed
|
v
Commit
|
v
Prompt
|
v
Session End
```

PromptHub Timeline은 Event를 시간순으로 정렬하여 생성한다.

## Design Principle

PromptHub는 Prompt를 저장하는 서비스가 아니다.

PromptHub는 AI 개발 Event를 저장하는 플랫폼이다.

모든 AI Tool은 PromptHub Event로 변환된다.

Backend는 Event만 이해한다.
