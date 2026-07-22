import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type RefObject,
} from "react";
import {
  Bot,
  ExternalLink,
  FileCode2,
  MessageSquareText,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  type LucideProps,
} from "lucide-react";
import {
  fetchProjectContextGraph,
  type ProjectContextGraphEdge,
  type ProjectContextGraphNode,
  type ProjectContextGraphNodeKind,
  type ProjectContextGraphResponse,
} from "../../api/projects";
import {
  useI18n,
  type TranslationKey,
} from "../../i18n/I18nProvider";
import "./context-graph.css";

const CONTEXT_GRAPH_LIMIT = 40;
const CONTEXT_GRAPH_ROW_HEIGHT = 84;
const CONTEXT_GRAPH_ROW_GAP = 40;
const CONTEXT_GRAPH_HEADER_HEIGHT = 76;
const CONTEXT_GRAPH_NODE_CENTER_Y =
  CONTEXT_GRAPH_HEADER_HEIGHT + CONTEXT_GRAPH_ROW_HEIGHT / 2;
const CONTEXT_GRAPH_ROW_STEP =
  CONTEXT_GRAPH_ROW_HEIGHT + CONTEXT_GRAPH_ROW_GAP;
const CONTEXT_GRAPH_CANVAS_WIDTH = 960;
const CONTEXT_GRAPH_LANE_CENTERS = [120, 360, 600, 840] as const;
const CONTEXT_GRAPH_NODE_HALF_WIDTH = 96;

type LaneDefinition = {
  descriptionKey: TranslationKey;
  icon: ComponentType<LucideProps>;
  kind: ProjectContextGraphNodeKind;
  labelKey: TranslationKey;
};

const LANE_DEFINITIONS: LaneDefinition[] = [
  {
    descriptionKey: "contextGraph.promptDescription",
    icon: MessageSquareText,
    kind: "prompt",
    labelKey: "contextGraph.prompt",
  },
  {
    descriptionKey: "contextGraph.responseDescription",
    icon: Bot,
    kind: "response",
    labelKey: "contextGraph.response",
  },
  {
    descriptionKey: "contextGraph.fileDescription",
    icon: FileCode2,
    kind: "file",
    labelKey: "contextGraph.file",
  },
  {
    descriptionKey: "contextGraph.memoryDescription",
    icon: Sparkles,
    kind: "memory",
    labelKey: "contextGraph.memory",
  },
];

const ALL_NODE_KINDS = LANE_DEFINITIONS.map((lane) => lane.kind);
const SAFE_METADATA_KEYS = new Set([
  "additions",
  "artifact_stage",
  "confidence",
  "deletions",
  "language",
  "memory_scope",
  "model",
  "review_state",
  "status",
  "tags",
  "technologies",
  "tool",
]);
const SENSITIVE_METADATA_KEY_PATTERN = /content|diff|patch|prompt|response|secret/i;

type ContextGraphNodePosition = {
  laneIndex: number;
  rowIndex: number;
  x: number;
  y: number;
};

export type ContextGraphLayoutEdge = ProjectContextGraphEdge & {
  path: string;
};

export type ContextGraphLayout = {
  canvasHeight: number;
  edges: ContextGraphLayoutEdge[];
  lanes: Array<{
    kind: ProjectContextGraphNodeKind;
    nodes: ProjectContextGraphNode[];
  }>;
  nodePositions: Record<string, ContextGraphNodePosition>;
  visibleNodes: ProjectContextGraphNode[];
};

type ContextGraphConnection = {
  direction: "incoming" | "outgoing";
  edge: ProjectContextGraphEdge;
  node: ProjectContextGraphNode;
};

function contextGraphNodeTimestamp(node: ProjectContextGraphNode) {
  if (!node.occurred_at) {
    return Number.POSITIVE_INFINITY;
  }
  const timestamp = Date.parse(node.occurred_at);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function compareContextGraphNodes(
  left: ProjectContextGraphNode,
  right: ProjectContextGraphNode,
) {
  const leftTimestamp = contextGraphNodeTimestamp(left);
  const rightTimestamp = contextGraphNodeTimestamp(right);
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }

  const sequenceDifference =
    (left.sequence ?? Number.MAX_SAFE_INTEGER) -
    (right.sequence ?? Number.MAX_SAFE_INTEGER);
  if (sequenceDifference !== 0) {
    return sequenceDifference;
  }

  return left.id.localeCompare(right.id);
}

