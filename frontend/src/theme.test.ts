import { describe, expect, it } from "vitest";
import { DEFAULT_APP_THEME, resolveAppTheme } from "./theme";

describe("resolveAppTheme", () => {
  it("accepts the supported themes", () => {
    expect(resolveAppTheme("dark")).toBe("dark");
    expect(resolveAppTheme("bright")).toBe("bright");
  });

  it("falls back to the dark theme", () => {
    expect(resolveAppTheme(null)).toBe(DEFAULT_APP_THEME);
    expect(resolveAppTheme("system")).toBe(DEFAULT_APP_THEME);
  });
});
