import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { API_URL } from "../../config";
import { useI18n } from "../../i18n/I18nProvider";

export type CollectorInstallTarget = "all" | "claude-code" | "codex-cli";

type SetupCommandContext = {
  apiUrl: string;
  hostname: string;
  origin: string;
};

export function setupCommandText(
  tool: CollectorInstallTarget = "codex-cli",
  context: SetupCommandContext = {
    apiUrl: API_URL,
    hostname: window.location.hostname,
    origin: window.location.origin,
  },
) {
  const profile = context.hostname === "promty.org" || context.hostname === "www.promty.org"
    ? "prod"
    : "dev";
  return `npx promty-collector init --tool ${tool} --profile ${profile} --app-url ${context.origin} --api-url ${context.apiUrl}`;
}

export function SetupCommandBlock({
  command,
  disabled = false,
  disabledReason,
  helperText,
  label,
  onCopy,
}: {
  command: string;
  disabled?: boolean;
  disabledReason?: string;
  helperText?: string;
  label?: string;
  onCopy?: () => void;
}) {
  const { t } = useI18n();
  const [copyStatus, setCopyStatus] = useState<"copied" | "error" | "idle">("idle");

  useEffect(() => {
    setCopyStatus("idle");
  }, [command, disabled]);

  const copyCommand = async () => {
    if (disabled) {
      return;
    }

    try {
      await navigator.clipboard.writeText(command);
      setCopyStatus("copied");
      onCopy?.();
      window.setTimeout(() => setCopyStatus("idle"), 1800);
    } catch {
      setCopyStatus("error");
    }
  };

  const hasCopied = copyStatus === "copied";
  const copyLabel = disabled
    ? disabledReason ?? t("collector.copyDisabled")
    : hasCopied
      ? t("common.copied")
      : t("collector.copyCommand");

  return (
    <div className="setup-command-block">
      {label ? <span>{label}</span> : null}
      <div className="setup-command-surface" data-disabled={disabled}>
        <pre><code>{command}</code></pre>
        <button
          aria-label={copyLabel}
          className="setup-command-copy"
          onClick={copyCommand}
          disabled={disabled}
          title={copyLabel}
          type="button"
        >
          {hasCopied ? (
            <Check aria-hidden="true" size={16} strokeWidth={1.5} />
          ) : (
            <Copy aria-hidden="true" size={16} strokeWidth={1.5} />
          )}
        </button>
      </div>
      <span
        aria-live="polite"
        className="setup-command-feedback"
        data-error={copyStatus === "error"}
      >
        {copyStatus === "copied"
          ? t("collector.commandCopied")
          : copyStatus === "error"
            ? t("collector.clipboardFailed")
            : disabledReason ?? helperText ?? ""}
      </span>
    </div>
  );
}
