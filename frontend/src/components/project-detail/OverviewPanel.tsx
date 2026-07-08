import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Folder,
  Globe2,
  Link2,
  LockKeyhole,
  X,
} from "lucide-react";
import { siGithub } from "simple-icons";
import { AiModelBadge } from "./AiModelBadge";
import { EmptyState } from "./EmptyState";
import { focusableModalElements } from "./modalFocus";
import type { ProjectDetailData } from "./types";

function overviewCompactNumber(value: number) {
  return Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function statisticDeltaParts(delta: string | undefined) {
  if (!delta) {
    return null;
  }

  const [value, ...labelParts] = delta.split(" ");
  const label = labelParts.join(" ");
  return {
    label,
    value,
  };
}

function statisticNumericValue(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const normalizedValue = value.trim().replace(/,/g, "");
  const match = normalizedValue.match(/^([+-]?\d+(?:\.\d+)?)([kmb])?/i);
  if (!match) {
    return 0;
  }

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) {
    return 0;
  }

  const suffix = match[2]?.toLowerCase();
  const multiplier =
    suffix === "b"
      ? 1_000_000_000
      : suffix === "m"
        ? 1_000_000
        : suffix === "k"
          ? 1_000
          : 1;
  return amount * multiplier;
}

function statisticSparklinePoints(value: string, delta: string | undefined) {
  const currentValue = Math.max(0, statisticNumericValue(value));
  const deltaValue = Math.max(0, statisticNumericValue(delta?.split(" ")[0]));

  if (currentValue === 0 && deltaValue === 0) {
    return [0, 0, 0, 0, 0, 0, 0];
  }

  const trendUnit =
    deltaValue > 0 ? deltaValue : Math.max(1, Math.round(currentValue * 0.08));
  const startValue = Math.max(0, currentValue - trendUnit * 2);
  return [
    startValue,
    startValue + trendUnit * 0.28,
    startValue + trendUnit * 0.18,
    startValue + trendUnit * 0.62,
    startValue + trendUnit * 0.52,
    startValue + trendUnit * 0.86,
    currentValue,
  ];
}

function sparklinePointCoordinates(points: number[]) {
  const width = 96;
  const height = 28;
  const maxValue = Math.max(...points, 1);
  const minValue = Math.min(...points);
  const range = Math.max(maxValue - minValue, 1);

  return points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width;
    const y = height - ((point - minValue) / range) * (height - 4) - 2;
    return [x, y] as const;
  });
}

