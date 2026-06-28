type PromptTagListProps = {
  tags: string[];
};

export function PromptTagList({ tags }: PromptTagListProps) {
  if (tags.length === 0) {
    return <span className="bh-prompt-tags-empty">No tags</span>;
  }

  return (
    <div className="bh-prompt-tags" aria-label="Prompt tags">
      {tags.map((tag) => (
        <span className="bh-prompt-tag" key={tag}>
          {tag}
        </span>
      ))}
    </div>
  );
}
