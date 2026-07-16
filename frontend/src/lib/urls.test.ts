import { describe, expect, it } from "vitest";
import { safeExternalHttpUrl } from "./urls";

describe("safeExternalHttpUrl", () => {
  it("allows normal http and https links", () => {
    expect(safeExternalHttpUrl("https://example.com/project")).toBe(
      "https://example.com/project",
    );
    expect(safeExternalHttpUrl("http://localhost:3000/demo")).toBe(
      "http://localhost:3000/demo",
    );
  });

  it("rejects executable and credential-bearing links", () => {
    expect(safeExternalHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalHttpUrl("data:text/html,unsafe")).toBeNull();
    expect(safeExternalHttpUrl("https://user:password@example.com")).toBeNull();
  });
});