function SparklineChart({
  points,
  type,
}: {
  points: number[];
  type: "bar" | "line";
}) {
  const coordinates = sparklinePointCoordinates(points);
  const linePath = coordinates
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L 96 30 L 0 30 Z`;
  const maxValue = Math.max(...points, 1);

  return (
    <svg
      aria-hidden="true"
      className="bh-overview-stat-sparkline"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 96 30"
    >
      {type === "bar" ? (
        points.map((point, index) => {
          const barHeight = Math.max(3, (point / maxValue) * 24);
          return (
            <rect
              height={barHeight}
              key={`${point}-${index}`}
              rx="1.5"
              width="7"
              x={index * 14 + 2}
              y={28 - barHeight}
            />
          );
        })
      ) : (
        <>
          <path className="bh-overview-stat-sparkline-area" d={areaPath} />
          <path className="bh-overview-stat-sparkline-line" d={linePath} />
        </>
      )}
    </svg>
  );
}

function projectTagsFromInput(value: string) {
  const tags = new Set<string>();
  for (const tag of value.split(",")) {
    const normalizedTag = tag.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalizedTag) {
      continue;
    }
    tags.add(normalizedTag.slice(0, 40));
    if (tags.size >= 12) {
      break;
    }
  }
  return Array.from(tags);
}

function projectVisibilityFromValue(value: string | undefined): "private" | "public" {
  return value?.toLowerCase() === "public" ? "public" : "private";
}

type OverviewEditorKind = "project" | "description";

const OVERVIEW_EDIT_DRAWER_ANIMATION_MS = 200;

function PlainDescriptionContent({
  emptyLabel,
  value,
}: {
  emptyLabel: string;
  value: string;
}) {
  const trimmedValue = value.trim();

  return (
    <div
      className={`bh-plain-description${trimmedValue ? "" : " is-empty"}`}
    >
      {trimmedValue || emptyLabel}
    </div>
  );
}

export function OverviewPanel({
  data,
  onSaveDescription,
  onSaveProjectMetadata,
}: {
  data: ProjectDetailData;
  onSaveDescription?: (description: string) => Promise<void>;
  onSaveProjectMetadata?: (metadata: {
    slug?: string;
    tags?: string[];
    visibility?: "private" | "public";
  }) => Promise<void>;
}) {
  const overviewEditDrawerRef = useRef<HTMLElement | null>(null);
  const overviewEditCloseTimerRef = useRef<number | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState(data.project.description);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
  const [isDescriptionSaving, setIsDescriptionSaving] = useState(false);
  const [isProjectMetadataEditing, setIsProjectMetadataEditing] = useState(false);
  const [isProjectMetadataSaving, setIsProjectMetadataSaving] = useState(false);
  const [projectMetadataError, setProjectMetadataError] = useState<string | null>(null);
  const [projectSlugDraft, setProjectSlugDraft] = useState(data.project.slug ?? data.project.id);
  const [projectTagsDraft, setProjectTagsDraft] = useState(
    data.project.tags.join(", "),
  );
  const [projectVisibilityDraft, setProjectVisibilityDraft] = useState<
    "private" | "public"
  >(projectVisibilityFromValue(data.project.visibility));
  const [closingOverviewEditor, setClosingOverviewEditor] =
    useState<OverviewEditorKind | null>(null);
  const isProjectMetadataDrawerVisible =
    isProjectMetadataEditing || closingOverviewEditor === "project";
  const isDescriptionDrawerVisible =
    isDescriptionEditing || closingOverviewEditor === "description";
  const isOverviewDrawerOpen =
    isProjectMetadataDrawerVisible || isDescriptionDrawerVisible;

  useEffect(() => {
    setDescriptionDraft(data.project.description);
    setDescriptionError(null);
  }, [data.project.description, data.project.id]);

  useEffect(() => {
    setProjectSlugDraft(data.project.slug ?? data.project.id);
    setProjectTagsDraft(data.project.tags.join(", "));
    setProjectVisibilityDraft(projectVisibilityFromValue(data.project.visibility));
    setProjectMetadataError(null);
  }, [data.project.id, data.project.slug, data.project.tags, data.project.visibility]);

  useEffect(() => {
    if (overviewEditCloseTimerRef.current !== null) {
      window.clearTimeout(overviewEditCloseTimerRef.current);
      overviewEditCloseTimerRef.current = null;
    }
    setClosingOverviewEditor(null);
    setIsDescriptionEditing(false);
    setIsProjectMetadataEditing(false);
  }, [data.project.id]);

  useEffect(() => {
    if (!isOverviewDrawerOpen) {
      return;
    }

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";

    const focusTimer = window.setTimeout(() => {
      overviewEditDrawerRef.current?.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      previousActiveElement?.focus({ preventScroll: true });
    };
  }, [isOverviewDrawerOpen]);

  useEffect(
    () => () => {
      if (overviewEditCloseTimerRef.current !== null) {
        window.clearTimeout(overviewEditCloseTimerRef.current);
      }
    },
    [],
  );

  if (data.overview.length === 0) {
    return (
      <EmptyState
        description="Project metadata will appear after Promty receives project activity."
        icon={BookOpen}
        title="No overview data yet"
      />
    );
  }

  const overviewItems = new Map(data.overview.map((item) => [item.title, item]));
  const repositoryUrlItem = overviewItems.get("Repository URL");
  const projectUrlItem = overviewItems.get("Project URL");
  const descriptionItem = overviewItems.get("Description");
  const aiModelsItem = overviewItems.get("AI Models");
  const lastActivityItem = overviewItems.get("Last Activity");
  const repositoryConnectedItem = overviewItems.get("Repository Connected");
  const visibilityItem = overviewItems.get("Visibility");
  const filesChanged = data.activities.reduce(
    (total, activity) => total + activity.filesChanged,
    0,
  );
  const statisticItems = [
    {
      chart: "line" as const,
      delta: overviewItems.get("Sessions Added")?.value,
      label: "Sessions",
      tone: "sessions",
      value: overviewItems.get("Sessions")?.value ?? "0",
    },
    {
      chart: "line" as const,
      delta: overviewItems.get("Prompts Added")?.value,
      label: "Prompts",
      tone: "prompts",
      value: overviewItems.get("Prompts")?.value ?? "0",
    },
    {
      chart: "line" as const,
      delta: overviewItems.get("Files Changed Added")?.value,
      label: "Files changed",
      tone: "files",
      value: overviewCompactNumber(filesChanged),
    },
    {
      chart: "line" as const,
      delta: undefined,
      label: "Memories",
      tone: "memory",
      value: overviewCompactNumber(data.memory.totalArtifacts),
    },
    // Community publishing is paused for now.
    // {
    //   label: "Published Prompts",
    //   value: overviewCompactNumber(data.community.publishedFlows),
    // },
  ];
  const renderedStatisticItems = statisticItems.map((item) => ({
    ...item,
    deltaParts: statisticDeltaParts(item.delta),
    sparklinePoints: statisticSparklinePoints(item.value, item.delta),
  }));
  const projectAiModelNames =
    aiModelsItem?.value && aiModelsItem.value !== "Not captured"
      ? aiModelsItem.value.split(",").map((model) => model.trim()).filter(Boolean)
      : [];
  const projectTagDraftItems = projectTagsFromInput(projectTagsDraft);
  const rawDescriptionValue = data.project.description.trim();
  const latestActivity = data.activities[0] ?? null;
  const repositoryConnected = repositoryConnectedItem?.value === "Connected";
  const repositoryStatusText = repositoryConnected
    ? "Connected"
    : data.project.repositoryStatus?.replace(/^Repository\s+/i, "") || "Not connected";
  const projectVisibility = projectVisibilityFromValue(
    data.project.visibility ?? visibilityItem?.value,
  );
  const lastActivityDisplay =
    lastActivityItem?.description && lastActivityItem.description !== "No activity"
      ? lastActivityItem.description
      : lastActivityItem?.value ?? latestActivity?.lastActivity ?? "No activity";
  const canEditDescription = Boolean(onSaveDescription);
  const canEditProjectMetadata = Boolean(onSaveProjectMetadata);
  const clearOverviewEditCloseTimer = () => {
    if (overviewEditCloseTimerRef.current !== null) {
      window.clearTimeout(overviewEditCloseTimerRef.current);
      overviewEditCloseTimerRef.current = null;
    }
  };
  const resetProjectMetadataDraft = () => {
    setProjectSlugDraft(data.project.slug ?? data.project.id);
    setProjectTagsDraft(data.project.tags.join(", "));
    setProjectVisibilityDraft(projectVisibilityFromValue(data.project.visibility));
    setProjectMetadataError(null);
  };
  const resetDescriptionDraft = () => {
    setDescriptionDraft(rawDescriptionValue);
    setDescriptionError(null);
  };
  const completeOverviewEditorClose = (editor: OverviewEditorKind) => {
    if (editor === "project") {
      resetProjectMetadataDraft();
      setIsProjectMetadataEditing(false);
    } else {
      resetDescriptionDraft();
      setIsDescriptionEditing(false);
    }
    setClosingOverviewEditor((currentEditor) =>
      currentEditor === editor ? null : currentEditor,
    );
    overviewEditCloseTimerRef.current = null;
  };
  const closeOverviewEditorWithAnimation = (editor: OverviewEditorKind) => {
    clearOverviewEditCloseTimer();
    setClosingOverviewEditor(editor);
    overviewEditCloseTimerRef.current = window.setTimeout(() => {
      completeOverviewEditorClose(editor);
    }, OVERVIEW_EDIT_DRAWER_ANIMATION_MS);
  };
  const openProjectMetadataEditor = () => {
    clearOverviewEditCloseTimer();
    setClosingOverviewEditor(null);
    resetProjectMetadataDraft();
    setIsDescriptionEditing(false);
    setIsProjectMetadataEditing(true);
  };
  const closeProjectMetadataEditor = () => {
    closeOverviewEditorWithAnimation("project");
  };
  const openDescriptionEditor = () => {
    clearOverviewEditCloseTimer();
    setClosingOverviewEditor(null);
    resetDescriptionDraft();
    setIsProjectMetadataEditing(false);
    setIsDescriptionEditing(true);
  };
  const closeDescriptionEditor = () => {
    closeOverviewEditorWithAnimation("description");
  };
  const saveDescription = async (nextDescription: string) => {
    if (!onSaveDescription || isDescriptionSaving) {
      return;
    }

    setDescriptionError(null);
    setIsDescriptionSaving(true);
    try {
      await onSaveDescription(nextDescription);
      closeDescriptionEditor();
    } catch (error) {
      setDescriptionError(
        error instanceof Error ? error.message : "Description could not be saved",
      );
    } finally {
      setIsDescriptionSaving(false);
    }
  };
  const saveProjectMetadata = async (tagInput = projectTagsDraft) => {
    if (!onSaveProjectMetadata || isProjectMetadataSaving) {
      return;
    }

    setProjectMetadataError(null);
    setIsProjectMetadataSaving(true);
    try {
      await onSaveProjectMetadata({
        slug: projectSlugDraft,
        tags: projectTagsFromInput(tagInput),
        visibility: projectVisibilityDraft,
      });
      closeProjectMetadataEditor();
    } catch (error) {
      setProjectMetadataError(
        error instanceof Error ? error.message : "Project metadata could not be saved",
      );
    } finally {
      setIsProjectMetadataSaving(false);
    }
  };
  const handleOverviewDrawerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (isProjectMetadataSaving || isDescriptionSaving) {
        return;
      }
      if (isProjectMetadataEditing) {
        closeProjectMetadataEditor();
      } else {
        closeDescriptionEditor();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const drawerElement = overviewEditDrawerRef.current;
    if (!drawerElement) {
      return;
    }

    const focusableElements = focusableModalElements(drawerElement);
    if (focusableElements.length === 0) {
      event.preventDefault();
      drawerElement.focus({ preventScroll: true });
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
      return;
    }

    if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
    }
  };

  return (
    <div className="bh-overview-dashboard">
      <section className="bh-overview-statistics" aria-label="Project statistics">
        <dl>
          {renderedStatisticItems.map((item) => (
            <div
              className="bh-overview-stat-card"
              data-tone={item.tone}
              key={item.label}
            >
              <div className="bh-overview-stat-copy">
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
                {item.deltaParts ? (
                  <span className="bh-overview-statistics-change">
                    <strong>{item.deltaParts.value}</strong>
                    {item.deltaParts.label ? (
                      <small>{item.deltaParts.label}</small>
                    ) : null}
                  </span>
                ) : null}
              </div>
              <SparklineChart points={item.sparklinePoints} type={item.chart} />
            </div>
          ))}
        </dl>
      </section>

      <div className="bh-overview-detail-grid">
        <section
          className="bh-overview-card bh-overview-card-repository"
          aria-labelledby="project-repository-title"
        >
          <div className="bh-overview-card-header">
            <h2 id="project-repository-title">
              <Folder aria-hidden="true" size={16} strokeWidth={1.5} />
              <span>Project</span>
            </h2>
            {canEditProjectMetadata ? (
              <button
                className="bh-overview-card-action"
                onClick={openProjectMetadataEditor}
                type="button"
              >
                Edit
              </button>
            ) : null}
          </div>

          <div className="bh-project-context-layout">
            <div className="bh-project-context-links" aria-label="Project links">
              <div className="bh-project-context-link-field">
                <span className="bh-project-context-link-label">Project URL</span>
                {projectUrlItem ? (
                  <a
                    className="bh-project-context-link"
                    href={projectUrlItem.href ?? projectUrlItem.value}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="bh-project-context-link-icon">
                      <Link2 aria-hidden="true" size={16} strokeWidth={1.5} />
                    </span>
                    <span className="bh-project-context-link-value">
                      {projectUrlItem.value}
                    </span>
                    <ExternalLink aria-hidden="true" size={16} strokeWidth={1.5} />
                  </a>
                ) : (
                  <span className="bh-project-context-link is-disabled">
                    <span className="bh-project-context-link-icon">
                      <Link2 aria-hidden="true" size={16} strokeWidth={1.5} />
                    </span>
                    <span className="bh-project-context-link-value">Not available</span>
                  </span>
                )}
              </div>

              <div className="bh-project-context-link-field">
                <span className="bh-project-context-link-label">GitHub URL</span>
                {repositoryUrlItem?.href ? (
                  <a
                    className="bh-project-context-link"
                    href={repositoryUrlItem.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span
                      className="bh-project-context-link-icon"
                      data-kind="github"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d={siGithub.path} />
                      </svg>
                    </span>
                    <span className="bh-project-context-link-value">
                      {repositoryUrlItem.value}
                    </span>
                    <ExternalLink aria-hidden="true" size={16} strokeWidth={1.5} />
                  </a>
                ) : (
                  <span className="bh-project-context-link is-disabled">
                    <span
                      className="bh-project-context-link-icon"
                      data-kind="github"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d={siGithub.path} />
                      </svg>
                    </span>
                    <span className="bh-project-context-link-value">
                      {repositoryUrlItem?.value ?? "Not connected"}
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div className="bh-overview-card-divider" />

            <div className="bh-project-context-grid">
              <section className="bh-project-context-section" aria-label="Repository">
                <h3>Repository</h3>
                <div className="bh-project-summary-strip">
                  <span data-state={repositoryConnected ? "connected" : "idle"}>
                    <i aria-hidden="true" />
                    <strong>Status</strong>
                    {repositoryStatusText}
                  </span>
                  <span>
                    {projectVisibility === "public" ? (
                      <Globe2 aria-hidden="true" size={16} strokeWidth={1.5} />
                    ) : (
                      <LockKeyhole aria-hidden="true" size={16} strokeWidth={1.5} />
                    )}
                    {visibilityItem?.value ?? "Private"}
                  </span>
                </div>
              </section>

              <section className="bh-project-context-section" aria-label="AI context">
                <h3>AI Context</h3>
                <div className="bh-overview-model-badge-list">
                  {projectAiModelNames.length > 0 ? (
                    projectAiModelNames.map((model) => (
                      <AiModelBadge className="is-compact" key={model} model={model} />
                    ))
                  ) : (
                    <span className="ai-model-badge is-muted">No models captured</span>
                  )}
                </div>
              </section>

              <section className="bh-project-context-section" aria-label="Project tags">
                <h3>Tags</h3>
                {data.project.tags.length > 0 ? (
                  <div className="bh-project-tag-list">
                    {data.project.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : (
                  <span className="bh-project-profile-empty">No tags</span>
                )}
              </section>

              <section
                className="bh-project-context-section"
                aria-label="Last activity"
              >
                <h3>Last Activity</h3>
                <p title={lastActivityItem?.value ?? undefined}>
                  {lastActivityDisplay}
                </p>
              </section>
            </div>
          </div>
        </section>

        <section
          className="bh-overview-card bh-overview-card-description"
          aria-labelledby="project-description-title"
        >
          <div className="bh-overview-card-header">
            <h2 id="project-description-title">
              <FileText aria-hidden="true" size={16} strokeWidth={1.5} />
              <span>Description</span>
            </h2>
            {canEditDescription ? (
              <button
                className="bh-overview-card-action"
                onClick={openDescriptionEditor}
                type="button"
              >
                Edit
              </button>
            ) : null}
          </div>
          <PlainDescriptionContent
            emptyLabel="Not provided"
            value={rawDescriptionValue || descriptionItem?.value.trim() || ""}
          />
        </section>

      </div>

      {isProjectMetadataDrawerVisible ? (
        <div
          className="bh-overview-edit-overlay"
          data-state={closingOverviewEditor === "project" ? "closing" : "open"}
          role="presentation"
        >
          <section
            aria-labelledby="project-edit-drawer-title"
            aria-modal="true"
            className="bh-overview-edit-drawer"
            data-state={closingOverviewEditor === "project" ? "closing" : "open"}
            onKeyDown={handleOverviewDrawerKeyDown}
            ref={overviewEditDrawerRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="bh-overview-edit-drawer-header">
              <div>
                <span>Project</span>
                <h2 id="project-edit-drawer-title">Edit project</h2>
              </div>
              <button
                aria-label="Close project editor"
                className="bh-icon-button"
                disabled={isProjectMetadataSaving}
                onClick={closeProjectMetadataEditor}
                type="button"
              >
                <X aria-hidden="true" size={16} strokeWidth={1.5} />
              </button>
            </div>
            <form
              className="bh-overview-edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveProjectMetadata();
              }}
            >
              <label>
                <span>Project URL</span>
                <input
                  maxLength={255}
                  onChange={(event) => setProjectSlugDraft(event.target.value)}
                  placeholder="project-url"
                  value={projectSlugDraft}
                />
              </label>
              {repositoryUrlItem?.href ? (
                <div className="bh-overview-edit-readonly">
                  <span>GitHub URL</span>
                  <a href={repositoryUrlItem.href} rel="noreferrer" target="_blank">
                    <span className="bh-project-link-chip-icon" data-kind="github">
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d={siGithub.path} />
                      </svg>
                    </span>
                    <span>{repositoryUrlItem.value}</span>
                    <ExternalLink aria-hidden="true" size={16} strokeWidth={1.5} />
                  </a>
                </div>
              ) : null}
              <label>
                <span>Tags</span>
                <input
                  onChange={(event) => setProjectTagsDraft(event.target.value)}
                  placeholder="frontend, dashboard, ai"
                  value={projectTagsDraft}
                />
              </label>
              {projectTagDraftItems.length > 0 ? (
                <div className="bh-project-tag-list">
                  {projectTagDraftItems.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              ) : (
                <span className="bh-project-profile-empty">No tags</span>
              )}
              <fieldset className="bh-overview-edit-field">
                <legend>Visibility</legend>
                <div
                  aria-label="Project visibility"
                  className="bh-project-visibility"
                  role="radiogroup"
                >
                  {(["private", "public"] as const).map((option) => (
                    <button
                      aria-checked={projectVisibilityDraft === option}
                      className="bh-project-visibility-option"
                      data-active={projectVisibilityDraft === option}
                      key={option}
                      onClick={() => setProjectVisibilityDraft(option)}
                      role="radio"
                      type="button"
                    >
                      {option === "private" ? (
                        <LockKeyhole aria-hidden="true" size={16} strokeWidth={1.5} />
                      ) : (
                        <Globe2 aria-hidden="true" size={16} strokeWidth={1.5} />
                      )}
                      {option === "private" ? "Private" : "Public"}
                    </button>
                  ))}
                </div>
              </fieldset>
              {projectMetadataError ? (
                <p className="bh-description-editor-error">{projectMetadataError}</p>
              ) : null}
              <div className="bh-overview-edit-actions">
                <button
                  disabled={isProjectMetadataSaving}
                  type="button"
                  onClick={closeProjectMetadataEditor}
                >
                  Cancel
                </button>
                <button
                  disabled={isProjectMetadataSaving || projectTagsDraft.trim().length === 0}
                  type="button"
                  onClick={() => {
                    setProjectTagsDraft("");
                    void saveProjectMetadata("");
                  }}
                >
                  Clear tags
                </button>
                <button disabled={isProjectMetadataSaving} type="submit">
                  {isProjectMetadataSaving ? "Saving" : "Save"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isDescriptionDrawerVisible ? (
        <div
          className="bh-overview-edit-overlay"
          data-state={closingOverviewEditor === "description" ? "closing" : "open"}
          role="presentation"
        >
          <section
            aria-labelledby="description-edit-drawer-title"
            aria-modal="true"
            className="bh-overview-edit-drawer is-wide"
            data-state={closingOverviewEditor === "description" ? "closing" : "open"}
            onKeyDown={handleOverviewDrawerKeyDown}
            ref={overviewEditDrawerRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="bh-overview-edit-drawer-header">
              <div>
                <span>Description</span>
                <h2 id="description-edit-drawer-title">Edit description</h2>
              </div>
              <button
                aria-label="Close description editor"
                className="bh-icon-button"
                disabled={isDescriptionSaving}
                onClick={closeDescriptionEditor}
                type="button"
              >
                <X aria-hidden="true" size={16} strokeWidth={1.5} />
              </button>
            </div>
            <form
              className="bh-overview-edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveDescription(descriptionDraft);
              }}
            >
              <div className="bh-description-editor-header">
                <span>Plain text</span>
                <span>{descriptionDraft.length}/2000</span>
              </div>
              <textarea
                aria-label="Project description"
                className="bh-description-plain-editor"
                maxLength={2000}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                placeholder="Write a short project introduction."
                value={descriptionDraft}
              />
              {descriptionError ? (
                <p className="bh-description-editor-error">{descriptionError}</p>
              ) : null}
              <div className="bh-overview-edit-actions">
                <button
                  disabled={isDescriptionSaving}
                  type="button"
                  onClick={closeDescriptionEditor}
                >
                  Cancel
                </button>
                <button
                  disabled={isDescriptionSaving || !rawDescriptionValue}
                  type="button"
                  onClick={() => {
                    setDescriptionDraft("");
                    void saveDescription("");
                  }}
                >
                  Delete
                </button>
                <button disabled={isDescriptionSaving} type="submit">
                  {isDescriptionSaving ? "Saving" : "Save"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
