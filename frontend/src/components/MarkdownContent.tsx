import { useMemo, type ReactNode } from "react";
import { API_URL } from "../config";

type MarkdownContentProps = {
  className?: string;
  emptyLabel?: string;
  value: string;
};

function safeImageSrc(value: string) {
  try {
    const parsed = new URL(value, window.location.origin);
    const apiOrigin = new URL(API_URL || window.location.origin, window.location.origin)
      .origin;
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (parsed.origin === window.location.origin || parsed.origin === apiOrigin)
    ) {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
}

function renderInlineMarkdown(text: string) {
  const segments = text.split(/(!\[[^\]]*]\([^)]+\)|`[^`]+`)/g);
  return segments.map((segment, index) => {
    if (segment.startsWith("`") && segment.endsWith("`") && segment.length > 1) {
      return <code key={`${segment}-${index}`}>{segment.slice(1, -1)}</code>;
    }
    const image = segment.match(/^!\[([^\]]*)]\(([^)]+)\)$/);
    if (image) {
      const src = safeImageSrc(image[2].trim());
      if (!src) {
        return <span key={`${segment}-${index}`}>{image[1] || "Image"}</span>;
      }
      return (
        <img
          alt={image[1].trim()}
          className="markdown-image"
          key={`${segment}-${index}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          src={src}
        />
      );
    }
    return <span key={`${segment}-${index}`}>{segment}</span>;
  });
}

export function MarkdownContent({
  className = "bh-markdown-preview",
  emptyLabel = "Nothing to preview.",
  value,
}: MarkdownContentProps) {
  const nodes = useMemo<ReactNode[]>(() => {
    const lines = value.trim() ? value.split(/\r?\n/) : [];
    const rendered: ReactNode[] = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];

      if (!line.trim()) {
        index += 1;
        continue;
      }

      if (/^```(\w+)?\s*$/.test(line)) {
        const codeLines: string[] = [];
        index += 1;
        while (index < lines.length && !lines[index].startsWith("```")) {
          codeLines.push(lines[index]);
          index += 1;
        }
        index += index < lines.length ? 1 : 0;
        rendered.push(
          <pre key={`code-${index}`}>
            <code>{codeLines.join("\n")}</code>
          </pre>,
        );
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        const content = renderInlineMarkdown(heading[2]);
        if (level === 1) {
          rendered.push(<h2 key={`heading-${index}`}>{content}</h2>);
        } else if (level === 2) {
          rendered.push(<h3 key={`heading-${index}`}>{content}</h3>);
        } else {
          rendered.push(<h4 key={`heading-${index}`}>{content}</h4>);
        }
        index += 1;
        continue;
      }

      if (/^>\s+/.test(line)) {
        const quoteLines: string[] = [];
        while (index < lines.length && /^>\s+/.test(lines[index])) {
          quoteLines.push(lines[index].replace(/^>\s+/, ""));
          index += 1;
        }
        rendered.push(
          <blockquote key={`quote-${index}`}>
            <p>{renderInlineMarkdown(quoteLines.join(" "))}</p>
          </blockquote>,
        );
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        const items: string[] = [];
        while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^[-*]\s+/, ""));
          index += 1;
        }
        rendered.push(
          <ul key={`list-${index}`}>
            {items.map((item, itemIndex) => (
              <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
            ))}
          </ul>,
        );
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        const items: string[] = [];
        while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\d+\.\s+/, ""));
          index += 1;
        }
        rendered.push(
          <ol key={`ordered-list-${index}`}>
            {items.map((item, itemIndex) => (
              <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
            ))}
          </ol>,
        );
        continue;
      }

      const paragraphLines = [line];
      index += 1;
      while (
        index < lines.length &&
        lines[index].trim() &&
        !/^```/.test(lines[index]) &&
        !/^(#{1,3})\s+/.test(lines[index]) &&
        !/^>\s+/.test(lines[index]) &&
        !/^[-*]\s+/.test(lines[index]) &&
        !/^\d+\.\s+/.test(lines[index])
      ) {
        paragraphLines.push(lines[index]);
        index += 1;
      }
      rendered.push(
        <p key={`paragraph-${index}`}>
          {renderInlineMarkdown(paragraphLines.join(" "))}
        </p>,
      );
    }

    return rendered;
  }, [value]);

  if (nodes.length === 0) {
    return <div className={`${className} is-empty`}>{emptyLabel}</div>;
  }

  return <div className={className}>{nodes}</div>;
}
