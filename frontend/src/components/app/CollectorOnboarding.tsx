import { useId, useMemo, useState } from "react";
import {
  Bot,
  Check,
  FileDiff,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BRAND_NAME } from "../../config";
import {
  type FirstEventPollingStatus,
  useFirstEventPolling,
} from "../../hooks/useFirstEventPolling";
import type { EventRecord } from "../../workspace/types";
import {
  type CollectorTool,
  setupCommandText,
  SetupCommandBlock,
} from "./SetupCommandBlock";

const TOOL_OPTIONS: Array<{
  description: string;
  icon: typeof Bot;
  id: CollectorTool;
  label: string;
}> = [
  {
    description: "Installs a repository hook in .codex/hooks.json",
    icon: Bot,
    id: "codex-cli",
    label: "Codex",
  },
  {
    description: "Installs local hooks in .claude/settings.local.json",
    icon: Sparkles,
    id: "claude-code",
    label: "Claude Code",
  },
];

export function CollectorSetupFlow({
  compact = false,
  initialTool = "codex-cli",
  projectName,
}: {
  compact?: boolean;
  initialTool?: CollectorTool;
  projectName?: string;
}) {
  const headingIdPrefix = useId();
  const [selectedTool, setSelectedTool] = useState<CollectorTool>(initialTool);
  const [hasAcceptedScope, setHasAcceptedScope] = useState(false);
  const command = useMemo(() => setupCommandText(selectedTool), [selectedTool]);

  return (
    <div className="collector-setup-flow" data-compact={compact}>
      <section
        className="onboarding-step"
        aria-labelledby={`${headingIdPrefix}-collector-tool-title`}
      >
        <StepMarker value="1" />
        <div className="onboarding-step-content">
          <div className="onboarding-step-heading">
            <h3 id={`${headingIdPrefix}-collector-tool-title`}>Choose your AI tool</h3>
            <p>Only integrations with an installable hook are available.</p>
          </div>

          <div className="collector-tool-selector" role="group" aria-label="AI tool">
            {TOOL_OPTIONS.map((tool) => {
              const ToolIcon = tool.icon;
              const isSelected = selectedTool === tool.id;
              return (
                <button
                  aria-pressed={isSelected}
                  className="collector-tool-option"
                  data-selected={isSelected}
                  key={tool.id}
                  onClick={() => setSelectedTool(tool.id)}
                  type="button"
                >
                  <span className="collector-tool-icon">
                    <ToolIcon aria-hidden="true" size={18} strokeWidth={1.5} />
                  </span>
                  <span>
                    <strong>{tool.label}</strong>
                    <small>{tool.description}</small>
                  </span>
                  {isSelected ? (
                    <Check aria-hidden="true" className="collector-tool-check" size={16} />
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="collector-support-note">
            Cursor and Gemini CLI collection remain unavailable until their hook paths are verified.
          </p>
        </div>
      </section>

      <section
        className="onboarding-step"
        aria-labelledby={`${headingIdPrefix}-collector-scope-title`}
      >
        <StepMarker value="2" />
        <div className="onboarding-step-content">
          <div className="onboarding-step-heading">
            <h3 id={`${headingIdPrefix}-collector-scope-title`}>
              Review the collection scope
            </h3>
            <p>The collector runs locally and sends the following data to your workspace.</p>
          </div>

          <div className="collector-scope-list">
            <ScopeItem
              icon={MessageSquareText}
              text="Prompt and assistant response content"
            />
            <ScopeItem
              icon={FileDiff}
              text="Changed file paths and patch content"
            />
            <ScopeItem
              icon={ShieldCheck}
              text="Project, branch, model, and session metadata"
            />
          </div>

          <p className="collector-privacy-note">
            Patch content is omitted for common sensitive paths such as <code>.env</code> and
            secret-named files, but file paths and change metadata can still be sent. Prompts can
            contain sensitive text, so review what you send to your AI tool. Nothing is collected
            until this setup command runs.
          </p>

          <label className="collector-consent">
            <input
              checked={hasAcceptedScope}
              onChange={(event) => setHasAcceptedScope(event.target.checked)}
              type="checkbox"
            />
            <span>
              I understand that prompt, response, and code-change content is uploaded to my {" "}
              {BRAND_NAME} workspace.
            </span>
          </label>
        </div>
      </section>

      <section
        className="onboarding-step"
        aria-labelledby={`${headingIdPrefix}-collector-install-title`}
      >
        <StepMarker value="3" />
        <div className="onboarding-step-content">
          <div className="onboarding-step-heading">
            <h3 id={`${headingIdPrefix}-collector-install-title`}>
              Install from the project directory
            </h3>
            <p>
              Run this in {projectName ? (
                <strong>{projectName}</strong>
              ) : (
                "the repository you want to remember"
              )}. The browser will ask you to authorize a separate collector token.
            </p>
          </div>
          <ul className="collector-prerequisites" aria-label="Setup requirements">
            <li>Node.js 20+</li>
            <li>Python 3.12+</li>
            <li>Git repository</li>
          </ul>
          <SetupCommandBlock
            command={command}
            disabled={!hasAcceptedScope}
            disabledReason={
              hasAcceptedScope ? undefined : "Confirm the collection scope to copy this command."
            }
            helperText="promty-collector is the npm package name for the local collector."
            label="Project terminal"
          />
        </div>
      </section>
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
        <span className="first-run-eyebrow">First project</span>
        <h2 id="empty-projects-title">Capture your first AI session</h2>
        <p>
          Install one local collector in a repository. {BRAND_NAME} will open the project as soon
          as the first event arrives.
        </p>
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
  const { checkNow, lastCheckedAt, status } = useFirstEventPolling({
    enabled,
    eventFilter,
    intervalMs,
    onFirstEvent,
    waitForNewEvent,
  });

  return (
    <FirstEventWaiter
      lastCheckedAt={lastCheckedAt}
      onCheckNow={() => void checkNow()}
      status={status}
    />
  );
}

function StepMarker({ value }: { value: string }) {
  return (
    <span className="onboarding-step-marker" aria-hidden="true">
      {value}
    </span>
  );
}

function ScopeItem({
  icon: ScopeIcon,
  text,
}: {
  icon: typeof MessageSquareText;
  text: string;
}) {
  return (
    <span className="collector-scope-item">
      <ScopeIcon aria-hidden="true" size={16} strokeWidth={1.5} />
      <span>{text}</span>
    </span>
  );
}

function FirstEventWaiter({
  lastCheckedAt,
  onCheckNow,
  status,
}: {
  lastCheckedAt: Date | null;
  onCheckNow: () => void;
  status: FirstEventPollingStatus;
}) {
  const content = {
    checking: {
      description: "Checking this workspace for collector activity.",
      title: "Checking collector connection",
    },
    connected: {
      description: "Opening the project with its first captured session.",
      title: "First event received",
    },
    retrying: {
      description: "The status check could not reach the API. Automatic checks will continue.",
      title: "Waiting for the API",
    },
    waiting: {
      description: "After setup, start one AI prompt in this repository. This page checks automatically.",
      title: "Waiting for your first event",
    },
  }[status];

  return (
    <section className="first-event-waiter" data-status={status}>
      <span className="first-event-indicator" aria-hidden="true" />
      <div aria-live="polite" role="status">
        <strong>{content.title}</strong>
        <p>{content.description}</p>
        {lastCheckedAt && status !== "connected" ? (
          <small>
            Last checked {lastCheckedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </small>
        ) : null}
      </div>
      {status !== "connected" ? (
        <button className="first-event-refresh" onClick={onCheckNow} type="button">
          <RefreshCw aria-hidden="true" size={15} strokeWidth={1.5} />
          <span>Check now</span>
        </button>
      ) : (
        <Check aria-hidden="true" className="first-event-complete" size={18} />
      )}
    </section>
  );
}
