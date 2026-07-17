import { describe, expect, it } from "vitest";
import { setupCommandText } from "./SetupCommandBlock";

const developmentContext = {
  apiUrl: "http://127.0.0.1:8011",
  hostname: "127.0.0.1",
  origin: "http://127.0.0.1:5173",
};

describe("setupCommandText", () => {
  it("targets Codex only by default", () => {
    const command = setupCommandText(undefined, developmentContext);

    expect(command).toContain("init --tool codex-cli --profile dev");
    expect(command).not.toContain("--tool all");
    expect(command).not.toContain("--tool claude-code");
  });

  it("uses the explicitly selected integration", () => {
    expect(setupCommandText("claude-code", developmentContext)).toContain(
      "init --tool claude-code --profile dev",
    );
    expect(setupCommandText("all", developmentContext)).toContain(
      "init --tool all --profile dev",
    );
  });

  it("selects the production profile on the production host", () => {
    const command = setupCommandText("codex-cli", {
      apiUrl: "https://api.promty.org",
      hostname: "promty.org",
      origin: "https://promty.org",
    });

    expect(command).toBe(
      "npx promty-collector init --tool codex-cli --profile prod --app-url https://promty.org --api-url https://api.promty.org",
    );
  });
});
