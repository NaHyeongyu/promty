import type {
  PromptFlowCreatePayload,
  PromptFlowUpdatePayload,
  PublishedFlowAsset,
} from "../components/project-detail";
import type {
  PublishedFlowDetailResponse,
  PublishedFlowSummary,
} from "../workspace/types";
import { requestJson, requestJsonBody } from "./client";

export function fetchPublishedFlows(
  query = "",
  signal?: AbortSignal,
): Promise<PublishedFlowSummary[]> {
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set("q", query.trim());
  }
  const search = params.toString();
  return requestJson<PublishedFlowSummary[]>(
    `/api/published-flows${search ? `?${search}` : ""}`,
    { signal },
    { errorMessage: "Prompt flows request failed" },
  );
}

export function fetchPublishedFlowDetail(
  flowKey: string,
  signal?: AbortSignal,
): Promise<PublishedFlowDetailResponse> {
  return requestJson<PublishedFlowDetailResponse>(
    `/api/published-flows/${encodeURIComponent(flowKey)}`,
    { signal },
    { errorMessage: "Prompt flow request failed" },
  );
}

export function createPublishedFlow(
  payload: PromptFlowCreatePayload,
): Promise<PublishedFlowDetailResponse> {
  return requestJsonBody<PublishedFlowDetailResponse>(
    "/api/published-flows",
    "POST",
    payload,
    {
      errorMessage: "Prompt flow draft could not be created",
      unauthorizedMessage: "Sign in again before preparing a community post.",
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
    { body: formData, method: "POST" },
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
