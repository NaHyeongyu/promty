import { describe, expect, it } from "vitest";
import { githubFileUrl, githubRepositoryUrl } from "./github";

describe("githubFileUrl", () => {
  it("builds a GitHub blob URL from an HTTPS repository", () => {
    expect(
      githubFileUrl(
        "https://github.com/example/promty.git",
        "develop",
        "frontend/src/main.tsx",
      ),
    ).toBe(
      "https://github.com/example/promty/blob/develop/frontend/src/main.tsx",
    );
  });

  it("normalizes an SSH GitHub remote and encodes path segments", () => {
    expect(
      githubFileUrl(
        "git@github.com:example/promty.git",
        "feature/files",
        "docs/My guide.md",
      ),
    ).toBe(
      "https://github.com/example/promty/blob/feature/files/docs/My%20guide.md",
    );
  });

  it("rejects missing or unsafe repository URLs", () => {
    expect(githubFileUrl(null, "main", "README.md")).toBeNull();
    expect(githubFileUrl("javascript:alert(1)", "main", "README.md")).toBeNull();
    expect(
      githubFileUrl("https://example.com/example/promty", "main", "README.md"),
    ).toBeNull();
    expect(
      githubFileUrl("https://user:password@github.com/example/promty", "main", "README.md"),
    ).toBeNull();
  });
});

describe("githubRepositoryUrl", () => {
  it("normalizes supported GitHub repository URLs", () => {
    expect(githubRepositoryUrl("git@github.com:example/promty.git")).toBe(
      "https://github.com/example/promty",
    );
    expect(githubRepositoryUrl("https://github.com/example/promty.git")).toBe(
      "https://github.com/example/promty",
    );
  });

  it("rejects non-GitHub and unsafe URLs", () => {
    expect(githubRepositoryUrl("javascript:alert(1)")).toBeNull();
    expect(githubRepositoryUrl("https://example.com/example/promty")).toBeNull();
    expect(
      githubRepositoryUrl("https://user:password@github.com/example/promty"),
    ).toBeNull();
    expect(
      githubRepositoryUrl("https://github.com/example/promty?token=private#fragment"),
    ).toBe("https://github.com/example/promty");
  });
});
