import { FileText } from "lucide-react";
import type { KnowledgeItem } from "./types";

type KnowledgeCardProps = {
  item: KnowledgeItem;
};

export function KnowledgeCard({ item }: KnowledgeCardProps) {
  return (
    <article className="bh-knowledge-card">
      <FileText aria-hidden="true" size={18} strokeWidth={1.5} />
      <div>
        <strong>{item.title}</strong>
        <span>{item.fileType}</span>
      </div>
      <time>{item.updatedAt}</time>
    </article>
  );
}
