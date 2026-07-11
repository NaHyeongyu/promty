import type {
  AccountCollectorToken,
  AccountCollectorTokenCreateResponse,
  AccountOverview,
} from "../workspace/types";
import { requestJson, requestJsonBody } from "./client";

export function fetchAccountOverview(signal?: AbortSignal): Promise<AccountOverview> {
  return requestJson<AccountOverview>(
    "/api/account/overview",
    { signal },
    {
      errorMessage: "Account settings request failed",
      unauthorizedMessage: "Sign in again before opening account settings.",
    },
  );
}

export function createAccountCollectorToken(
  name?: string,
): Promise<AccountCollectorTokenCreateResponse> {
  return requestJsonBody<AccountCollectorTokenCreateResponse>(
    "/api/account/collector-tokens",
    "POST",
    { name },
    {
      errorMessage: "Collector token creation failed",
      unauthorizedMessage: "Sign in again before creating collector tokens.",
    },
  );
}

export function renameAccountCollectorToken(
  tokenId: string,
  name: string,
): Promise<AccountCollectorToken> {
  return requestJsonBody<AccountCollectorToken>(
    `/api/account/collector-tokens/${encodeURIComponent(tokenId)}`,
    "PATCH",
    { name },
    {
      errorMessage: "Collector token update failed",
      unauthorizedMessage: "Sign in again before updating collector tokens.",
    },
  );
}

export function revokeAccountCollectorToken(
  tokenId: string,
): Promise<AccountCollectorToken> {
  return requestJson<AccountCollectorToken>(
    `/api/account/collector-tokens/${encodeURIComponent(tokenId)}/revoke`,
    { method: "POST" },
    {
      errorMessage: "Collector token revoke failed",
      unauthorizedMessage: "Sign in again before revoking collector tokens.",
    },
  );
}

export function disconnectAccountGithubConnection(): Promise<
  AccountOverview["github_connection"]
> {
  return requestJson<AccountOverview["github_connection"]>(
    "/api/account/github-connection/disconnect",
    { method: "POST" },
    {
      errorMessage: "GitHub connection disconnect failed",
      unauthorizedMessage: "Sign in again before changing GitHub connection.",
    },
  );
}
