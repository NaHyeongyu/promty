export type SupportedTool = "claude-code" | "codex-cli" | "cursor" | "gemini-cli";

export type EventType =
  | "SESSION_STARTED"
  | "PROMPT_SENT"
  | "PROMPT_RESPONSE"
  | "FILES_CHANGED"
  | "COMMIT_CREATED"
  | "SESSION_ENDED";

export type PromptHubEvent = {
  id: string;
  project_id: string;
  session_id: string;
  tool: SupportedTool;
  event_type: EventType;
  timestamp: string;
  payload: Record<string, unknown>;
};
