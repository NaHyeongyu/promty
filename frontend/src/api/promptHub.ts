const API_URL = (
  import.meta.env.VITE_PROMPTHUB_API_URL ?? "http://127.0.0.1:8011"
).replace(/\/$/, "");

export type PromptHubVisibility = "private" | "unlisted" | "public";
export type PromptHubSort = "latest" | "trending" | "top";

export type PromptHubSharedScope = {
  include_prompt: boolean;
  include_response: boolean;
  include_files: boolean;
  include_diff: boolean;
  include_terminal: boolean;
  include_project_context: boolean;
};

export type PromptHubMetrics = {
  events_count?: number;
  files_changed?: number;
  lines_added?: number;
  lines_removed?: number;
  [key: string]: number | undefined;
};

export type PromptHubListItem = {
  category: string | null;
  id: string;
  metrics: PromptHubMetrics;
  model_name: string | null;
  published_at: string | null;
  score_overall: number | null;
  slug: string;
  summary: string | null;
  tags: string[];
  title: string;
  tool_name: string | null;
};

export type PromptHubFile = {
  additions: number;
  change_type: string | null;
  deletions: number;
  diff: string | null;
  file_path: string;
  id: string;
  is_included: boolean;
  language: string | null;
};

export type PromptHubDetail = PromptHubListItem & {
  comments_count: number;
  created_at: string;
  files: PromptHubFile[];
  prompt_text: string;
  reactions_count: number;
  result_summary: string | null;
  score_architecture: number | null;
  score_backend: number | null;
  score_documentation: number | null;
  score_frontend: number | null;
  score_refactoring: number | null;
  shared_scope: PromptHubSharedScope;
  status: "draft" | "published" | "archived";
  updated_at: string;
  visibility: PromptHubVisibility;
};

export type PromptHubListParams = {
  category?: string;
  limit?: number;
  model?: string;
  offset?: number;
  q?: string;
  sort?: PromptHubSort;
  tag?: string;
};

export type CreatePromptHubDraftRequest = {
  activity_id: string;
  include_diff: boolean;
  include_files: boolean;
  include_project_context: boolean;
  include_prompt: boolean;
  include_response: boolean;
  include_terminal: boolean;
  project_id: string;
  summary?: string | null;
  title: string;
};

export type UpdatePromptHubRequest = {
  category?: string | null;
  prompt_text?: string;
  result_summary?: string | null;
  score_architecture?: number | null;
  score_backend?: number | null;
  score_documentation?: number | null;
  score_frontend?: number | null;
  score_overall?: number | null;
  score_refactoring?: number | null;
  shared_scope?: PromptHubSharedScope;
  summary?: string | null;
  tags?: string[];
  title?: string;
  visibility?: PromptHubVisibility;
};

type ApiValidationItem = {
  loc?: Array<string | number>;
  msg?: string;
  type?: string;
};

type ApiErrorPayload = {
  detail?: string | ApiValidationItem[] | { msg?: string };
};

export class PromptHubApiError extends Error {
  status: number;
  validationErrors: string[];

  constructor(
    message: string,
    {
      status,
      validationErrors = [],
    }: {
      status: number;
      validationErrors?: string[];
    },
  ) {
    super(message);
    this.name = "PromptHubApiError";
    this.status = status;
    this.validationErrors = validationErrors;
  }
}

function parseErrorPayload(payload: ApiErrorPayload | null, status: number) {
  if (typeof payload?.detail === "string") {
    return {
      message: payload.detail,
      validationErrors: [],
    };
  }

  if (Array.isArray(payload?.detail)) {
    const validationErrors = payload.detail
      .map((item) => {
        const path = item.loc?.slice(1).join(".");
        return path && item.msg ? `${path}: ${item.msg}` : item.msg;
      })
      .filter((message): message is string => Boolean(message));

    return {
      message:
        validationErrors.length > 0
          ? validationErrors.join("\n")
          : "Validation failed",
      validationErrors,
    };
  }

  if (
    payload?.detail &&
    typeof payload.detail === "object" &&
    typeof payload.detail.msg === "string"
  ) {
    return {
      message: payload.detail.msg,
      validationErrors: [payload.detail.msg],
    };
  }

  return {
    message: `Prompt Hub request failed with HTTP ${status}`,
    validationErrors: [],
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text
    ? (() => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return null;
        }
      })()
    : null;

  if (response.ok) {
    return payload as T;
  }

  const error = parseErrorPayload(payload as ApiErrorPayload | null, response.status);
  throw new PromptHubApiError(error.message, {
    status: response.status,
    validationErrors: error.validationErrors,
  });
}

export function promptHubErrorMessage(error: unknown, fallback: string) {
  if (error instanceof PromptHubApiError) {
    return error.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
}

export async function listPublishedPrompts(
  params: PromptHubListParams = {},
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (params.category && params.category !== "All") {
    search.set("category", params.category);
  }
  if (params.limit) {
    search.set("limit", String(params.limit));
  }
  if (params.model) {
    search.set("model", params.model);
  }
  if (params.offset) {
    search.set("offset", String(params.offset));
  }
  if (params.q?.trim()) {
    search.set("q", params.q.trim());
  }
  if (params.sort) {
    search.set("sort", params.sort);
  }
  if (params.tag) {
    search.set("tag", params.tag);
  }

  const suffix = search.toString() ? `?${search}` : "";
  const response = await fetch(`${API_URL}/api/prompt-hub${suffix}`, {
    credentials: "include",
    signal,
  });
  return parseJsonResponse<PromptHubListItem[]>(response);
}

export async function getPublishedPrompt(slug: string, signal?: AbortSignal) {
  const response = await fetch(
    `${API_URL}/api/prompt-hub/${encodeURIComponent(slug)}`,
    {
      credentials: "include",
      signal,
    },
  );
  return parseJsonResponse<PromptHubDetail>(response);
}

export async function createPromptDraftFromActivity(
  payload: CreatePromptHubDraftRequest,
) {
  const response = await fetch(`${API_URL}/api/prompt-hub/drafts/from-activity`, {
    body: JSON.stringify(payload),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return parseJsonResponse<PromptHubDetail>(response);
}

export async function updatePublishedPrompt(
  id: string,
  payload: UpdatePromptHubRequest,
) {
  const response = await fetch(`${API_URL}/api/prompt-hub/${id}`, {
    body: JSON.stringify(payload),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
  return parseJsonResponse<PromptHubDetail>(response);
}

export async function publishPrompt(id: string) {
  const response = await fetch(`${API_URL}/api/prompt-hub/${id}/publish`, {
    credentials: "include",
    method: "POST",
  });
  return parseJsonResponse<PromptHubDetail>(response);
}

export async function archivePrompt(id: string) {
  const response = await fetch(`${API_URL}/api/prompt-hub/${id}/archive`, {
    credentials: "include",
    method: "POST",
  });
  return parseJsonResponse<PromptHubDetail>(response);
}

export const listPromptHubPrompts = listPublishedPrompts;
export const readPromptHubPrompt = getPublishedPrompt;
export const createPromptHubDraft = createPromptDraftFromActivity;
export const updatePromptHubPrompt = updatePublishedPrompt;
export const publishPromptHubPrompt = publishPrompt;
