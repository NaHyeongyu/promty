import { type FormEvent, useState } from "react";
import { X } from "lucide-react";
import {
  setupCommandText,
  SetupCommandBlock,
} from "./SetupCommandBlock";

export function RepositoryConnector({
  onManualConnect,
  onClose,
  targetProjectName,
}: {
  onManualConnect?: (githubUrl: string) => Promise<void>;
  onClose: () => void;
  targetProjectName?: string;
}) {
  const setupCommand = setupCommandText();
  const [manualRepositoryUrl, setManualRepositoryUrl] = useState("");
  const [manualRepositoryError, setManualRepositoryError] = useState<string | null>(
    null,
  );
  const [isManualRepositorySaving, setIsManualRepositorySaving] = useState(false);
  const canSubmitManualRepository =
    Boolean(onManualConnect) && manualRepositoryUrl.trim().length > 0;

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
        error instanceof Error ? error.message : "Repository could not be connected.",
      );
    } finally {
      setIsManualRepositorySaving(false);
    }
  };

  return (
    <div className="repository-connector-overlay" role="presentation">
      <section
        aria-labelledby="repository-connector-title"
        aria-modal="true"
        className="repository-connector"
        role="dialog"
      >
        <div className="repository-connector-header">
          <div>
            <h2 id="repository-connector-title">Connect Repository</h2>
            <p>
              {onManualConnect
                ? `Paste a GitHub URL or run setup inside ${targetProjectName ?? "this project"}.`
                : `Run this inside ${targetProjectName ?? "your project"} to link the project and install local AI tool hooks.`}
            </p>
          </div>
          <button
            aria-label="Close repository connector"
            className="repository-connector-close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={16} strokeWidth={1.5} />
          </button>
        </div>

        <SetupCommandBlock command={setupCommand} label="Project terminal" />

        {onManualConnect ? (
          <form className="repository-url-form" onSubmit={submitManualRepository}>
            <label htmlFor="repository-url">GitHub repository URL</label>
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
                {isManualRepositorySaving ? "Connecting" : "Connect"}
              </button>
            </div>
            {manualRepositoryError ? (
              <p className="repository-connector-error">{manualRepositoryError}</p>
            ) : null}
          </form>
        ) : null}
      </section>
    </div>
  );
}
