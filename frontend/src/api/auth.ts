import type { AuthUser } from "../workspace/types";
import { requestJson, requestVoid } from "./client";

let preloadedCurrentUser: Promise<AuthUser> | null = null;

function requestCurrentUser(): Promise<AuthUser> {
  return requestJson<AuthUser>("/api/auth/me", {}, {
    errorMessage: "Session request failed",
  });
}

export function preloadCurrentUser(): void {
  preloadedCurrentUser ??= requestCurrentUser();
  void preloadedCurrentUser.catch(() => undefined);
}

export function fetchCurrentUser(): Promise<AuthUser> {
  if (!preloadedCurrentUser) {
    return requestCurrentUser();
  }
  const request = preloadedCurrentUser;
  preloadedCurrentUser = null;
  return request;
}

export function logoutSession(): Promise<void> {
  return requestVoid("/api/auth/logout", { method: "POST" });
}
