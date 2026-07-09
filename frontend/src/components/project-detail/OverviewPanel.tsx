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
import { OverviewStatistics } from "./OverviewStatistics";
import {
  projectTagsFromInput,
  projectVisibilityFromValue,
} from "./overviewPanelUtils";
import type { ProjectDetailData } from "./types";
import { useOverviewEditors } from "./useOverviewEditors";

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
  const rawDescriptionValue = data.project.description.trim();
  const {
    closingOverviewEditor,
    closeDescriptionEditor,
    closeProjectMetadataEditor,
    descriptionDraft,
    descriptionError,
    handleOverviewDrawerKeyDown,
    isDescriptionDrawerVisible,
    isDescriptionSaving,
    isProjectMetadataDrawerVisible,
    isProjectMetadataSaving,
    openDescriptionEditor,
    openProjectMetadataEditor,
    overviewEditDrawerRef,
    projectMetadataError,
    projectSlugDraft,
    projectTagsDraft,
    projectVisibilityDraft,
    saveDescription,
    saveProjectMetadata,
    setDescriptionDraft,
    setProjectSlugDraft,
    setProjectTagsDraft,
    setProjectVisibilityDraft,
  } = useOverviewEditors({
    data,
    onSaveDescription,
    onSaveProjectMetadata,
    rawDescriptionValue,
  });

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
  const projectAiModelNames =
    aiModelsItem?.value && aiModelsItem.value !== "Not captured"
      ? aiModelsItem.value.split(",").map((model) => model.trim()).filter(Boolean)
      : [];
  const projectTagDraftItems = projectTagsFromInput(projectTagsDraft);
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

  return (
    <div className="bh-overview-dashboard">
      <OverviewStatistics data={data} overviewItems={overviewItems} />

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
