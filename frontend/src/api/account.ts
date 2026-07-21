import type {
  AccountCollectorToken,
  AccountCollectorTokenCreateResponse,
  AccountDeletionResponse,
  AccountOverview,
  AccountPolicyConsents,
} from "../workspace/types";
import type { AppLocale } from "../i18n/I18nProvider";
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

export function deleteCurrentAccount(
  confirmation: string,
): Promise<AccountDeletionResponse> {
  return requestJsonBody<AccountDeletionResponse>(
    "/api/account",
    "DELETE",
    {
      acknowledge_permanent_deletion: true,
      confirmation,
    },
    {
      errorMessage: "Account deletion failed",
      unauthorizedMessage: "Sign in again before deleting your account.",
    },
  );
}

export function updateAccountPreferences(
  preferredLocale: AppLocale,
): Promise<{ preferred_locale: AppLocale }> {
  return requestJsonBody<{ preferred_locale: AppLocale }>(
    "/api/account/preferences",
    "PATCH",
    { preferred_locale: preferredLocale },
    {
      errorMessage: "Account language update failed",
      unauthorizedMessage: "Sign in again before changing your language.",
    },
  );
}

export function updateAccountPolicyConsents(
  allowExternalAi: boolean,
): Promise<AccountPolicyConsents> {
  return requestJsonBody<AccountPolicyConsents>(
    "/api/account/policy-consents",
    "PUT",
    {
      accept_privacy_notice: true,
      accept_terms: true,
      allow_external_ai: allowExternalAi,
      confirm_age_and_business_use: true,
    },
    {
      errorMessage: "Policy preferences could not be saved",
      unauthorizedMessage: "Sign in again before saving policy preferences.",
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
