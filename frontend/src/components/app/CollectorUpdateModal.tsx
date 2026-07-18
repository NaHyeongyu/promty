import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { SetupCommandBlock, type CollectorInstallTarget } from "./SetupCommandBlock";

export type CollectorUpdateEnvironment = "dev" | "prod" | "both";

const ENVIRONMENT_OPTIONS = [
  { labelKey: "collector.environment.prod" as const, value: "prod" as const },
  { labelKey: "collector.environment.dev" as const, value: "dev" as const },
  { labelKey: "collector.environment.both" as const, value: "both" as const },
];
const INTEGRATION_OPTIONS = [
  { labelKey: "collector.integration.codex-cli" as const, value: "codex-cli" as const },
  { labelKey: "collector.integration.claude-code" as const, value: "claude-code" as const },
  { labelKey: "collector.integration.all" as const, value: "all" as const },
];

export function collectorUpdateCommand(
  environment: CollectorUpdateEnvironment,
  tool: CollectorInstallTarget,
) {
  const profileFlag =
    environment === "both"
      ? "--profiles dev,prod"
      : `--profile ${environment}`;
  return `npx promty-collector@latest init --tool ${tool} ${profileFlag}`;
}

export function CollectorUpdateModal({
  currentVersion,
  defaultEnvironment,
  isComplete,
  isOpen,
  isVerifying,
  latestVersion,
  onBeginVerification,
  onClose,
}: {
  currentVersion: string | null;
  defaultEnvironment: CollectorUpdateEnvironment;
  isComplete: boolean;
  isOpen: boolean;
  isVerifying: boolean;
  latestVersion: string;
  onBeginVerification: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [environment, setEnvironment] =
    useState<CollectorUpdateEnvironment>(defaultEnvironment);
  const [tool, setTool] = useState<CollectorInstallTarget>("codex-cli");
  const command = collectorUpdateCommand(environment, tool);

  useEffect(() => {
    if (!isOpen) return;
    setEnvironment(defaultEnvironment);
    setTool("codex-cli");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusId = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusId);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [defaultEnvironment, isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="collector-update-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="collector-update-title"
        aria-modal="true"
        className="collector-update-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <span>
            <small>{t("collector.updateEyebrow")}</small>
            <h2 id="collector-update-title">{t("collector.updateTitle")}</h2>
          </span>
          <button
            aria-label={t("collector.closeUpdate")}
            className="collector-update-close"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={18} strokeWidth={1.5} />
          </button>
        </header>

        <p className="collector-update-intro">
          {t("collector.updateDescription")}
        </p>

        <div className="collector-update-versions" aria-label={t("collector.versionComparison")}>
          <span><small>{t("collector.currentVersion")}</small><strong>{currentVersion ?? t("common.notAvailable")}</strong></span>
          <span aria-hidden="true">→</span>
          <span><small>{t("collector.latestVersion")}</small><strong>{latestVersion}</strong></span>
        </div>

        {isComplete ? (
          <div className="collector-update-result" data-status="complete" role="status">
            <CheckCircle2 aria-hidden="true" size={18} />
            <span><strong>{t("collector.updateComplete")}</strong><small>{t("collector.updateCompleteDescription", { version: latestVersion })}</small></span>
          </div>
        ) : null}

        <fieldset className="collector-update-options">
          <legend>{t("collector.updateEnvironment")}</legend>
          <div>
            {ENVIRONMENT_OPTIONS.map(({ labelKey, value }) => (
              <button
                aria-pressed={environment === value}
                data-selected={environment === value || undefined}
                key={value}
                onClick={() => setEnvironment(value)}
                type="button"
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="collector-update-options">
          <legend>{t("collector.updateIntegration")}</legend>
          <div>
            {INTEGRATION_OPTIONS.map(({ labelKey, value }) => (
              <button
                aria-pressed={tool === value}
                data-selected={tool === value || undefined}
                key={value}
                onClick={() => setTool(value)}
                type="button"
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </fieldset>

        <SetupCommandBlock
          command={command}
          helperText={t("collector.updateCommandHint")}
          label={t("collector.updateCommand")}
          onCopy={onBeginVerification}
        />

        {isVerifying && !isComplete ? (
          <div className="collector-update-result" role="status">
            <RefreshCw aria-hidden="true" className="is-spinning" size={17} />
            <span><strong>{t("collector.waitingForUpdate")}</strong><small>{t("collector.waitingForHeartbeat")}</small></span>
          </div>
        ) : null}

        <div className="collector-update-safety">
          <ShieldCheck aria-hidden="true" size={18} />
          <span>{t("collector.updateSafety")}</span>
        </div>

        <footer>
          <a href="/docs/collector" rel="noreferrer" target="_blank">
            {t("collector.openGuide")}
          </a>
          <button onClick={onClose} type="button">
            {isComplete ? t("common.close") : t("collector.later")}
          </button>
        </footer>
      </section>
    </div>
  );
}
