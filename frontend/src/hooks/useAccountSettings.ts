import { useState } from "react";
import {
  createAccountCollectorToken,
  disconnectAccountGithubConnection,
  fetchAccountOverview,
  renameAccountCollectorToken,
  revokeAccountCollectorToken,
} from "../api/account";
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
      setAccountOverview((current) =>
        current ? { ...current, github_connection: githubConnection } : current,
      );
    } catch (error) {
      handleAccountError(error, "GitHub connection disconnect failed");
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
    disconnectGithubConnection,
    isAccountLoading,
    isAccountSaving,
    loadAccountOverview,
    renameCollectorToken,
    revokeCollectorToken,
    setCreatedCollectorToken,
  };
}

export type AccountSettingsController = ReturnType<typeof useAccountSettings>;
