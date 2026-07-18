import { requestJson, requestJsonBody } from "./client";

export const MARKETING_CHANNELS = [
  "x",
  "threads",
  "bluesky",
  "linkedin",
  "devto",
  "github",
  "reddit",
  "hackernews",
] as const;

export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];
export type MarketingLocale = "ko" | "en";
export type MarketingStatus =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | "failed";

export type MarketingVariant = {
  body: string;
  hashtags: string[];
  title: string;
};

export type MarketingBilingualContent = {
  en: Partial<Record<MarketingChannel, MarketingVariant>>;
  ko: Partial<Record<MarketingChannel, MarketingVariant>>;
};

export type MarketingContent = {
  campaign_name: string;
  channels: MarketingChannel[];
  content: MarketingBilingualContent | Record<string, never>;
  created_at: string | null;
  creator: { id: string; username: string } | null;
  cta_url: string | null;
  delivery_results: Record<string, {
    delivered_at?: string;
    external_id?: string | null;
    external_url?: string | null;
    mode?: string;
    status?: string;
  }>;
  generated_by: string | null;
  id: string;
  last_error: string | null;
  published_at: string | null;
  scheduled_at: string | null;
  source_summary: string;
  source_title: string;
  source_type: "faq" | "manual" | "public_project" | "release" | "support";
  source_url: string | null;
  status: MarketingStatus;
  tone: "founder" | "launch" | "practical" | "technical";
  updated_at: string | null;
};

export type MarketingContentPage = {
  items: MarketingContent[];
  limit: number;
  offset: number;
  total: number;
};

export type MarketingIntegrations = {
  ai: { fallback_template: boolean; gemini: boolean; openai: boolean };
  buffer: { channels: string[]; configured: boolean };
  devto: { configured: boolean; organization_id: number | null };
  github: { configured: boolean };
};

export type MarketingContentCreate = {
  campaign_name: string;
  channels: MarketingChannel[];
  cta_url?: string | null;
  source_summary: string;
  source_title: string;
  source_type: "faq" | "manual" | "public_project" | "release" | "support";
  source_url?: string | null;
  tone: "founder" | "launch" | "practical" | "technical";
};

const messages = {
  errorMessage: "Marketing content request failed",
  forbiddenMessage: "Admin access is required for the marketing studio.",
};

export function fetchMarketingContent(signal?: AbortSignal): Promise<MarketingContentPage> {
  return requestJson("/api/admin/marketing-content?limit=100", { signal }, messages);
}
export function fetchMarketingIntegrations(signal?: AbortSignal): Promise<MarketingIntegrations> {
  return requestJson("/api/admin/marketing-content/integrations", { signal }, messages);
}

export function createMarketingContent(payload: MarketingContentCreate): Promise<MarketingContent> {
  return requestJsonBody("/api/admin/marketing-content", "POST", payload, messages);
}

export function updateMarketingContent(
  id: string,
  payload: Partial<Pick<MarketingContent, "campaign_name" | "channels" | "content" | "cta_url" | "source_summary" | "source_title" | "source_url" | "status" | "tone">>,
): Promise<MarketingContent> {
  return requestJsonBody(`/api/admin/marketing-content/${id}`, "PATCH", payload, messages);
}

export function deleteMarketingContent(
  id: string,
  confirmation: string,
): Promise<{ campaign_name: string; id: string; status: "deleted" }> {
  return requestJsonBody(
    `/api/admin/marketing-content/${id}`,
    "DELETE",
    { confirmation },
    messages,
  );
}

export function generateMarketingContent(
  id: string,
  provider: "auto" | "gemini" | "openai" | "template" = "auto",
): Promise<MarketingContent> {
  return requestJsonBody(
    `/api/admin/marketing-content/${id}/generate`,
    "POST",
    { provider },
    messages,
  );
}

export function approveMarketingContent(id: string): Promise<MarketingContent> {
  return requestJsonBody(
    `/api/admin/marketing-content/${id}/approve`,
    "POST",
    {},
    messages,
  );
}

export function deliverMarketingContent(
  id: string,
  payload: {
    channel: MarketingChannel;
    locale: MarketingLocale;
    mode: "buffer_draft" | "buffer_queue" | "buffer_schedule" | "devto_draft" | "github_discussion" | "manual";
    scheduled_at?: string | null;
  },
): Promise<{
  channel: MarketingChannel;
  external_id: string | null;
  external_url: string | null;
  locale: MarketingLocale;
  mode: string;
  status: "copied" | "drafted" | "published" | "queued" | "scheduled";
}> {
  return requestJsonBody(
    `/api/admin/marketing-content/${id}/deliver`,
    "POST",
    payload,
    messages,
  );
}
