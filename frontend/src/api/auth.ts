import type { AuthUser } from "../workspace/types";
import { requestJson, requestVoid } from "./client";

export function fetchCurrentUser(): Promise<AuthUser> {
  return requestJson<AuthUser>("/api/auth/me", {}, {
    errorMessage: "Session request failed",
  });
}

export function logoutSession(): Promise<void> {
  return requestVoid("/api/auth/logout", { method: "POST" });
}
