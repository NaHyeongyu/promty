import { useState } from "react";
import { UnauthorizedError } from "../api/client";
import {
  archivePublishedFlowByKey,
  fetchPublishedFlowDetail,
  fetchPublishedFlows,
  updatePublishedFlowByKey,
  uploadPublishedFlowAssetByKey,
} from "../api/publishedFlows";
import type {
  PublishedFlowAsset,
  PromptFlowUpdatePayload,
} from "../components/project-detail";
import type {
  PublishedFlowDetailResponse,
  PublishedFlowSummary,
} from "../workspace/types";

type UsePublishedFlowsOptions = {
  onUnauthorized: () => void;
};

export function usePublishedFlows({ onUnauthorized }: UsePublishedFlowsOptions) {
  const [publishedFlows, setPublishedFlows] = useState<PublishedFlowSummary[]>([]);
  const [publishedFlowsError, setPublishedFlowsError] = useState<string | null>(null);
  const [isPublishedFlowsLoading, setIsPublishedFlowsLoading] = useState(false);
  const [selectedPublishedFlowKey, setSelectedPublishedFlowKey] =
    useState<string | null>(null);
  const [selectedPublishedFlow, setSelectedPublishedFlow] =
    useState<PublishedFlowDetailResponse | null>(null);
  const [publishedFlowDetailError, setPublishedFlowDetailError] =
    useState<string | null>(null);
  const [isPublishedFlowDetailLoading, setIsPublishedFlowDetailLoading] =
    useState(false);
  const [isPublishedFlowSaving, setIsPublishedFlowSaving] = useState(false);

  const rethrowAfterUnauthorized = (error: unknown): never => {
    if (error instanceof UnauthorizedError) {
      onUnauthorized();
    }
    throw error;
  };

  const clearPublishedFlows = () => {
    setPublishedFlows([]);
    setPublishedFlowsError(null);
    setSelectedPublishedFlowKey(null);
    setSelectedPublishedFlow(null);
    setPublishedFlowDetailError(null);
    setIsPublishedFlowsLoading(false);
    setIsPublishedFlowDetailLoading(false);
    setIsPublishedFlowSaving(false);
  };

  const applyPublishedFlowUpdate = (flow: PublishedFlowDetailResponse) => {
    setPublishedFlows((current) => {
      const next = current.map((item) => (item.id === flow.id ? flow : item));
      return next.some((item) => item.id === flow.id) ? next : [flow, ...current];
    });
    setSelectedPublishedFlowKey(flow.slug);
    setSelectedPublishedFlow(flow);
    setPublishedFlowsError(null);
    setPublishedFlowDetailError(null);
  };

  const loadPublishedFlows = async () => {
    setIsPublishedFlowsLoading(true);
    setPublishedFlowsError(null);
    try {
      const payload = await fetchPublishedFlows();
      setPublishedFlows(payload);
      if (!selectedPublishedFlowKey && payload.length > 0) {
        setSelectedPublishedFlowKey(payload[0].slug);
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        setPublishedFlows([]);
        return;
      }
      setPublishedFlowsError(
        error instanceof Error ? error.message : "Prompt flows request failed",
      );
      setPublishedFlows([]);
    } finally {
      setIsPublishedFlowsLoading(false);
    }
  };

  const loadPublishedFlowDetail = async (flowKey: string) => {
    setSelectedPublishedFlowKey(flowKey);
    setSelectedPublishedFlow(null);
    setPublishedFlowDetailError(null);
    setIsPublishedFlowDetailLoading(true);
    try {
      setSelectedPublishedFlow(await fetchPublishedFlowDetail(flowKey));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        onUnauthorized();
        setSelectedPublishedFlow(null);
        return;
      }
      setPublishedFlowDetailError(
        error instanceof Error ? error.message : "Prompt flow request failed",
      );
    } finally {
      setIsPublishedFlowDetailLoading(false);
    }
  };

  const updatePublishedFlow = async (
    flowKey: string,
    payload: PromptFlowUpdatePayload,
  ): Promise<PublishedFlowDetailResponse> => {
    setIsPublishedFlowSaving(true);
    try {
      const flow = await updatePublishedFlowByKey(flowKey, payload);
      applyPublishedFlowUpdate(flow);
      return flow;
    } catch (error) {
      return rethrowAfterUnauthorized(error);
    } finally {
      setIsPublishedFlowSaving(false);
    }
  };

  const uploadPublishedFlowAsset = async (
    flowKey: string,
    file: File,
    altText?: string,
  ): Promise<PublishedFlowAsset> => {
    try {
      return await uploadPublishedFlowAssetByKey(flowKey, file, altText);
    } catch (error) {
      return rethrowAfterUnauthorized(error);
    }
  };

  const archivePublishedFlow = async (
    flowKey: string,
  ): Promise<PublishedFlowDetailResponse> => {
    setIsPublishedFlowSaving(true);
    try {
      const flow = await archivePublishedFlowByKey(flowKey);
      applyPublishedFlowUpdate(flow);
      return flow;
    } catch (error) {
      return rethrowAfterUnauthorized(error);
    } finally {
      setIsPublishedFlowSaving(false);
    }
  };

  return {
    archivePublishedFlow,
    clearPublishedFlows,
    isPublishedFlowDetailLoading,
    isPublishedFlowSaving,
    isPublishedFlowsLoading,
    loadPublishedFlowDetail,
    loadPublishedFlows,
    publishedFlowDetailError,
    publishedFlows,
    publishedFlowsError,
    selectedPublishedFlow,
    selectedPublishedFlowKey,
    updatePublishedFlow,
    uploadPublishedFlowAsset,
  };
}
