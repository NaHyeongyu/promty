import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { API_URL } from "../../config";

export type CollectorTool = "claude-code" | "codex-cli";

export function setupCommandText(tool: CollectorTool = "codex-cli") {
  return `npx @prompthub/cli init --tool ${tool} --app-url ${window.location.origin} --api-url ${API_URL}`;
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
    ? disabledReason ?? "Complete the privacy confirmation before copying"
    : hasCopied
      ? "Copied"
      : "Copy command";

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
          ? "Command copied"
          : copyStatus === "error"
            ? "Clipboard access failed. Select the command to copy it."
            : disabledReason ?? helperText ?? ""}
      </span>
    </div>
  );
}
