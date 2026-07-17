import { describe, expect, it } from "vitest";
import { collectorUpdateCommand } from "./CollectorUpdateModal";

describe("collectorUpdateCommand", () => {
  it("builds a production Codex update command", () => {
    expect(collectorUpdateCommand("prod", "codex-cli")).toBe(
      "npx promty-collector@latest init --tool codex-cli --profile prod",
    );
  });

  it("builds a mirrored multi-tool update command", () => {
    expect(collectorUpdateCommand("both", "all")).toBe(
      "npx promty-collector@latest init --tool all --profiles dev,prod",
    );
  });
});
