import { requestJsonBody } from "./client";

export type SupportInquiryCategory =
  | "question"
  | "bug"
  | "feature"
  | "privacy"
  | "other";

export type SupportInquiryResponse = {
  created_at: string;
  id: string;
  status: "received";
};

export function submitSupportInquiry(payload: {
  category: SupportInquiryCategory;
  message: string;
  reply_email: string;
  subject: string;
}) {
  return requestJsonBody<SupportInquiryResponse>(
    "/api/support/inquiries",
    "POST",
    payload,
    { errorMessage: "Your inquiry could not be submitted." },
  );
}
