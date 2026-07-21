import { useState } from "react";
import {
  createAccountCollectorToken,
  deleteCurrentAccount,
  disconnectAccountGithubConnection,
  fetchAccountOverview,
  renameAccountCollectorToken,
  revokeAccountCollectorToken,
  updateAccountPreferences,
  updateAccountPolicyConsents,
} from "../api/account";
import { clearCurrentUserCache, updateCachedCurrentUser } from "../api/auth";
import type { AppLocale } from "../i18n/I18nProvider";
import { UnauthorizedError } from "../api/client";
import type {
  AccountCollectorTokenCreateResponse,
  AccountOverview,
} from "../workspace/types";

type UseAccountSettingsOptions = {
  onUnauthorized: () => void;
};

export function useAccountSettings({ onUnauthorized }: UseAccountSettingsOptions) {
  const [accountOverview, setAccountOverview] = useState<AccountOverview | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [isAccountLoading, setIsAccountLoading] = useState(false);
  const [isAccountSaving, setIsAccountSaving] = useState(false);
  const [createdCollectorToken, setCreatedCollectorToken] =
    useState<AccountCollectorTokenCreateResponse | null>(null);

  const clearAccountSettings = () => {
    setAccountOverview(null);
    setAccountError(null);
    setIsAccountLoading(false);
    setIsAccountSaving(false);
    setCreatedCollectorToken(null);
  };

  const handleAccountError = (error: unknown, fallback: string) => {
    if (error instanceof UnauthorizedError) {
      onUnauthorized();
      setAccountOverview(null);
      return;
    }
    setAccountError(error instanceof Error ? error.message : fallback);
  };

  const loadAccountOverview = async (signal?: AbortSignal) => {
    setIsAccountLoading(true);
    setAccountError(null);
    try {
      setAccountOverview(await fetchAccountOverview(signal));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      handleAccountError(error, "Account settings request failed");
    } finally {
      if (!signal?.aborted) {
        setIsAccountLoading(false);
      }
    }
  };

  const refreshAccountOverview = async (signal?: AbortSignal) => {
    try {
      setAccountOverview(await fetchAccountOverview(signal));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        setAccountOverview(null);
      }
    }
  };

  const createCollectorToken = async (
    name?: string,
  ): Promise<AccountCollectorTokenCreateResponse | null> => {
    setIsAccountSaving(true);
    setAccountError(null);
    try {
      const response = await createAccountCollectorToken(name);
      setCreatedCollectorToken(response);
      setAccountOverview((current) =>
        current
          ? {
              ...current,
              collector_tokens: [
                response.collector_token,
                ...current.collector_tokens,
              ],
            }
          : current,
      );
      return response;
    } catch (error) {
      handleAccountError(error, "Collector token creation failed");
      return null;
    } finally {
      setIsAccountSaving(false);
    }
  };

  const deleteAccount = async (confirmation: string): Promise<boolean> => {
    setIsAccountSaving(true);
    setAccountError(null);
    try {
      await deleteCurrentAccount(confirmation);
      clearCurrentUserCache();
      setAccountOverview(null);
      onUnauthorized();
      return true;
    } catch (error) {
      handleAccountError(error, "Account deletion failed");
      return false;
    } finally {
      setIsAccountSaving(false);
    }
  };

  const renameCollectorToken = async (tokenId: string, name: string) => {
    setIsAccountSaving(true);
    setAccountError(null);
    try {
      const token = await renameAccountCollectorToken(tokenId, name);
      setAccountOverview((current) =>
        current
          ? {
              ...current,
              collector_tokens: current.collector_tokens.map((item) =>
                item.id === token.id ? token : item,
              ),
            }
          : current,
      );
    } catch (error) {
      handleAccountError(error, "Collector token update failed");
    } finally {
      setIsAccountSaving(false);
    }
  };

  const revokeCollectorToken = async (tokenId: string) => {
    setIsAccountSaving(true);
    setAccountError(null);
    try {
      const token = await revokeAccountCollectorToken(tokenId);
      setAccountOverview((current) =>
        current
          ? {
              ...current,
              collector_tokens: current.collector_tokens.map((item) =>
                item.id === token.id ? token : item,
              ),
            }
          : current,
      );
    } catch (error) {
      handleAccountError(error, "Collector token revoke failed");
    } finally {
      setIsAccountSaving(false);
    }
  };

  const disconnectGithubConnection = async () => {
    setIsAccountSaving(true);
    setAccountError(null);
    try {
      const githubConnection = await disconnectAccountGithubConnection();
      updateCachedCurrentUser({ github_repository_access: false });
      setAccountOverview((current) =>
        current ? { ...current, github_connection: githubConnection } : current,
      );
    } catch (error) {
      handleAccountError(error, "GitHub connection disconnect failed");
    } finally {
      setIsAccountSaving(false);
    }
  };

  const updatePreferredLocale = async (preferredLocale: AppLocale) => {
    setIsAccountSaving(true);
    setAccountError(null);
    try {
      const preferences = await updateAccountPreferences(preferredLocale);
      updateCachedCurrentUser({ preferred_locale: preferences.preferred_locale });
      setAccountOverview((current) =>
        current
          ? {
              ...current,
              user: {
                ...current.user,
                preferred_locale: preferences.preferred_locale,
              },
            }
          : current,
      );
    } catch (error) {
      handleAccountError(error, "Account language update failed");
      throw error;
    } finally {
      setIsAccountSaving(false);
    }
  };

  const updatePolicyConsents = async (allowExternalAi: boolean) => {
    setIsAccountSaving(true);
    setAccountError(null);
    try {
      const policyConsents = await updateAccountPolicyConsents(allowExternalAi);
      setAccountOverview((current) =>
        current ? { ...current, policy_consents: policyConsents } : current,
      );
      return true;
    } catch (error) {
      handleAccountError(error, "Policy preferences could not be saved");
      return false;
    } finally {
      setIsAccountSaving(false);
    }
  };

  return {
    accountError,
    accountOverview,
    clearAccountSettings,
    createCollectorToken,
    createdCollectorToken,
    deleteAccount,
    disconnectGithubConnection,
    isAccountLoading,
    isAccountSaving,
    loadAccountOverview,
    refreshAccountOverview,
    renameCollectorToken,
    revokeCollectorToken,
    setCreatedCollectorToken,
    updatePreferredLocale,
    updatePolicyConsents,
  };
}

export type AccountSettingsController = ReturnType<typeof useAccountSettings>;
