import { describe, expect, it } from "vitest";
import { publicCollectorCommand } from "./LandingPage";

describe("publicCollectorCommand", () => {
  it("installs the latest collector against the production profile", () => {
    expect(publicCollectorCommand).toBe(
      "npx promty-collector@latest init --tool codex-cli --profile prod",
    );
  });
});
