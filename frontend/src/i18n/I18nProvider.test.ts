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
    expect(translateMessage("ko", "error.notFoundTitle")).toBe(
      "페이지를 찾을 수 없습니다",
    );
    expect(
      translateMessage("ja", "project.nameSearchNoMatch", { query: "Promty" }),
    ).toContain("Promty");
  });

  it("explains that collector hooks are installed per repository", () => {
    expect(translateMessage("ko", "collector.repositoryScopeTitle")).toBe(
      "현재 저장소에만 연결됩니다.",
    );
    expect(
      translateMessage("ko", "collector.repositoryScopeDescription"),
    ).toContain("자동으로 수집되지 않습니다");
    expect(
      translateMessage("en", "collector.runFromRepository", { name: "PromptHub" }),
    ).toBe("Run from the root of PromptHub");
    expect(
      translateMessage("ja", "collector.repositoryScopeDescription"),
    ).toContain("自動的に収集されることはありません");
  });

  it("makes the selected collector integration scope explicit", () => {
    expect(translateMessage("ko", "collector.toolChoiceLabel")).toBe(
      "연결할 AI 도구",
    );
    expect(translateMessage("ko", "collector.commandScopeCodex")).toContain(
      "Claude Code 설정은 변경하지 않습니다",
    );
    expect(translateMessage("en", "collector.commandScopeClaude")).toContain(
      "Codex settings stay unchanged",
    );
  });
});
