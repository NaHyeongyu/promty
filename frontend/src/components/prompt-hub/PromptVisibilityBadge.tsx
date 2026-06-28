import type { PromptHubVisibility } from "../../api/promptHub";

type PromptVisibilityBadgeProps = {
  visibility: PromptHubVisibility;
};

export function PromptVisibilityBadge({ visibility }: PromptVisibilityBadgeProps) {
  return (
    <span className="bh-prompt-visibility" data-visibility={visibility}>
      {visibility}
    </span>
  );
}
