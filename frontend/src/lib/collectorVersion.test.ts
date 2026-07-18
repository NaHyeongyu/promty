import { describe, expect, it } from "vitest";
import { isCollectorUpdateAvailable } from "./collectorVersion";

describe("isCollectorUpdateAvailable", () => {
  it("detects an older collector", () => {
    expect(isCollectorUpdateAvailable("0.1.2", "0.1.4")).toBe(true);
  });

  it("does not flag equal or newer collectors", () => {
    expect(isCollectorUpdateAvailable("0.1.4", "0.1.4")).toBe(false);
    expect(isCollectorUpdateAvailable("0.2.0", "0.1.4")).toBe(false);
  });

  it("ignores missing or malformed versions", () => {
    expect(isCollectorUpdateAvailable(null, "0.1.4")).toBe(false);
    expect(isCollectorUpdateAvailable("unknown", "0.1.4")).toBe(false);
  });
});
