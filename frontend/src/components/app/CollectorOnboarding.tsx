import { useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { BRAND_NAME } from "../../config";
import {
  type FirstEventPollingStatus,
  useFirstEventPolling,
} from "../../hooks/useFirstEventPolling";
import type { EventRecord } from "../../workspace/types";
import { setupCommandText, SetupCommandBlock } from "./SetupCommandBlock";

export function CollectorSetupFlow({
  projectName,
}: {
  projectName?: string;
}) {
  return (
    <div className="collector-setup-flow">
      <span className="collector-directory-hint">
        Run from {projectName ? <strong>{projectName}</strong> : "your project directory"}
      </span>

      <SetupCommandBlock
        command={setupCommandText()}
        helperText="Installs Codex and Claude Code hooks. Requires Node.js 20+, Python 3.12+, and Git."
        label="Project terminal"
      />

      <p className="collector-data-note">
        {BRAND_NAME} stores prompts, responses, and code changes in your workspace. Review sensitive
        content before connecting.
      </p>
    </div>
  );
}

export function FirstRunOnboarding({
  onFirstEvent,
  pollingEnabled = true,
  pollingIntervalMs = 3000,
}: {
  onFirstEvent?: (event: EventRecord) => void;
  pollingEnabled?: boolean;
  pollingIntervalMs?: number;
}) {
  return (
    <div className="first-run-onboarding">
      <header className="first-run-header">
        <h2 id="empty-projects-title">Add your first project</h2>
        <p>Run one command in the repository you want to remember.</p>
      </header>

      <CollectorSetupFlow />

      <CollectorEventWaiter
        enabled={pollingEnabled}
        intervalMs={pollingIntervalMs}
        onFirstEvent={onFirstEvent}
      />
    </div>
  );
}

export function CollectorEventWaiter({
  enabled = true,
  eventFilter,
  intervalMs = 3000,
  onFirstEvent,
  waitForNewEvent = false,
}: {
  enabled?: boolean;
  eventFilter?: (event: EventRecord) => boolean;
  intervalMs?: number;
  onFirstEvent?: (event: EventRecord) => void;
  waitForNewEvent?: boolean;
}) {
  const { checkNow, status } = useFirstEventPolling({
    enabled,
    eventFilter,
    intervalMs,
    onFirstEvent,
    waitForNewEvent,
  });
  const [isManualChecking, setIsManualChecking] = useState(false);

  const checkManually = async () => {
    if (isManualChecking) {
      return;
    }

    setIsManualChecking(true);
    try {
      await checkNow();
    } finally {
      setIsManualChecking(false);
    }
  };

  return (
    <FirstEventWaiter
      isChecking={status === "checking" || isManualChecking}
      onCheckNow={() => void checkManually()}
      status={status}
    />
  );
}

function FirstEventWaiter({
  isChecking,
  onCheckNow,
  status,
}: {
  isChecking: boolean;
  onCheckNow: () => void;
  status: FirstEventPollingStatus;
}) {
  const displayStatus = isChecking ? "checking" : status;
  const content = {
    checking: {
      description: "Looking for collector activity.",
      title: "Checking connection",
    },
    connected: {
      description: "Opening your project.",
      title: "Collector connected",
    },
    retrying: {
      description: "Automatic checks will continue.",
      title: "API unavailable",
    },
    waiting: {
      description: "Start one AI prompt after running the command.",
      title: "Waiting for the first event",
    },
  }[displayStatus];
  return (
    <section
      aria-busy={isChecking}
      className="first-event-waiter"
      data-status={displayStatus}
    >
      <span className="first-event-indicator" aria-hidden="true" />
      <div aria-live="polite" role="status">
        <strong>{content.title}</strong>
        <p>{content.description}</p>
      </div>
      {status !== "connected" ? (
        <button
          aria-label={isChecking ? "Checking connection" : "Check connection now"}
          className="first-event-refresh"
          disabled={isChecking}
          onClick={onCheckNow}
          title={isChecking ? "Checking connection" : "Check connection now"}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={15} strokeWidth={1.5} />
        </button>
      ) : (
        <Check aria-hidden="true" className="first-event-complete" size={18} />
      )}
    </section>
  );
}
