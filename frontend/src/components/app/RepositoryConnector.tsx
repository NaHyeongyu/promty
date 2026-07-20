import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Check, FolderGit2, Laptop, X } from "lucide-react";
import type { EventRecord } from "../../workspace/types";
import {
  CollectorEventWaiter,
  CollectorSetupFlow,
} from "./CollectorOnboarding";
import { useI18n } from "../../i18n/I18nProvider";

export function RepositoryConnector({
  existingProjectIds = [],
  onManualConnect,
  onClose,
  onFirstEvent,
  pollingEnabled = false,
  repositoryAccessAvailable = false,
  repositoryConnectUrl,
  targetProjectId,
  targetProjectName,
}: {
  existingProjectIds?: string[];
  onManualConnect?: (githubUrl: string) => Promise<void>;
  onClose: () => void;
  onFirstEvent?: (event: EventRecord) => void;
  pollingEnabled?: boolean;
  repositoryAccessAvailable?: boolean;
  repositoryConnectUrl?: string;
  targetProjectId?: string;
  targetProjectName?: string;
}) {
  const { t } = useI18n();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [manualRepositoryUrl, setManualRepositoryUrl] = useState("");
  const [manualRepositoryError, setManualRepositoryError] = useState<string | null>(
    null,
  );
  const [isManualRepositorySaving, setIsManualRepositorySaving] = useState(false);
  const isExistingProjectConnection = Boolean(onManualConnect && targetProjectName);
  const [connectionMode, setConnectionMode] = useState<"collector" | "repository">(
    isExistingProjectConnection ? "repository" : "collector",
  );
  const connectorTitle = onManualConnect
    ? isExistingProjectConnection
      ? t("collector.addContext", { name: targetProjectName ?? t("collector.thisProject") })
      : t("collector.addProject")
    : t("collector.setupProject", { name: targetProjectName ?? t("collector.thisProject") });
  const connectorDescription = onManualConnect
    ? isExistingProjectConnection
      ? t("collector.separateConnections")
      : t("collector.addProjectDescription")
    : t("collector.localDescription");
  const manualSubmitLabel = isExistingProjectConnection ? t("collector.connect") : t("common.create");
  const manualSavingLabel = isExistingProjectConnection ? t("collector.connecting") : t("collector.creating");
  const canSubmitManualRepository =
    Boolean(onManualConnect) && manualRepositoryUrl.trim().length > 0;

  useEffect(() => {
    const previousActiveElement = document.activeElement;
    closeButtonRef.current?.focus();
    return () => {
      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus();
      }
    };
  }, []);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        [
          "a[href]",
          "button:not([disabled])",
          "input:not([disabled])",
          "select:not([disabled])",
          "textarea:not([disabled])",
          "[tabindex]:not([tabindex='-1'])",
        ].join(","),
      ) ?? [],
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (!firstElement || !lastElement) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  const submitManualRepository = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onManualConnect || !manualRepositoryUrl.trim()) {
      return;
    }

    setIsManualRepositorySaving(true);
    setManualRepositoryError(null);
    try {
      await onManualConnect(manualRepositoryUrl.trim());
      onClose();
    } catch (error) {
      setManualRepositoryError(
        error instanceof Error ? error.message : t("project.metadataSaveFailed"),
      );
    } finally {
      setIsManualRepositorySaving(false);
    }
  };

  return (
    <div
      className="repository-connector-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-labelledby="repository-connector-title"
        aria-modal="true"
        className="repository-connector"
        data-mode={connectionMode}
        data-onboarding="true"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className="repository-connector-header">
          <div>
            <h2 id="repository-connector-title">{connectorTitle}</h2>
            <p>{connectorDescription}</p>
          </div>
          <button
            aria-label={t("collector.closeConnector")}
            className="repository-connector-close"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={16} strokeWidth={1.5} />
          </button>
        </div>

        {onManualConnect ? (
          <div className="repository-connector-modes" aria-label={t("collector.connectionType")} role="group">
            <button
              aria-pressed={connectionMode === "collector"}
              data-active={connectionMode === "collector"}
              onClick={() => setConnectionMode("collector")}
              type="button"
            >
              <span className="repository-connector-mode-icon" aria-hidden="true">
                <Laptop size={17} strokeWidth={1.5} />
              </span>
              <span className="repository-connector-mode-copy">
                <strong>{t("collector.captureAi")}</strong>
                <small>{t("collector.localDescription")}</small>
              </span>
              {connectionMode === "collector" ? (
                <Check
                  aria-hidden="true"
                  className="repository-connector-mode-check"
                  size={16}
                  strokeWidth={1.8}
                />
              ) : null}
            </button>
            <button
              aria-pressed={connectionMode === "repository"}
              data-active={connectionMode === "repository"}
              onClick={() => setConnectionMode("repository")}
              type="button"
            >
              <span className="repository-connector-mode-icon" aria-hidden="true">
                <FolderGit2 size={17} strokeWidth={1.5} />
              </span>
              <span className="repository-connector-mode-copy">
                <strong>{t("collector.repositoryOnly")}</strong>
                <small>{t("collector.repositoryOnlyDescription")}</small>
              </span>
              {connectionMode === "repository" ? (
                <Check
                  aria-hidden="true"
                  className="repository-connector-mode-check"
                  size={16}
                  strokeWidth={1.8}
                />
              ) : null}
            </button>
          </div>
        ) : null}

        <div className="repository-connector-content">
          {connectionMode === "collector" || !onManualConnect ? (
            <>
              <CollectorSetupFlow projectName={targetProjectName} />
              {pollingEnabled ? (
                <CollectorEventWaiter
                  eventFilter={(event) =>
                    targetProjectId
                      ? event.project_id === targetProjectId
                      : !existingProjectIds.includes(event.project_id)
                  }
                  onFirstEvent={onFirstEvent}
                  waitForNewEvent
                />
              ) : null}
            </>
          ) : null}

          {onManualConnect &&
          connectionMode === "repository" &&
          !repositoryAccessAvailable ? (
            <div className="repository-access-gate">
              <FolderGit2 aria-hidden="true" size={20} strokeWidth={1.5} />
              <div>
                <strong>{t("collector.connectGithubAccess")}</strong>
                <p>{t("collector.authRepoDescription")}</p>
              </div>
              {repositoryConnectUrl ? (
                <a className="toolbar-button" href={repositoryConnectUrl}>
                  {t("files.connectGithub")}
                </a>
              ) : null}
            </div>
          ) : null}

          {onManualConnect &&
          connectionMode === "repository" &&
          repositoryAccessAvailable ? (
            <form
              className="repository-url-form is-repository-only"
              onSubmit={submitManualRepository}
            >
              <div className="repository-only-heading">
                <strong>
                  {isExistingProjectConnection
                    ? t("collector.attachRepo")
                    : t("collector.createFromRepo")}
                </strong>
                <p>
                  {isExistingProjectConnection
                    ? t("collector.attachRepoDescription", {
                        name: targetProjectName ?? t("collector.thisProject"),
                      })
                    : t("collector.createFromRepoDescription")}
                </p>
              </div>
              <label htmlFor="repository-url">{t("collector.githubRepoUrl")}</label>
              <div className="repository-url-row">
                <input
                  autoComplete="off"
                  id="repository-url"
                  inputMode="url"
                  onChange={(event) => setManualRepositoryUrl(event.target.value)}
                  placeholder="https://github.com/owner/repo"
                  spellCheck={false}
                  type="url"
                  value={manualRepositoryUrl}
                />
                <button
                  className="repository-url-submit"
                  disabled={!canSubmitManualRepository || isManualRepositorySaving}
                  type="submit"
                >
                  {isManualRepositorySaving ? manualSavingLabel : manualSubmitLabel}
                </button>
              </div>
              {manualRepositoryError ? (
                <p className="repository-connector-error">{manualRepositoryError}</p>
              ) : null}
            </form>
          ) : null}
        </div>
      </section>
    </div>
  );
}
