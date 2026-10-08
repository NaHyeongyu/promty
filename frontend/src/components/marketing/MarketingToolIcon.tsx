import { siClaude } from "simple-icons";
import { OPENAI_MARK_PATH } from "../project-detail/AiModelBadge";

export function MarketingToolIcon({
  tool,
  size = 20,
}: {
  tool: "codex" | "claude";
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className="lp-tool-icon"
      data-brand={tool === "codex" ? "openai" : "claude"}
      fill="currentColor"
      height={size}
      viewBox={tool === "codex" ? "0 0 41 41" : "0 0 24 24"}
      width={size}
    >
      <path d={tool === "codex" ? OPENAI_MARK_PATH : siClaude.path} />
    </svg>
  );
}
