import { describe, expect, it } from "vitest";
import {
  normalizeAppLocale,
  translateMessage,
} from "./I18nProvider";

describe("i18n", () => {
  it("uses English as the default locale", () => {
    expect(normalizeAppLocale(undefined)).toBe("en");
    expect(normalizeAppLocale("fr")).toBe("en");
    expect(translateMessage(undefined, "nav.projects")).toBe("Projects");
    expect(translateMessage("fr", "nav.projects")).toBe("Projects");
  });

  it("supports Korean and Japanese locale values", () => {
    expect(normalizeAppLocale("ko")).toBe("ko");
    expect(normalizeAppLocale("ja")).toBe("ja");
  });

  it("translates and interpolates interface messages", () => {
    expect(translateMessage("ko", "settings.stagesReady", { ready: 3 })).toBe(
      "5단계 중 3단계 준비됨",
    );
    expect(translateMessage("ja", "nav.projects")).toBe("プロジェクト");
    expect(
      translateMessage("ko", "review.reviewGenerateFor", { name: "Promty" }),
    ).toBe("Promty 메모리 리뷰 및 생성");
    expect(
      translateMessage("ko", "project.deleteConfirm", { name: "PromptHub" }),
    ).toContain("PromptHub");
  });
});
