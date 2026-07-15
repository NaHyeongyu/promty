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
import { useState } from "react";
import { siGithub } from "simple-icons";
import { AiModelBadge } from "./AiModelBadge";
import { EmptyState } from "./EmptyState";
import { OverviewStatistics } from "./OverviewStatistics";
import {
  projectTagsFromInput,
  projectVisibilityFromValue,
} from "./overviewPanelUtils";
import type { ProjectDetailData } from "./types";
import { useI18n } from "../../i18n/I18nProvider";
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
  onDeleteProject,
  onSaveDescription,
  onSaveProjectMetadata,
}: {
  data: ProjectDetailData;
  onDeleteProject?: () => Promise<void>;
  onSaveDescription?: (description: string) => Promise<void>;
  onSaveProjectMetadata?: (metadata: {
    projectUrl?: string;
    tags?: string[];
    visibility?: "private" | "public";
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [isProjectDeleting, setIsProjectDeleting] = useState(false);
  const [projectDeleteError, setProjectDeleteError] = useState<string | null>(null);
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
    projectUrlDraft,
    projectTagsDraft,
    projectVisibilityDraft,
    saveDescription,
    saveProjectMetadata,
    setDescriptionDraft,
    setProjectUrlDraft,
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
        description={t("project.noOverviewDescription")}
        icon={BookOpen}
        title={t("project.noOverview")}
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
    ? t("settings.statusConnected")
    : data.project.repositoryStatus?.replace(/^Repository\s+/i, "") || t("project.notConnected");
  const projectVisibility = projectVisibilityFromValue(
    data.project.visibility ?? visibilityItem?.value,
  );
  const lastActivityDisplay =
    lastActivityItem?.description && lastActivityItem.description !== "No activity"
      ? lastActivityItem.description
      : lastActivityItem?.value ?? latestActivity?.lastActivity ?? t("common.noActivity");
  const canEditDescription = Boolean(onSaveDescription);
  const canEditProjectMetadata = Boolean(onSaveProjectMetadata);
  const deleteCurrentProject = async () => {
    if (!onDeleteProject || isProjectDeleting || isProjectMetadataSaving) {
      return;
    }
    if (!window.confirm(t("project.deleteConfirm", { name: data.project.name }))) {
      return;
    }

    setProjectDeleteError(null);
    setIsProjectDeleting(true);
    try {
      await onDeleteProject();
    } catch (error) {
      setProjectDeleteError(
        error instanceof Error ? error.message : t("project.deleteFailed"),
      );
      setIsProjectDeleting(false);
    }
  };
  return (
    <div className="bh-overview-dashboard">
      <OverviewStatistics data={data} />

      <div className="bh-overview-detail-grid">
        <section
          className="bh-overview-card bh-overview-card-repository"
          aria-labelledby="project-repository-title"
        >
          <div className="bh-overview-card-header">
            <h2 id="project-repository-title">
              <Folder aria-hidden="true" size={16} strokeWidth={1.5} />
              <span>{t("project.project")}</span>
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
            <div className="bh-project-context-links" aria-label={t("project.projectLinks")}>
              <div className="bh-project-context-link-field">
                <span className="bh-project-context-link-label">{t("project.projectUrl")}</span>
                {projectUrlItem?.value ? (
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
                    <span className="bh-project-context-link-value">{t("project.notProvided")}</span>
                  </span>
                )}
              </div>

              <div className="bh-project-context-link-field">
                <span className="bh-project-context-link-label">{t("project.githubUrl")}</span>
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
                      {repositoryUrlItem?.value ?? t("project.notConnected")}
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div className="bh-overview-card-divider" />

            <div className="bh-project-context-grid">
              <section className="bh-project-context-section" aria-label={t("project.repository")}>
                <h3>{t("project.repository")}</h3>
                <div className="bh-project-summary-strip">
                  <span data-state={repositoryConnected ? "connected" : "idle"}>
                    <i aria-hidden="true" />
                    <strong>{t("common.status")}</strong>
                    {repositoryStatusText}
                  </span>
                  <span>
                    {projectVisibility === "public" ? (
                      <Globe2 aria-hidden="true" size={16} strokeWidth={1.5} />
                    ) : (
                      <LockKeyhole aria-hidden="true" size={16} strokeWidth={1.5} />
                    )}
                    {projectVisibility === "public" ? t("project.workspaceListed") : t("project.private")}
                  </span>
                </div>
              </section>

              <section className="bh-project-context-section" aria-label={t("project.aiContext")}>
                <h3>{t("project.aiContext")}</h3>
                <div className="bh-overview-model-badge-list">
                  {projectAiModelNames.length > 0 ? (
                    projectAiModelNames.map((model) => (
                      <AiModelBadge className="is-compact" key={model} model={model} />
                    ))
                  ) : (
                    <span className="ai-model-badge is-muted">{t("project.noModels")}</span>
                  )}
                </div>
              </section>

              <section className="bh-project-context-section" aria-label={t("common.tags")}>
                <h3>{t("common.tags")}</h3>
                {data.project.tags.length > 0 ? (
                  <div className="bh-project-tag-list">
                    {data.project.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : (
                  <span className="bh-project-profile-empty">{t("project.noTags")}</span>
                )}
              </section>

              <section
                className="bh-project-context-section"
                aria-label={t("project.lastActivity")}
              >
                <h3>{t("project.lastActivity")}</h3>
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
              <span>{t("project.description")}</span>
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
            emptyLabel={t("project.notProvided")}
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
                <span>{t("project.project")}</span>
                <h2 id="project-edit-drawer-title">{t("project.editProject")}</h2>
              </div>
              <button
                aria-label={t("project.closeEditor")}
                className="bh-icon-button"
                disabled={isProjectDeleting || isProjectMetadataSaving}
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
                <span>{t("project.projectUrl")}</span>
                <input
                  inputMode="url"
                  maxLength={2048}
                  onChange={(event) => setProjectUrlDraft(event.target.value)}
                  placeholder=""
                  type="text"
                  value={projectUrlDraft}
                />
              </label>
              {repositoryUrlItem?.href ? (
                <div className="bh-overview-edit-readonly">
                  <span>{t("project.githubUrl")}</span>
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
                <span>{t("common.tags")}</span>
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
                <span className="bh-project-profile-empty">{t("project.noTags")}</span>
              )}
              <fieldset className="bh-overview-edit-field">
                <legend>{t("project.workspaceVisibility")}</legend>
                <div
                  aria-label={t("project.visibility")}
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
                      {option === "private" ? t("project.private") : t("project.workspaceListed")}
                    </button>
                  ))}
                </div>
              </fieldset>
              {projectMetadataError ? (
                <p className="bh-description-editor-error">{projectMetadataError}</p>
              ) : null}
              {projectDeleteError ? (
                <p className="bh-description-editor-error">{projectDeleteError}</p>
              ) : null}
              <div className="bh-overview-edit-actions">
                {onDeleteProject ? (
                  <button
                    className="bh-overview-delete-action"
                    disabled={isProjectDeleting || isProjectMetadataSaving}
                    onClick={() => {
                      void deleteCurrentProject();
                    }}
                    type="button"
                  >
                    {isProjectDeleting ? t("project.deleting") : t("project.delete")}
                  </button>
                ) : null}
                <button
                  disabled={isProjectDeleting || isProjectMetadataSaving}
                  type="button"
                  onClick={closeProjectMetadataEditor}
                >
                  Cancel
                </button>
                <button
                  disabled={
                    isProjectDeleting ||
                    isProjectMetadataSaving ||
                    projectTagsDraft.trim().length === 0
                  }
                  type="button"
                  onClick={() => {
                    setProjectTagsDraft("");
                    void saveProjectMetadata("");
                  }}
                >
                  Clear tags
                </button>
                <button
                  disabled={isProjectDeleting || isProjectMetadataSaving}
                  type="submit"
                >
                  {isProjectMetadataSaving ? t("common.saving") : t("common.save")}
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
                <span>{t("project.description")}</span>
                <h2 id="description-edit-drawer-title">{t("project.editDescription")}</h2>
              </div>
              <button
                aria-label={t("project.closeDescriptionEditor")}
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
                <span>{t("project.plainText")}</span>
                <span>{descriptionDraft.length}/2000</span>
              </div>
              <textarea
                aria-label={t("project.projectDescription")}
                className="bh-description-plain-editor"
                maxLength={2000}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                placeholder={t("project.descriptionPlaceholder")}
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
                  {isDescriptionSaving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
