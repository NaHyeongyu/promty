import { describe, expect, it } from "vitest";
import { selectAdminText, translateAdminServerText } from "./useAdminLocale";

describe("admin locale helpers", () => {
  it("switches static administrator copy between English and Korean", () => {
    expect(selectAdminText("en", "Security", "보안")).toBe("Security");
    expect(selectAdminText("ko", "Security", "보안")).toBe("보안");
  });

  it("translates known operational findings and preserves unknown server copy", () => {
    expect(translateAdminServerText("ko", "Generation jobs failed")).toBe("생성 작업 실패");
    expect(translateAdminServerText("ko", "Support inquiries need review")).toBe("확인이 필요한 문의");
    expect(translateAdminServerText("ko", "Custom provider warning")).toBe("Custom provider warning");
    expect(translateAdminServerText("en", "Generation jobs failed")).toBe("Generation jobs failed");
  });
});
