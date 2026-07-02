import { siClaude, siCursor, siGooglegemini, type SimpleIcon } from "simple-icons";
import { SiOpenai } from "react-icons/si";
import "./AiModelBadge.css";

type AiModelBadgeInfo = {
  aiName: string;
  brand: "claude" | "cursor" | "gemini" | "openai";
  icon?: SimpleIcon;
  modelName: string;
};

function modelSuffix(modelName: string, aiName: string) {
  return modelName
    .replace(new RegExp(`^${aiName}\\b`, "i"), "")
    .replace(/^[-\s:/]+/, "")
    .trim();
}

function aiModelBadgeInfo(modelName: string): AiModelBadgeInfo {
  const normalizedModelName = modelName.trim();
  const modelKey = normalizedModelName.toLowerCase();

  if (modelKey.includes("claude")) {
    return {
      aiName: "Claude",
      brand: "claude",
      icon: siClaude,
      modelName: modelSuffix(normalizedModelName, "Claude") || "Code",
    };
  }

  if (modelKey.includes("cursor")) {
    return {
      aiName: "Cursor",
      brand: "cursor",
      icon: siCursor,
      modelName: modelSuffix(normalizedModelName, "Cursor") || "AI",
    };
  }

  if (modelKey.includes("gemini")) {
    return {
      aiName: "Gemini",
      brand: "gemini",
      icon: siGooglegemini,
      modelName: modelSuffix(normalizedModelName, "Gemini") || "CLI",
    };
  }

  return {
    aiName: modelKey.includes("codex") ? "Codex" : "OpenAI",
    brand: "openai",
    modelName:
      normalizedModelName
        .replace(/^openai[-\s:/]*/i, "")
        .replace(/^codex[-\s:/]*/i, "")
        .trim() ||
      normalizedModelName ||
      "Model",
  };
}

export function AiModelBadge({
  className = "",
  model,
}: {
  className?: string;
  model: string;
}) {
  const badge = aiModelBadgeInfo(model);
  const classNames = ["ai-model-badge", className].filter(Boolean).join(" ");

  return (
    <span className={classNames} data-brand={badge.brand}>
      {badge.icon ? (
        <svg
          aria-hidden="true"
          className="ai-model-badge-icon"
          role="img"
          viewBox="0 0 24 24"
        >
          <path d={badge.icon.path} />
        </svg>
      ) : (
        <SiOpenai aria-hidden="true" className="ai-model-badge-icon" />
      )}
      <span className="ai-model-badge-copy">
        <strong>{badge.aiName}</strong>
        <span>{badge.modelName}</span>
      </span>
    </span>
  );
}
