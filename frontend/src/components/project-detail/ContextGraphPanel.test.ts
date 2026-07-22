import { describe, expect, it } from "vitest";
import type {
  ProjectContextGraphEdge,
  ProjectContextGraphNode,
  ProjectContextGraphNodeKind,
} from "../../api/projects";
import {
  buildContextGraphLayout,
  visibleContextGraphMetadata,
} from "./ContextGraphPanel";
import componentSource from "./ContextGraphPanel.tsx?raw";

function graphNode(
  id: string,
  kind: ProjectContextGraphNodeKind,
  overrides: Partial<ProjectContextGraphNode> = {},
): ProjectContextGraphNode {
  return {
    agent_visible: true,
    id,
    kind,
    label: id,
    metadata: {},
    occurred_at: null,
    sequence: null,
    session_id: null,
    summary: null,
    ...overrides,
  };
}

describe("ContextGraphPanel", () => {
  it("builds stable four-lane positions and drops dangling links", () => {
    const nodes = [
      graphNode("prompt-later", "prompt", { sequence: 2 }),
      graphNode("memory", "memory"),
      graphNode("file", "file"),
      graphNode("prompt-first", "prompt", { sequence: 1 }),
      graphNode("response", "response"),
      graphNode("prompt-first", "prompt", { sequence: 1 }),
    ];
    const edges: ProjectContextGraphEdge[] = [
      {
        id: "answered",
        inferred: false,
        kind: "answered_by",
        source: "prompt-first",
        target: "response",
      },
      {
        id: "changed",
        inferred: false,
        kind: "changed",
        source: "response",
        target: "file",
      },
      {
        id: "dangling",
        inferred: true,
        kind: "references",
        source: "missing",
        target: "memory",
      },
    ];

    const layout = buildContextGraphLayout(nodes, edges);

    expect(layout.lanes.map((lane) => lane.kind)).toEqual([
      "prompt",
      "response",
      "file",
      "memory",
    ]);
    expect(layout.lanes[0].nodes.map((node) => node.id)).toEqual([
      "prompt-first",
      "prompt-later",
    ]);
    expect(layout.visibleNodes).toHaveLength(5);
    expect(layout.edges.map((edge) => edge.id)).toEqual(["answered", "changed"]);
    expect(layout.edges.every((edge) => edge.path.startsWith("M "))).toBe(true);
    expect(layout.nodePositions.memory.laneIndex).toBe(3);
  });

  it("removes links whose endpoints are hidden by a node type filter", () => {
    const enabledKinds = new Set<ProjectContextGraphNodeKind>(["prompt", "file"]);
    const layout = buildContextGraphLayout(
      [
        graphNode("prompt", "prompt"),
        graphNode("response", "response"),
        graphNode("file", "file"),
      ],
      [
        {
          id: "prompt-response",
          inferred: false,
          kind: "answered_by",
          source: "prompt",
          target: "response",
        },
        {
          id: "prompt-file",
          inferred: true,
          kind: "changed",
          source: "prompt",
          target: "file",
        },
      ],
      enabledKinds,
    );

    expect(layout.visibleNodes.map((node) => node.id)).toEqual(["prompt", "file"]);
    expect(layout.edges.map((edge) => edge.id)).toEqual(["prompt-file"]);
  });

  it("allows concise provenance metadata but never renders patches or content", () => {
    const metadata = visibleContextGraphMetadata({
      additions: 14,
      content: "private source code",
      diff: "+ secret",
      model: "gpt-5",
      patch: "@@ -1 +1 @@",
      random_internal_value: "hidden",
      tags: ["auth", "frontend"],
    });

    expect(Object.fromEntries(metadata)).toEqual({
      additions: 14,
      model: "gpt-5",
      tags: ["auth", "frontend"],
    });
  });

  it("keeps desktop edges decorative and supplies a semantic mobile outline", () => {
    expect(componentSource).toContain('aria-hidden="true"');
    expect(componentSource).toContain('type="search"');
    expect(componentSource).toContain('className="context-graph-mobile"');
    expect(componentSource).toContain('className="context-graph-edges"');
    expect(componentSource).toContain("<ol>");
  });
});
