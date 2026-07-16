import { API_URL } from "../config";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(
    message = "Sign in again before continuing.",
    detail: string | null = null,
  ) {
    super(message, 401, detail);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(
    message = "You do not have access to this resource.",
    detail: string | null = null,
  ) {
    super(message, 403, detail);
    this.name = "ForbiddenError";
  }
}

type ApiErrorMessages = {
  errorMessage?: string;
  forbiddenMessage?: string;
  unauthorizedMessage?: string;
};

const apiUrl = (path: string) =>
  path.startsWith("http://") || path.startsWith("https://")
    ? path
    : `${API_URL}${path}`;

export async function readErrorDetail(response: Response): Promise<string | null> {
  return response
    .clone()
    .json()
    .then((payload) => (typeof payload?.detail === "string" ? payload.detail : null))
    .catch(() => null);
}

async function assertOk(response: Response, messages: ApiErrorMessages = {}) {
  if (response.ok) {
    return;
  }

  const detail = await readErrorDetail(response);
  if (response.status === 401) {
    throw new UnauthorizedError(messages.unauthorizedMessage, detail);
  }
  if (response.status === 403) {
    throw new ForbiddenError(
      detail ?? messages.forbiddenMessage ?? "You do not have access to this resource.",
      detail,
    );
  }

  throw new ApiError(
    detail ?? messages.errorMessage ?? `Request failed with HTTP ${response.status}`,
    response.status,
    detail,
  );
}

async function apiFetch(
  path: string,
  init: RequestInit = {},
  messages: ApiErrorMessages = {},
) {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: init.credentials ?? "include",
  });
  await assertOk(response, messages);
  return response;
}

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  messages: ApiErrorMessages = {},
): Promise<T> {
  const response = await apiFetch(path, init, messages);
  return (await response.json()) as T;
}

export async function requestJsonBody<T>(
  path: string,
  method: "DELETE" | "PATCH" | "POST" | "PUT",
  body: unknown,
  messages: ApiErrorMessages = {},
): Promise<T> {
  return requestJson<T>(
    path,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method,
    },
    messages,
  );
}

export async function requestVoid(
  path: string,
  init: RequestInit = {},
  messages: ApiErrorMessages = {},
): Promise<void> {
  await apiFetch(path, init, messages);
}
