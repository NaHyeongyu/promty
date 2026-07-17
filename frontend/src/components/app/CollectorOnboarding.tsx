import { useId, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { BRAND_NAME } from "../../config";
import {
  type FirstEventPollingStatus,
  useFirstEventPolling,
} from "../../hooks/useFirstEventPolling";
import type { EventRecord } from "../../workspace/types";
import {
  type CollectorInstallTarget,
  setupCommandText,
  SetupCommandBlock,
} from "./SetupCommandBlock";
import { useI18n } from "../../i18n/I18nProvider";

export function CollectorSetupFlow({
  projectName,
}: {
  projectName?: string;
}) {
  const { t } = useI18n();
  const repositoryName = projectName ?? t("collector.yourProject");
  const toolGroupName = useId();
  const [installTarget, setInstallTarget] = useState<CollectorInstallTarget>("codex-cli");
  const toolOptions: Array<{
    description: string;
    label: string;
    recommended?: boolean;
    value: CollectorInstallTarget;
  }> = [
    {
      description: t("collector.toolCodexDescription"),
      label: t("collector.toolCodex"),
      recommended: true,
      value: "codex-cli",
    },
    {
      description: t("collector.toolClaudeDescription"),
      label: t("collector.toolClaude"),
      value: "claude-code",
    },
    {
      description: t("collector.toolBothDescription"),
      label: t("collector.toolBoth"),
      value: "all",
    },
  ];
  const commandScope = {
    all: t("collector.commandScopeBoth"),
    "claude-code": t("collector.commandScopeClaude"),
    "codex-cli": t("collector.commandScopeCodex"),
  }[installTarget];

  return (
    <div className="collector-setup-flow">
      <span className="collector-directory-hint">
        {t("collector.runFromRepository", { name: repositoryName })}
      </span>

      <fieldset className="collector-tool-selector">
        <legend>{t("collector.toolChoiceLabel")}</legend>
        <div className="collector-tool-options">
          {toolOptions.map((option) => (
            <label
              className="collector-tool-option"
              data-active={installTarget === option.value}
              key={option.value}
            >
              <input
                checked={installTarget === option.value}
                name={toolGroupName}
                onChange={() => setInstallTarget(option.value)}
                type="radio"
                value={option.value}
              />
              <span className="collector-tool-radio" aria-hidden="true" />
              <span>
                <strong>
                  {option.label}
                  {option.recommended ? <em>{t("collector.recommended")}</em> : null}
                </strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="collector-command-scope">
        <Check aria-hidden="true" size={16} strokeWidth={1.8} />
        <div>
          <strong>{t("collector.commandScopeTitle")}</strong>
          <span>{commandScope}</span>
        </div>
      </div>

      <SetupCommandBlock
        command={setupCommandText(installTarget)}
        helperText={t("collector.setupRequirements")}
        label={t("collector.projectTerminal")}
      />

      <p className="collector-scope-note">
        <strong>{t("collector.repositoryScopeTitle")}</strong>{" "}
        {t("collector.repositoryScopeDescription")}
      </p>

      <p className="collector-data-note">
        {t("collector.dataNotice", { brand: BRAND_NAME })}
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
  const { t } = useI18n();
  return (
    <div className="first-run-onboarding">
      <header className="first-run-header">
        <h2 id="empty-projects-title">{t("collector.firstProject")}</h2>
        <p>{t("collector.firstProjectDescription")}</p>
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
  const { t } = useI18n();
  const displayStatus = isChecking ? "checking" : status;
  const content = {
    checking: {
      description: t("collector.lookingActivity"),
      title: t("collector.checkingConnection"),
    },
    connected: {
      description: t("collector.openingProject"),
      title: t("collector.connected"),
    },
    retrying: {
      description: t("collector.willContinue"),
      title: t("collector.apiUnavailable"),
    },
    waiting: {
      description: t("collector.waitingDescription"),
      title: t("collector.waitingEvent"),
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
          aria-label={isChecking ? t("collector.checkingConnection") : t("collector.checkNow")}
          className="first-event-refresh"
          disabled={isChecking}
          onClick={onCheckNow}
          title={isChecking ? t("collector.checkingConnection") : t("collector.checkNow")}
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
