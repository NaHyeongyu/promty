import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { API_URL } from "../../config";

export function setupCommandText() {
  return `npx @prompthub/cli init --app-url ${window.location.origin} --api-url ${API_URL}`;
}

export function SetupCommandBlock({
  command,
  label,
}: {
  command: string;
  label?: string;
}) {
  const [hasCopied, setHasCopied] = useState(false);
  const copyCommand = async () => {
    await navigator.clipboard.writeText(command);
    setHasCopied(true);
    window.setTimeout(() => setHasCopied(false), 1400);
  };

  return (
    <div className="setup-command-block">
      {label ? <span>{label}</span> : null}
      <div className="setup-command-surface">
        <pre><code>{command}</code></pre>
        <button
          aria-label={hasCopied ? "Copied" : "Copy command"}
          className="setup-command-copy"
          onClick={copyCommand}
          title={hasCopied ? "Copied" : "Copy command"}
          type="button"
        >
          {hasCopied ? (
            <Check aria-hidden="true" size={16} strokeWidth={1.5} />
          ) : (
            <Copy aria-hidden="true" size={16} strokeWidth={1.5} />
          )}
        </button>
      </div>
    </div>
  );
}
