export type SupportedTool = "claude-code" | "codex-cli" | "cursor" | "gemini-cli";

export type EventType =
  | "SessionStarted"
  | "PromptSubmitted"
  | "ResponseReceived"
  | "FilesChanged"
  | "CommitCreated"
  | "SessionEnded";

export type BaseEvent<TEventType extends EventType, TPayload> = {
  id: string;
  schema_version: number;
  project_id: string;
  session_id: string;
  sequence: number;
  tool: SupportedTool;
  event_type: TEventType;
  timestamp: string;
  payload: TPayload;
};

export type SessionStartedPayload = {
  cwd?: string | null;
  branch?: string | null;
  model?: string | null;
  permission_mode?: string | null;
  session_id?: string | null;
};

export type PromptSubmittedPayload = {
  prompt: string;
  cwd?: string | null;
  model?: string | null;
  permission_mode?: string | null;
  transcript_path?: string | null;
  turn_id?: string | number | null;
  session_id?: string | null;
  branch?: string | null;
  hook_event_name?: string | null;
  approval_policy?: string | null;
  sandbox_mode?: string | null;
};

export type ResponseReceivedPayload = {
  tokens?: number | null;
  duration_ms?: number | null;
  success?: boolean | null;
  model?: string | null;
  session_id?: string | null;
};

export type FilesChangedPayload = {
  files: string[];
  cwd?: string | null;
  session_id?: string | null;
};

export type CommitCreatedPayload = {
  hash?: string | null;
  message?: string | null;
  branch?: string | null;
  cwd?: string | null;
  session_id?: string | null;
};

export type SessionEndedPayload = {
  reason?: string | null;
  duration?: number | null;
  session_id?: string | null;
};

export type PromptHubEvent =
  | BaseEvent<"SessionStarted", SessionStartedPayload>
  | BaseEvent<"PromptSubmitted", PromptSubmittedPayload>
  | BaseEvent<"ResponseReceived", ResponseReceivedPayload>
  | BaseEvent<"FilesChanged", FilesChangedPayload>
  | BaseEvent<"CommitCreated", CommitCreatedPayload>
  | BaseEvent<"SessionEnded", SessionEndedPayload>;
