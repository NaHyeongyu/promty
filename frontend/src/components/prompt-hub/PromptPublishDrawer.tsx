import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createPromptDraftFromActivity,
  promptHubErrorMessage,
  publishPrompt,
  updatePublishedPrompt,
  type PromptHubDetail,
  type PromptHubSharedScope,
  type PromptHubVisibility,
} from "../../api/promptHub";
import type { PromptActivityItem } from "../project-detail";
import "./prompt-hub.css";

type PromptPublishDrawerProps = {
  activity: PromptActivityItem;
  onClose: () => void;
  onPublished?: (prompt: PromptHubDetail) => void;
  projectId: string;
};

const categoryOptions = [
  "Frontend",
  "Backend",
  "Refactoring",
  "Architecture",
  "Documentation",
];

function defaultTitle(prompt: string) {
  const firstLine = prompt.split(/\r?\n/).find((line) => line.trim());
  if (!firstLine) {
    return "Untitled prompt";
  }
  return firstLine.trim().slice(0, 120);
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index)
    .slice(0, 20);
}

export function PromptPublishDrawer({
  activity,
  onClose,
  onPublished,
  projectId,
}: PromptPublishDrawerProps) {
  const [category, setCategory] = useState("Frontend");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPrompt, setSavedPrompt] = useState<PromptHubDetail | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [title, setTitle] = useState(defaultTitle(activity.prompt));
  const [visibility, setVisibility] = useState<PromptHubVisibility>("private");
  const [sharedScope, setSharedScope] = useState<PromptHubSharedScope>({
    include_diff: true,
    include_files: true,
    include_project_context: true,
    include_prompt: true,
    include_response: true,
    include_terminal: false,
  });
  const diffSnippetCount = useMemo(
    () => activity.fileChanges.filter((change) => change.patch).length,
    [activity.fileChanges],
  );
  const promptPreview = activity.prompt.trim() || "Not available";
  const responseStatus = activity.response?.trim() ? "Available" : "Not available";
  const terminalStatus = "Not available";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const updateScope = (key: keyof PromptHubSharedScope, value: boolean) => {
    setSharedScope((scope) => ({
      ...scope,
      [key]: value,
    }));
  };

  const save = async (shouldPublish: boolean) => {
    if (
      shouldPublish &&
      visibility === "public" &&
      !window.confirm(
        "You are about to publish this prompt and selected execution context.",
      )
    ) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsSaving(true);
    let failureMessage = shouldPublish
      ? "Failed to publish prompt"
      : "Failed to create draft";
    try {
      const draft =
        savedPrompt ??
        (await createPromptDraftFromActivity({
          activity_id: activity.id,
          include_diff: sharedScope.include_diff,
          include_files: sharedScope.include_files,
          include_project_context: sharedScope.include_project_context,
          include_prompt: sharedScope.include_prompt,
          include_response: sharedScope.include_response,
          include_terminal: sharedScope.include_terminal,
          project_id: projectId,
          summary: summary.trim() || null,
          title: title.trim(),
        }));
      failureMessage = "Failed to create draft";
      const updated = await updatePublishedPrompt(draft.id, {
        category,
        shared_scope: sharedScope,
        summary: summary.trim() || null,
        tags: parseTags(tags),
        title: title.trim(),
        visibility,
      });
      setSavedPrompt(updated);
      if (shouldPublish) {
        failureMessage = "Failed to publish prompt";
        const published = await publishPrompt(updated.id);
        setSavedPrompt(published);
        setStatusMessage("Prompt published.");
        onPublished?.(published);
        return;
      }
      setStatusMessage("Draft saved.");
    } catch (error) {
      setErrorMessage(promptHubErrorMessage(error, failureMessage));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bh-publish-drawer-shell" role="presentation">
      <aside
        aria-labelledby="publish-drawer-title"
        aria-modal="true"
        className="bh-publish-drawer"
        role="dialog"
      >
        <div className="bh-publish-drawer-header">
          <div>
            <span>Prompt Hub</span>
            <h2 id="publish-drawer-title">Publish to Prompt Hub</h2>
          </div>
          <button
            aria-label="Close publish drawer"
            className="repository-connector-close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={16} strokeWidth={1.5} />
          </button>
        </div>

        <form
          className="bh-publish-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
        >
          <label>
            <span>Title</span>
            <input
              onChange={(event) => setTitle(event.target.value)}
              required
              type="text"
              value={title}
            />
          </label>

          <label>
            <span>Summary</span>
            <textarea
              onChange={(event) => setSummary(event.target.value)}
              rows={4}
              value={summary}
            />
          </label>

          <div className="bh-publish-form-grid">
            <label>
              <span>Category</span>
              <select onChange={(event) => setCategory(event.target.value)} value={category}>
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Visibility</span>
              <select
                onChange={(event) =>
                  setVisibility(event.target.value as PromptHubVisibility)
                }
                value={visibility}
              >
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </select>
            </label>
          </div>

          <label>
            <span>Tags</span>
            <input
              onChange={(event) => setTags(event.target.value)}
              placeholder="frontend, refactor"
              type="text"
              value={tags}
            />
          </label>

          <fieldset className="bh-publish-scope">
            <legend>Include</legend>
            {[
              ["include_prompt", "Prompt"],
              ["include_response", "Response"],
              ["include_files", "Changed files"],
              ["include_diff", "Diff snippets"],
              ["include_terminal", "Terminal logs"],
              ["include_project_context", "Project context"],
            ].map(([key, label]) => (
              <label key={key}>
                <input
                  checked={sharedScope[key as keyof PromptHubSharedScope]}
                  onChange={(event) =>
                    updateScope(
                      key as keyof PromptHubSharedScope,
                      event.target.checked,
                    )
                  }
                  type="checkbox"
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <section className="bh-publish-preview" aria-labelledby="publish-preview-title">
            <h3 id="publish-preview-title">Preview</h3>
            <pre>{promptPreview}</pre>
            <dl>
              <div>
                <dt>Selected files</dt>
                <dd>{sharedScope.include_files ? activity.fileChanges.length : 0}</dd>
              </div>
              <div>
                <dt>Diff snippets</dt>
                <dd>{sharedScope.include_diff ? diffSnippetCount : 0}</dd>
              </div>
              <div>
                <dt>Response</dt>
                <dd>{sharedScope.include_response ? responseStatus : "Excluded"}</dd>
              </div>
              <div>
                <dt>Terminal logs</dt>
                <dd>{sharedScope.include_terminal ? terminalStatus : "Excluded"}</dd>
              </div>
            </dl>
          </section>

          {errorMessage || statusMessage ? (
            <div className="repository-connector-message" data-error={Boolean(errorMessage)}>
              {errorMessage ?? statusMessage}
            </div>
          ) : null}

          <div className="bh-publish-actions">
            <button className="toolbar-button" disabled={isSaving} type="submit">
              {isSaving ? "Saving" : "Save Draft"}
            </button>
            <button
              className="empty-state-button"
              disabled={isSaving || !title.trim()}
              onClick={() => void save(true)}
              type="button"
            >
              {isSaving ? "Publishing" : "Publish"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
