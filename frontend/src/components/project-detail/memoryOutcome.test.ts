import { describe, expect, it } from "vitest";
import { displayMemoryOutcome } from "./memoryOutcome";

describe("displayMemoryOutcome", () => {
  it("keeps a concise final result", () => {
    expect(
      displayMemoryOutcome(
        "The memory worker and resumable chunk processing were implemented.",
        "Memory processing improvements",
      ),
    ).toBe("The memory worker and resumable chunk processing were implemented.");
  });

  it("hides raw event timelines", () => {
    expect(
      displayMemoryOutcome(
        "PromptSubmitted event for turn 019f595d-a0ed-7233-b231-c65ce5b2c97b. FilesChanged event reported no changes.",
        "The session completed without file changes.",
      ),
    ).toBeNull();
  });

  it("does not repeat the summary", () => {
    expect(displayMemoryOutcome("Implemented the UI update.", "Implemented the UI update.")).toBeNull();
  });
});
