import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProjectShareUrl, externalProjectHref, publicProjectUrl } from "./projectUrls";
import type { Project } from "./types";

const project: Project = {
  createdTimestamp: "2026-07-16T00:00:00Z",
  events: 0,
  filesChanged: 0,
  id: "11111111-1111-4111-8111-111111111111",
  isBookmarked: false,
  latestActivityLabel: "No activity",
  latestTimestamp: "",
  latestUpdatedAt: "2026-07-16T00:00:00Z",
  memoryCount: 0,
  models: [],
  name: "Public demo",
  pendingMemoryCount: 0,
  prompts: 0,
  sessions: 0,
  tags: [],
  trackedFiles: 0,
  visibility: "public",
};

beforeEach(() => {
  vi.stubGlobal("window", {
    location: {
      origin: "http://localhost:3000",
      pathname: "/",
      search: "",
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("public project links", () => {
  it("builds a deep link to the read-only explore view", () => {
    expect(publicProjectUrl(project.id)).toBe(
      `http://localhost:3000/?view=explore&public_project=${project.id}`,
    );
  });

  it("shares the public view instead of the owner's workspace", () => {
    expect(buildProjectShareUrl(project, "public-demo", "memory")).toBe(
      publicProjectUrl(project.id),
    );
  });
});
