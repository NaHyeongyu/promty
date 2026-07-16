import { useCallback, useRef, useState } from "react";
import { UnauthorizedError } from "../api/client";
import {
  archivePublishedFlowByKey,
  createPublishedFlow as createPublishedFlowRequest,
  fetchPublishedFlowDetail,
  fetchPublishedFlows,
  updatePublishedFlowByKey,
  uploadPublishedFlowAssetByKey,
} from "../api/publishedFlows";
import type {
  PromptFlowCreatePayload,
  PromptFlowUpdatePayload,
  PublishedFlowAsset,
} from "../components/project-detail";
import type {
  PublishedFlowDetailResponse,
  PublishedFlowSummary,
} from "../workspace/types";

export function usePublishedFlows({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [publishedFlows, setPublishedFlows] = useState<PublishedFlowSummary[]>([]);
  const [publishedFlowsError, setPublishedFlowsError] = useState<string | null>(null);
  const [isPublishedFlowsLoading, setIsPublishedFlowsLoading] = useState(false);
  const [selectedPublishedFlow, setSelectedPublishedFlow] =
    useState<PublishedFlowDetailResponse | null>(null);
  const [publishedFlowDetailError, setPublishedFlowDetailError] =
    useState<string | null>(null);
  const [isPublishedFlowDetailLoading, setIsPublishedFlowDetailLoading] =
    useState(false);
  const [isPublishedFlowSaving, setIsPublishedFlowSaving] = useState(false);
  const listRequestVersion = useRef(0);
  const detailRequestVersion = useRef(0);

  const applyPublishedFlowUpdate = useCallback((flow: PublishedFlowDetailResponse) => {
    setPublishedFlows((current) => {
      const next = current.map((item) => (item.id === flow.id ? flow : item));
      return next.some((item) => item.id === flow.id) ? next : [flow, ...current];
    });
    setSelectedPublishedFlow(flow);
    setPublishedFlowsError(null);
    setPublishedFlowDetailError(null);
  }, []);

  const clearPublishedFlows = useCallback(() => {
    listRequestVersion.current += 1;
    detailRequestVersion.current += 1;
    setPublishedFlows([]);
    setPublishedFlowsError(null);
    setSelectedPublishedFlow(null);
    setPublishedFlowDetailError(null);
    setIsPublishedFlowsLoading(false);
    setIsPublishedFlowDetailLoading(false);
    setIsPublishedFlowSaving(false);
  }, []);

  const loadPublishedFlows = useCallback(async (query = "", signal?: AbortSignal) => {
    const requestVersion = ++listRequestVersion.current;
    setIsPublishedFlowsLoading(true);
    setPublishedFlowsError(null);
    try {
      const payload = await fetchPublishedFlows(query, signal);
      if (requestVersion === listRequestVersion.current && !signal?.aborted) {
        setPublishedFlows(payload);
      }
    } catch (error) {
      if (signal?.aborted || requestVersion !== listRequestVersion.current) return;
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        setPublishedFlows([]);
        return;
      }
      setPublishedFlowsError(
        error instanceof Error ? error.message : "Prompt flows request failed",
      );
    } finally {
      if (requestVersion === listRequestVersion.current) {
        setIsPublishedFlowsLoading(false);
      }
    }
  }, [onUnauthorized]);

  const loadPublishedFlowDetail = useCallback(async (
    flowKey: string,
    signal?: AbortSignal,
  ) => {
    const requestVersion = ++detailRequestVersion.current;
    setSelectedPublishedFlow(null);
    setPublishedFlowDetailError(null);
    setIsPublishedFlowDetailLoading(true);
    try {
      const flow = await fetchPublishedFlowDetail(flowKey, signal);
      if (requestVersion === detailRequestVersion.current && !signal?.aborted) {
        setSelectedPublishedFlow(flow);
      }
    } catch (error) {
      if (signal?.aborted || requestVersion !== detailRequestVersion.current) return;
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setPublishedFlowDetailError(
        error instanceof Error ? error.message : "Prompt flow request failed",
      );
    } finally {
      if (requestVersion === detailRequestVersion.current) {
        setIsPublishedFlowDetailLoading(false);
      }
    }
  }, [onUnauthorized]);

  const runMutation = useCallback(async (
    operation: () => Promise<PublishedFlowDetailResponse>,
  ) => {
    setIsPublishedFlowSaving(true);
    try {
      const flow = await operation();
      applyPublishedFlowUpdate(flow);
      return flow;
    } catch (error) {
      if (error instanceof UnauthorizedError) onUnauthorized();
      throw error;
    } finally {
      setIsPublishedFlowSaving(false);
    }
  }, [applyPublishedFlowUpdate, onUnauthorized]);

  const createPublishedFlow = useCallback(
    (payload: PromptFlowCreatePayload) =>
      runMutation(() => createPublishedFlowRequest(payload)),
    [runMutation],
  );
  const updatePublishedFlow = useCallback(
    (flowKey: string, payload: PromptFlowUpdatePayload) =>
      runMutation(() => updatePublishedFlowByKey(flowKey, payload)),
    [runMutation],
  );
  const archivePublishedFlow = useCallback(
    (flowKey: string) => runMutation(() => archivePublishedFlowByKey(flowKey)),
    [runMutation],
  );
  const uploadPublishedFlowAsset = useCallback(async (
    flowKey: string,
    file: File,
    altText?: string,
  ): Promise<PublishedFlowAsset> => {
    try {
      return await uploadPublishedFlowAssetByKey(flowKey, file, altText);
    } catch (error) {
      if (error instanceof UnauthorizedError) onUnauthorized();
      throw error;
    }
  }, [onUnauthorized]);

  return {
    archivePublishedFlow,
    clearPublishedFlows,
    createPublishedFlow,
    isPublishedFlowDetailLoading,
    isPublishedFlowSaving,
    isPublishedFlowsLoading,
    loadPublishedFlowDetail,
    loadPublishedFlows,
    publishedFlowDetailError,
    publishedFlows,
    publishedFlowsError,
    selectedPublishedFlow,
    updatePublishedFlow,
    uploadPublishedFlowAsset,
  };
}
