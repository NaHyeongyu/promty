import type {
  PublishedFlowAsset,
  PromptFlowUpdatePayload,
} from "../components/project-detail";
import type {
  PublishedFlowDetailResponse,
  PublishedFlowSummary,
} from "../workspace/types";
import { requestJson, requestJsonBody } from "./client";

export function fetchPublishedFlows(): Promise<PublishedFlowSummary[]> {
  return requestJson<PublishedFlowSummary[]>("/api/published-flows", {}, {
    errorMessage: "Prompt flows request failed",
  });
}

export function fetchPublishedFlowDetail(
  flowKey: string,
): Promise<PublishedFlowDetailResponse> {
  return requestJson<PublishedFlowDetailResponse>(
    `/api/published-flows/${encodeURIComponent(flowKey)}`,
    {},
    {
      errorMessage: "Prompt flow request failed",
    },
  );
}

export function updatePublishedFlowByKey(
  flowKey: string,
  payload: PromptFlowUpdatePayload,
): Promise<PublishedFlowDetailResponse> {
  return requestJsonBody<PublishedFlowDetailResponse>(
    `/api/published-flows/${encodeURIComponent(flowKey)}`,
    "PATCH",
    payload,
    {
      errorMessage: "Update request failed",
      unauthorizedMessage: "Sign in again before saving.",
    },
  );
}

export function uploadPublishedFlowAssetByKey(
  flowKey: string,
  file: File,
  altText?: string,
): Promise<PublishedFlowAsset> {
  const formData = new FormData();
  formData.append("file", file);
  if (altText?.trim()) {
    formData.append("alt_text", altText.trim());
  }

  return requestJson<PublishedFlowAsset>(
    `/api/published-flows/${encodeURIComponent(flowKey)}/assets`,
    {
      body: formData,
      method: "POST",
    },
    {
      errorMessage: "Image upload failed",
      unauthorizedMessage: "Sign in again before uploading images.",
    },
  );
}

export function archivePublishedFlowByKey(
  flowKey: string,
): Promise<PublishedFlowDetailResponse> {
  return requestJson<PublishedFlowDetailResponse>(
    `/api/published-flows/${encodeURIComponent(flowKey)}/archive`,
    { method: "POST" },
    {
      errorMessage: "Archive request failed",
      unauthorizedMessage: "Sign in again before archiving.",
    },
  );
}
