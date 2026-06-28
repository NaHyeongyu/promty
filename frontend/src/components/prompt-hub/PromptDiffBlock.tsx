type PromptDiffBlockProps = {
  diff: string | null;
  filePath?: string;
};

function diffLineKind(line: string) {
  if (line.startsWith("@@")) {
    return "hunk";
  }
  if (line.startsWith("+++") || line.startsWith("---")) {
    return "meta";
  }
  if (line.startsWith("+")) {
    return "addition";
  }
  if (line.startsWith("-")) {
    return "deletion";
  }
  return "context";
}

export function PromptDiffBlock({ diff, filePath }: PromptDiffBlockProps) {
  if (!diff) {
    return (
      <div className="bh-prompt-missing-diff">
        Missing diff data{filePath ? ` for ${filePath}` : ""}.
      </div>
    );
  }

  return (
    <div className="bh-prompt-diff" aria-label={filePath ?? "Diff snippet"}>
      {diff.split("\n").map((line, index) => (
        <code
          className="bh-prompt-diff-line"
          data-kind={diffLineKind(line)}
          key={`${index}-${line}`}
        >
          <span>{line.slice(0, 1) || " "}</span>
          <span>{line.slice(1) || " "}</span>
        </code>
      ))}
    </div>
  );
}
