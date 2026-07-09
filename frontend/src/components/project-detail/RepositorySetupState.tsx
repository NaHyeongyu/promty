import { useEffect, useRef, useState } from "react";
import { Check, Copy, GitBranch } from "lucide-react";

const githubRemoteCommand = "git remote add origin https://github.com/OWNER/REPO.git";

export function GitHubRepositorySetupState() {
  const resetCopyTimerRef = useRef<number | null>(null);
  const [hasCopiedCommand, setHasCopiedCommand] = useState(false);

  useEffect(() => {
    return () => {
      if (resetCopyTimerRef.current !== null) {
        window.clearTimeout(resetCopyTimerRef.current);
      }
    };
  }, []);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(githubRemoteCommand);
      setHasCopiedCommand(true);
      if (resetCopyTimerRef.current !== null) {
        window.clearTimeout(resetCopyTimerRef.current);
      }
      resetCopyTimerRef.current = window.setTimeout(() => {
        setHasCopiedCommand(false);
        resetCopyTimerRef.current = null;
      }, 1600);
    } catch {
      setHasCopiedCommand(false);
    }
  };

  return (
    <section className="bh-repository-setup" aria-labelledby="github-setup-title">
      <div className="bh-repository-setup-copy">
        <GitBranch aria-hidden="true" size={20} strokeWidth={1.5} />
        <div>
          <h3 id="github-setup-title">GitHub repository not linked</h3>
          <p>
            Add the GitHub remote in this project, then run repository setup again
            to attach source context.
          </p>
        </div>
      </div>
      <div className="bh-repository-command" aria-label="GitHub remote command">
        <code>{githubRemoteCommand}</code>
        <button
          aria-label={hasCopiedCommand ? "Copied command" : "Copy command"}
          onClick={copyCommand}
          title={hasCopiedCommand ? "Copied" : "Copy command"}
          type="button"
        >
          {hasCopiedCommand ? (
            <Check aria-hidden="true" size={16} strokeWidth={1.5} />
          ) : (
            <Copy aria-hidden="true" size={16} strokeWidth={1.5} />
          )}
        </button>
      </div>
    </section>
  );
}
