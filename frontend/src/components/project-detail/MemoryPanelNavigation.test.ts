import { describe, expect, it } from "vitest";
import memoryPanelSource from "./MemoryPanel.tsx?raw";
import {
  MEMORY_PANEL_VIEWS,
  nextMemoryPanelView,
} from "./MemoryPanel";

describe("MemoryPanel graph navigation", () => {
  it("keeps the graph in the keyboard-operable tab cycle", () => {
    expect(MEMORY_PANEL_VIEWS).toEqual(["history", "current", "graph"]);
    expect(nextMemoryPanelView("history", "ArrowRight")).toBe("current");
    expect(nextMemoryPanelView("current", "ArrowRight")).toBe("graph");
    expect(nextMemoryPanelView("graph", "ArrowRight")).toBe("history");
    expect(nextMemoryPanelView("history", "ArrowLeft")).toBe("graph");
    expect(nextMemoryPanelView("current", "Home")).toBe("history");
    expect(nextMemoryPanelView("history", "End")).toBe("graph");
  });

  it("links the graph tab and panel with ARIA controls", () => {
    expect(memoryPanelSource).toContain('aria-controls="memory-view-panel-graph"');
    expect(memoryPanelSource).toContain('aria-labelledby="memory-view-tab-graph"');
    expect(memoryPanelSource).toContain("<ContextGraphPanel");
  });

  it("uses deletion, not inclusion toggles, in the generation review", () => {
    expect(memoryPanelSource).toContain('setReviewBrowseMode("prompts")');
    expect(memoryPanelSource).toContain("onDeletePromptActivity");
    expect(memoryPanelSource).toContain("onDeleteSessionActivity");
    expect(memoryPanelSource).toContain("onGenerateProjectMemory(reviewToken, [])");
    expect(memoryPanelSource).toContain("toggleReviewSession");
    expect(memoryPanelSource).toContain("<ExpandableReviewText");
    expect(memoryPanelSource).not.toContain("setPromptIncluded");
    expect(memoryPanelSource).not.toContain("setSessionIncluded");
    expect(memoryPanelSource).not.toContain("setAllPromptsIncluded");
  });
});