function contextGraphEdgePath(
  source: ContextGraphNodePosition,
  target: ContextGraphNodePosition,
) {
  if (source.laneIndex === target.laneIndex) {
    const side = source.laneIndex < 2 ? 1 : -1;
    const sourceX = source.x + side * CONTEXT_GRAPH_NODE_HALF_WIDTH;
    const targetX = target.x + side * CONTEXT_GRAPH_NODE_HALF_WIDTH;
    const curveX = sourceX + side * 42;
    return [
      `M ${sourceX} ${source.y}`,
      `C ${curveX} ${source.y}, ${curveX} ${target.y}, ${targetX} ${target.y}`,
    ].join(" ");
  }

  const direction = target.x > source.x ? 1 : -1;
  const sourceX = source.x + direction * CONTEXT_GRAPH_NODE_HALF_WIDTH;
  const targetX = target.x - direction * CONTEXT_GRAPH_NODE_HALF_WIDTH;
  const midpointX = sourceX + (targetX - sourceX) / 2;
  return [
    `M ${sourceX} ${source.y}`,
    `C ${midpointX} ${source.y}, ${midpointX} ${target.y}, ${targetX} ${target.y}`,
  ].join(" ");
}

export function buildContextGraphLayout(
  nodes: ProjectContextGraphNode[],
  edges: ProjectContextGraphEdge[],
  enabledKinds: ReadonlySet<ProjectContextGraphNodeKind> = new Set(ALL_NODE_KINDS),
): ContextGraphLayout {
  const uniqueNodes = new Map<string, ProjectContextGraphNode>();
  for (const node of nodes) {
    if (enabledKinds.has(node.kind) && !uniqueNodes.has(node.id)) {
      uniqueNodes.set(node.id, node);
    }
  }

  const lanes = LANE_DEFINITIONS.map(({ kind }) => ({
    kind,
    nodes: [...uniqueNodes.values()]
      .filter((node) => node.kind === kind)
      .sort(compareContextGraphNodes),
  }));
  const nodePositions: Record<string, ContextGraphNodePosition> = {};
  for (const [laneIndex, lane] of lanes.entries()) {
    for (const [rowIndex, node] of lane.nodes.entries()) {
      nodePositions[node.id] = {
        laneIndex,
        rowIndex,
        x: CONTEXT_GRAPH_LANE_CENTERS[laneIndex],
        y: CONTEXT_GRAPH_NODE_CENTER_Y + rowIndex * CONTEXT_GRAPH_ROW_STEP,
      };
    }
  }

  const visibleEdges = edges.flatMap((edge) => {
    const source = nodePositions[edge.source];
    const target = nodePositions[edge.target];
    if (!source || !target || edge.source === edge.target) {
      return [];
    }
    return [{ ...edge, path: contextGraphEdgePath(source, target) }];
  });
  const maximumRows = Math.max(1, ...lanes.map((lane) => lane.nodes.length));
  const canvasHeight = Math.max(
    360,
    CONTEXT_GRAPH_HEADER_HEIGHT +
      maximumRows * CONTEXT_GRAPH_ROW_HEIGHT +
      Math.max(maximumRows - 1, 0) * CONTEXT_GRAPH_ROW_GAP +
      28,
  );

  return {
    canvasHeight,
    edges: visibleEdges,
    lanes,
    nodePositions,
    visibleNodes: lanes.flatMap((lane) => lane.nodes),
  };
}

function isDisplayableMetadataValue(value: unknown) {
  if (["string", "number", "boolean"].includes(typeof value)) {
    return true;
  }
  return (
    Array.isArray(value) &&
    value.length <= 12 &&
    value.every((item) => ["string", "number", "boolean"].includes(typeof item))
  );
}

export function visibleContextGraphMetadata(metadata: Record<string, unknown>) {
  return Object.entries(metadata).filter(
    ([key, value]) =>
      SAFE_METADATA_KEYS.has(key) &&
      !SENSITIVE_METADATA_KEY_PATTERN.test(key) &&
      isDisplayableMetadataValue(value),
  );
}

function formatMetadataValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

