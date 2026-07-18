import type { AuthUser } from "../workspace/types";
import { requestJson, requestVoid } from "./client";

let cachedCurrentUser: AuthUser | null = null;
let currentUserRequest: Promise<AuthUser> | null = null;
let currentUserCacheGeneration = 0;

function requestCurrentUser(): Promise<AuthUser> {
  const requestGeneration = currentUserCacheGeneration;
  const request = requestJson<AuthUser>("/api/auth/me", {}, {
    errorMessage: "Session request failed",
  })
    .then((user) => {
      if (requestGeneration === currentUserCacheGeneration) {
        cachedCurrentUser = user;
      }
      return user;
    })
    .catch((error) => {
      if (requestGeneration === currentUserCacheGeneration) {
        currentUserRequest = null;
      }
      throw error;
    });
  currentUserRequest = request;
  return request;
}

export function preloadCurrentUser(): void {
  if (cachedCurrentUser || currentUserRequest) {
    return;
  }
  void requestCurrentUser().catch(() => undefined);
}

export function fetchCurrentUser(): Promise<AuthUser> {
  if (cachedCurrentUser) {
    return Promise.resolve(cachedCurrentUser);
  }
  return currentUserRequest ?? requestCurrentUser();
}

export function getCachedCurrentUser(): AuthUser | null {
  return cachedCurrentUser;
}

export function updateCachedCurrentUser(update: Partial<AuthUser>): void {
  if (cachedCurrentUser) {
    cachedCurrentUser = { ...cachedCurrentUser, ...update };
  }
}

export function clearCurrentUserCache(): void {
  currentUserCacheGeneration += 1;
  cachedCurrentUser = null;
  currentUserRequest = null;
}

export function logoutSession(): Promise<void> {
  return requestVoid("/api/auth/logout", { method: "POST" }).finally(() => {
    clearCurrentUserCache();
  });
}
