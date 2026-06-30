import { Inbox } from "lucide-react";
import type { EmptyStateProps } from "./types";

export function EmptyState({
  children,
  description,
  icon: Icon = Inbox,
  title,
}: EmptyStateProps) {
  return (
    <section className="bh-empty-state" aria-label={title}>
      <Icon aria-hidden="true" size={20} strokeWidth={1.5} />
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children ? <div className="bh-empty-state-body">{children}</div> : null}
    </section>
  );
}