function formatOccurredAt(value: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function shortIdentifier(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function useDebouncedProjectQuery(
  projectId: string,
  value: string,
  delayMs: number,
) {
  const [debouncedState, setDebouncedState] = useState({
    projectId,
    value,
  });

  useEffect(() => {
    if (debouncedState.projectId !== projectId) {
      setDebouncedState({ projectId, value: "" });
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedState({ projectId, value });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [debouncedState.projectId, delayMs, projectId, value]);

  return debouncedState.projectId === projectId ? debouncedState.value : "";
}

function laneDefinition(kind: ProjectContextGraphNodeKind) {
  return LANE_DEFINITIONS.find((lane) => lane.kind === kind) ?? LANE_DEFINITIONS[0];
}

function edgeTranslationKey(edge: ProjectContextGraphEdge): TranslationKey {
  switch (edge.kind) {
    case "answered_by":
      return "contextGraph.relationAnsweredBy";
    case "changed":
      return "contextGraph.relationChanged";
    case "captured_in":
      return "contextGraph.relationCapturedIn";
    case "references":
      return "contextGraph.relationReferences";
  }
}

function ContextNodeButton({
  compact = false,
  isMuted,
  isRelated,
  isSelected,
  mobile = false,
  node,
  onSelect,
}: {
  compact?: boolean;
  isMuted: boolean;
  isRelated: boolean;
  isSelected: boolean;
  mobile?: boolean;
  node: ProjectContextGraphNode;
  onSelect: (nodeId: string) => void;
}) {
  const { t } = useI18n();
  const definition = laneDefinition(node.kind);
  const Icon = definition.icon;
  const occurredAt = formatOccurredAt(node.occurred_at);

  return (
    <button
      aria-label={`${t(definition.labelKey)}: ${node.label}`}
      aria-pressed={isSelected}
      className="context-graph-node"
      data-compact={compact || undefined}
      data-kind={node.kind}
      data-mobile={mobile || undefined}
      data-muted={isMuted || undefined}
      data-related={isRelated || undefined}
      data-selected={isSelected || undefined}
      onClick={() => onSelect(node.id)}
      type="button"
    >
      <span aria-hidden="true" className="context-graph-node-port context-graph-node-port-in" />
      <span className="context-graph-node-kicker">
        <Icon aria-hidden="true" size={14} strokeWidth={1.7} />
        {t(definition.labelKey)}
        {node.agent_visible ? <small>{t("contextGraph.agentReady")}</small> : null}
      </span>
      <strong>{node.label}</strong>
      {!compact && node.summary ? (
        <span className="context-graph-node-summary">{node.summary}</span>
      ) : null}
      <span className="context-graph-node-meta">
        {node.sequence !== null ? <small>#{node.sequence}</small> : null}
        {occurredAt ? <small>{occurredAt}</small> : null}
      </span>
      <span aria-hidden="true" className="context-graph-node-port context-graph-node-port-out" />
    </button>
  );
}

function ContextGraphDesktop({
  layout,
  relatedNodeIds,
  selectedNodeId,
  onSelectNode,
}: {
  layout: ContextGraphLayout;
  relatedNodeIds: ReadonlySet<string>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="context-graph-desktop" data-testid="context-graph-desktop">
      <div
        className="context-graph-canvas"
        style={
          {
            "--context-graph-canvas-height": `${layout.canvasHeight}px`,
          } as CSSProperties
        }
      >
        <svg
          aria-hidden="true"
          className="context-graph-edges"
          focusable="false"
          preserveAspectRatio="none"
          viewBox={`0 0 ${CONTEXT_GRAPH_CANVAS_WIDTH} ${layout.canvasHeight}`}
        >
          {layout.edges.map((edge) => (
            <path
              className="context-graph-edge"
              d={edge.path}
              data-active={
                selectedNodeId !== null &&
                (edge.source === selectedNodeId || edge.target === selectedNodeId)
                  ? "true"
                  : undefined
              }
              data-inferred={edge.inferred || undefined}
              key={edge.id}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        <div className="context-graph-lanes">
          {layout.lanes.map((lane) => {
            const definition = laneDefinition(lane.kind);
            const Icon = definition.icon;
            return (
              <section
                aria-labelledby={`context-graph-lane-${lane.kind}`}
                className="context-graph-lane"
                data-kind={lane.kind}
                key={lane.kind}
              >
                <header>
                  <span>
                    <Icon aria-hidden="true" size={16} strokeWidth={1.7} />
                  </span>
                  <div>
                    <h3 id={`context-graph-lane-${lane.kind}`}>
                      {t(definition.labelKey)}
                    </h3>
                    <p>{t(definition.descriptionKey)}</p>
                  </div>
                  <small>{lane.nodes.length}</small>
                </header>
                <ol>
                  {lane.nodes.map((node) => (
                    <li key={node.id}>
                      <ContextNodeButton
                        compact
                        isMuted={
                          selectedNodeId !== null && !relatedNodeIds.has(node.id)
                        }
                        isRelated={
                          selectedNodeId !== null && relatedNodeIds.has(node.id)
                        }
                        isSelected={selectedNodeId === node.id}
                        node={node}
                        onSelect={onSelectNode}
                      />
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ContextGraphMobile({
  connections,
  layout,
  selectedNodeId,
  onSelectNode,
}: {
  connections: ContextGraphConnection[];
  layout: ContextGraphLayout;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const { t } = useI18n();
  const selectedNode =
    layout.visibleNodes.find((node) => node.id === selectedNodeId) ??
    layout.visibleNodes[0] ??
    null;

  if (!selectedNode) {
    return null;
  }

  return (
    <div className="context-graph-mobile" data-testid="context-graph-mobile">
      <section className="context-graph-mobile-focus">
        <header>
          <div>
            <Network aria-hidden="true" size={16} strokeWidth={1.7} />
            <h3>{t("contextGraph.connectedContext")}</h3>
          </div>
          <small>{connections.length}</small>
        </header>

        <div className="context-graph-mobile-anchor">
          <ContextNodeButton
            compact
            isMuted={false}
            isRelated
            isSelected
            mobile
            node={selectedNode}
            onSelect={onSelectNode}
          />
        </div>

        {connections.length > 0 ? (
          <ol className="context-graph-mobile-connections">
            {connections.map((connection) => {
              const relation = t(edgeTranslationKey(connection.edge));
              const basis = t(
                connection.edge.inferred
                  ? "contextGraph.inferred"
                  : "contextGraph.recorded",
              );
              return (
                <li
                  data-direction={connection.direction}
                  data-inferred={connection.edge.inferred || undefined}
                  key={`${connection.edge.id}:${connection.node.id}`}
                >
                  <span aria-hidden="true" className="context-graph-mobile-branch" />
                  <span className="context-graph-mobile-relation">
                    <span aria-hidden="true">
                      {connection.direction === "outgoing" ? "→" : "←"}
                    </span>
                    {relation}
                    <small>{basis}</small>
                  </span>
                  <ContextNodeButton
                    compact
                    isMuted={false}
                    isRelated
                    isSelected={false}
                    mobile
                    node={connection.node}
                    onSelect={onSelectNode}
                  />
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="context-graph-mobile-empty">
            {t("contextGraph.noConnections")}
          </p>
        )}
      </section>

      <section className="context-graph-mobile-index">
        <header>
          <h3>{t("contextGraph.nodes")}</h3>
          <small>{layout.visibleNodes.length}</small>
        </header>
        <div>
          {layout.lanes.map((lane) => {
            const definition = laneDefinition(lane.kind);
            const Icon = definition.icon;
            if (lane.nodes.length === 0) {
              return null;
            }
            return (
              <section data-kind={lane.kind} key={lane.kind}>
                <h4>
                  <Icon aria-hidden="true" size={14} strokeWidth={1.7} />
                  {t(definition.labelKey)}
                  <small>{lane.nodes.length}</small>
                </h4>
                <div>
                  {lane.nodes.map((node) => (
                    <button
                      aria-label={`${t(definition.labelKey)}: ${node.label}`}
                      aria-pressed={selectedNode.id === node.id}
                      data-selected={selectedNode.id === node.id || undefined}
                      key={node.id}
                      onClick={() => onSelectNode(node.id)}
                      type="button"
                    >
                      <span aria-hidden="true" />
                      <strong>{node.label}</strong>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ContextNodeInspector({
  connections,
  inspectorRef,
  node,
  onClose,
  onOpenSession,
  onSelectNode,
}: {
  connections: ContextGraphConnection[];
  inspectorRef: RefObject<HTMLElement | null>;
  node: ProjectContextGraphNode | null;
  onClose: () => void;
  onOpenSession?: (sessionId: string) => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const { t } = useI18n();
  if (!node) {
    return (
      <aside
        className="context-graph-inspector context-graph-inspector-empty"
        ref={inspectorRef}
        tabIndex={-1}
      >
        <Network aria-hidden="true" size={24} strokeWidth={1.4} />
        <h3>{t("contextGraph.selectNode")}</h3>
        <p>{t("contextGraph.selectNodeDescription")}</p>
      </aside>
    );
  }

  const definition = laneDefinition(node.kind);
  const Icon = definition.icon;
  const occurredAt = formatOccurredAt(node.occurred_at);
  const metadata = visibleContextGraphMetadata(node.metadata);

  return (
    <aside
      className="context-graph-inspector"
      aria-label={t("contextGraph.nodeDetails", { label: node.label })}
      ref={inspectorRef}
      tabIndex={-1}
    >
      <header>
        <span className="context-graph-inspector-icon" data-kind={node.kind}>
          <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
        </span>
        <div>
          <span>{t(definition.labelKey)}</span>
          <h3>{node.label}</h3>
        </div>
        <button
          aria-label={t("contextGraph.closeDetails")}
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={16} strokeWidth={1.7} />
        </button>
      </header>

      {node.summary ? <p className="context-graph-inspector-summary">{node.summary}</p> : null}

      <dl className="context-graph-inspector-meta">
        {occurredAt ? (
          <div>
            <dt>{t("contextGraph.occurred")}</dt>
            <dd>
              <time dateTime={node.occurred_at ?? undefined}>{occurredAt}</time>
            </dd>
          </div>
        ) : null}
        {node.sequence !== null ? (
          <div>
            <dt>{t("contextGraph.sequence")}</dt>
            <dd>#{node.sequence}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t("contextGraph.agentAccess")}</dt>
          <dd>
            {node.agent_visible
              ? t("contextGraph.available")
              : t("contextGraph.notApproved")}
          </dd>
        </div>
        {node.session_id ? (
          <div>
            <dt>{t("contextGraph.session")}</dt>
            <dd title={node.session_id}>{shortIdentifier(node.session_id)}</dd>
          </div>
        ) : null}
        {metadata.map(([key, value]) => (
          <div key={key}>
            <dt>{key.replaceAll("_", " ")}</dt>
            <dd>{formatMetadataValue(value)}</dd>
          </div>
        ))}
      </dl>

      {node.session_id && onOpenSession ? (
        <button
          className="context-graph-open-source"
          onClick={() => onOpenSession(node.session_id!)}
          type="button"
        >
          {t("contextGraph.openSourceSession")}
          <ExternalLink aria-hidden="true" size={15} strokeWidth={1.7} />
        </button>
      ) : null}

      <section className="context-graph-connections" aria-labelledby="context-graph-connections-title">
        <div>
          <h4 id="context-graph-connections-title">
            {t("contextGraph.connectedContext")}
          </h4>
          <span>{connections.length}</span>
        </div>
        {connections.length > 0 ? (
          <ul>
            {connections.slice(0, 8).map((connection) => {
              const relation = t(edgeTranslationKey(connection.edge));
              const direction = t(
                connection.direction === "outgoing"
                  ? "contextGraph.outgoingConnection"
                  : "contextGraph.incomingConnection",
              );
              const basis = t(
                connection.edge.inferred
                  ? "contextGraph.inferred"
                  : "contextGraph.recorded",
              );
              return (
                <li key={`${connection.edge.id}:${connection.node.id}`}>
                  <button
                    aria-label={t("contextGraph.connectionLabel", {
                      basis,
                      direction,
                      label: connection.node.label,
                      relation,
                    })}
                    onClick={() => onSelectNode(connection.node.id)}
                    type="button"
                  >
                    <span data-kind={connection.node.kind} />
                    <strong>{connection.node.label}</strong>
                    <small>
                      <span aria-hidden="true">
                        {connection.direction === "outgoing" ? "→" : "←"}
                      </span>{" "}
                      {relation} · {basis} ·{" "}
                      {t(laneDefinition(connection.node.kind).labelKey)}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>{t("contextGraph.noConnections")}</p>
        )}
      </section>
    </aside>
  );
}

export function ContextGraphPanel({
  projectId,
  onOpenSession,
}: {
  projectId: string;
  onOpenSession?: (sessionId: string) => void;
}) {
  const { t } = useI18n();
  const [searchState, setSearchState] = useState({ projectId, value: "" });
  const searchInput = searchState.projectId === projectId ? searchState.value : "";
  const debouncedQuery = useDebouncedProjectQuery(projectId, searchInput, 300);
  const [graphState, setGraphState] = useState<{
    projectId: string;
    response: ProjectContextGraphResponse;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const [enabledKinds, setEnabledKinds] = useState<Set<ProjectContextGraphNodeKind>>(
    () => new Set(ALL_NODE_KINDS),
  );
  const graph = graphState?.projectId === projectId ? graphState.response : null;

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage(null);
    void fetchProjectContextGraph(projectId, {
      limit: CONTEXT_GRAPH_LIMIT,
      query: debouncedQuery,
      signal: controller.signal,
    })
      .then((response) => {
        if (!controller.signal.aborted) {
          setGraphState({ projectId, response });
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        if (!controller.signal.aborted) {
          setErrorMessage(
            error instanceof Error ? error.message : t("contextGraph.requestFailed"),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [debouncedQuery, projectId, requestVersion, t]);

  const layout = useMemo(
    () => buildContextGraphLayout(graph?.nodes ?? [], graph?.edges ?? [], enabledKinds),
    [enabledKinds, graph?.edges, graph?.nodes],
  );
  const selectedNode =
    layout.visibleNodes.find((node) => node.id === selectedNodeId) ?? null;
  const connections = useMemo<ContextGraphConnection[]>(() => {
    if (!selectedNodeId || !graph) {
      return [];
    }
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    return graph.edges.flatMap<ContextGraphConnection>(
      (edge): ContextGraphConnection[] => {
        if (edge.source === selectedNodeId) {
          const node = nodesById.get(edge.target);
          return node && enabledKinds.has(node.kind)
            ? [{ direction: "outgoing" as const, edge, node }]
            : [];
        }
        if (edge.target === selectedNodeId) {
          const node = nodesById.get(edge.source);
          return node && enabledKinds.has(node.kind)
            ? [{ direction: "incoming" as const, edge, node }]
            : [];
        }
        return [];
      },
    );
  }, [enabledKinds, graph, selectedNodeId]);
  const relatedNodeIds = useMemo(() => {
    const ids = new Set(connections.map((connection) => connection.node.id));
    if (selectedNodeId) {
      ids.add(selectedNodeId);
    }
    return ids;
  }, [connections, selectedNodeId]);

  useEffect(() => {
    setSelectedNodeId((currentNodeId) => {
      if (
        currentNodeId &&
        layout.visibleNodes.some((node) => node.id === currentNodeId)
      ) {
        return currentNodeId;
      }
      const preferredNode =
        layout.visibleNodes.find((node) => node.kind === "memory") ??
        layout.visibleNodes[0] ??
        null;
      return preferredNode?.id ?? null;
    });
  }, [layout.visibleNodes]);

  const toggleKind = (kind: ProjectContextGraphNodeKind) => {
    setEnabledKinds((currentKinds) => {
      const nextKinds = new Set(currentKinds);
      if (nextKinds.has(kind)) {
        if (nextKinds.size === 1) {
          return currentKinds;
        }
        nextKinds.delete(kind);
      } else {
        nextKinds.add(kind);
      }
      return nextKinds;
    });
  };

  const selectGraphNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    if (
      typeof window.matchMedia !== "function" ||
      !window.matchMedia("(max-width: 760px)").matches
    ) {
      return;
    }
    window.requestAnimationFrame(() => {
      const inspector = inspectorRef.current;
      if (!inspector) {
        return;
      }
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      inspector.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      inspector.focus({ preventScroll: true });
    });
  };

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;
  const isSettlingSearch = searchInput.trim() !== debouncedQuery.trim();

  return (
    <section className="context-graph-panel" aria-labelledby="context-graph-title">
      <header className="context-graph-heading">
        <div>
          <span className="context-graph-eyebrow">
            <Network aria-hidden="true" size={14} strokeWidth={1.7} />
            {t("contextGraph.eyebrow")}
          </span>
          <h2 id="context-graph-title">{t("contextGraph.title")}</h2>
          <p>{t("contextGraph.description")}</p>
        </div>
        <dl aria-label={t("contextGraph.graphSummary")}>
          <div>
            <dt>{t("contextGraph.nodes")}</dt>
            <dd>{nodeCount}</dd>
          </div>
          <div>
            <dt>{t("contextGraph.links")}</dt>
            <dd>{edgeCount}</dd>
          </div>
        </dl>
      </header>

      <div className="context-graph-toolbar">
        <label className="context-graph-search">
          <Search aria-hidden="true" size={16} strokeWidth={1.7} />
          <input
            aria-label={t("contextGraph.searchLabel")}
            autoComplete="off"
            onChange={(event) =>
              setSearchState({ projectId, value: event.target.value })
            }
            placeholder={t("contextGraph.searchPlaceholder")}
            spellCheck={false}
            type="search"
            value={searchInput}
          />
          {isLoading || isSettlingSearch ? <span aria-hidden="true" /> : null}
        </label>
        <div
          className="context-graph-filters"
          aria-label={t("contextGraph.nodeTypes")}
          role="group"
        >
          {LANE_DEFINITIONS.map((definition) => {
            const count =
              graph?.facets[definition.kind] ??
              graph?.nodes.filter((node) => node.kind === definition.kind).length ??
              0;
            return (
              <button
                aria-pressed={enabledKinds.has(definition.kind)}
                data-active={enabledKinds.has(definition.kind) || undefined}
                data-kind={definition.kind}
                key={definition.kind}
                onClick={() => toggleKind(definition.kind)}
                type="button"
              >
                <span />
                {t(definition.labelKey)}
                <small>{count}</small>
              </button>
            );
          })}
        </div>
        <div className="context-graph-toolbar-status">
          <span className="context-graph-result-status" role="status">
            {isLoading
              ? t("contextGraph.updating")
              : t("contextGraph.visibleNodes", {
                  count: layout.visibleNodes.length,
                })}
          </span>
          <span className="context-graph-basis-legend">
            <span>
              <i aria-hidden="true" />
              {t("contextGraph.recorded")}
            </span>
            <span data-inferred="true">
              <i aria-hidden="true" />
              {t("contextGraph.inferred")}
            </span>
          </span>
        </div>
      </div>

      {graph?.safety_notice ? (
        <div className="context-graph-safety-note">
          <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.7} />
          <span>{graph.safety_notice}</span>
        </div>
      ) : null}

      {graph?.truncated ? (
        <div className="context-graph-truncated" role="status">
          {t("contextGraph.truncated")}
        </div>
      ) : null}

      {errorMessage && graph ? (
        <div className="context-graph-inline-error" role="alert">
          <span>{errorMessage}</span>
          <button onClick={() => setRequestVersion((version) => version + 1)} type="button">
            {t("common.retry")}
          </button>
        </div>
      ) : null}

      {!graph && isLoading ? (
        <div
          className="context-graph-loading"
          aria-label={t("contextGraph.loading")}
          role="status"
        >
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : !graph && errorMessage ? (
        <div className="context-graph-error" role="alert">
          <RefreshCw aria-hidden="true" size={22} strokeWidth={1.5} />
          <h3>{t("contextGraph.loadFailedTitle")}</h3>
          <p>{errorMessage}</p>
          <button onClick={() => setRequestVersion((version) => version + 1)} type="button">
            {t("contextGraph.tryAgain")}
          </button>
        </div>
      ) : layout.visibleNodes.length === 0 ? (
        <div className="context-graph-empty" role="status">
          <Search aria-hidden="true" size={22} strokeWidth={1.5} />
          <h3>{t("contextGraph.emptyTitle")}</h3>
          <p>{t("contextGraph.emptyDescription")}</p>
        </div>
      ) : (
        <div className="context-graph-explorer">
          <div className="context-graph-map">
            <ContextGraphDesktop
              layout={layout}
              onSelectNode={selectGraphNode}
              relatedNodeIds={relatedNodeIds}
              selectedNodeId={selectedNodeId}
            />
            <ContextGraphMobile
              connections={connections}
              layout={layout}
              onSelectNode={selectGraphNode}
              selectedNodeId={selectedNodeId}
            />
          </div>
          <ContextNodeInspector
            connections={connections}
            inspectorRef={inspectorRef}
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
            onOpenSession={onOpenSession}
            onSelectNode={selectGraphNode}
          />
        </div>
      )}
    </section>
  );
}
