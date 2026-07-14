import { describe, expect, it } from "vitest";
import { externalProjectHref } from "./projectUrls";

describe("externalProjectHref", () => {
  it("adds a protocol only to the clickable target", () => {
    expect(externalProjectHref("www.google.com")).toBe("https://www.google.com");
  });

  it("keeps complete URLs unchanged", () => {
    expect(externalProjectHref("http://example.com/path")).toBe(
      "http://example.com/path",
    );
  });

  it("leaves the default empty", () => {
    expect(externalProjectHref("")).toBeUndefined();
  });
});
