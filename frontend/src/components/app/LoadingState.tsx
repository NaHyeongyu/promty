import type { HTMLAttributes, ReactNode } from "react";
import "./loading-state.css";

/** A small shimmer for actions whose existing content must remain visible. */
export function LoadingIndicator({ size = 18, className = "", ...props }: HTMLAttributes<HTMLSpanElement> & { size?: number }) {
  return <span {...props} aria-hidden="true" className={`promty-loading-indicator ${className}`} style={{ width: size, height: size, ...props.style }}><span /></span>;
}

/** Data placeholders are decorative; announce the loading state once. */
export function ContentSkeleton({ label, variant = "list", rows = 3 }: { label: string; variant?: "list" | "detail" | "cards"; rows?: number }) {
  return <div className="promty-content-skeleton" data-variant={variant} role="status" aria-label={label}>
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => <div className="promty-skeleton-item" key={index}>
        <span className="promty-skeleton-block" />
        <span className="promty-skeleton-block" />
        <span className="promty-skeleton-block" />
      </div>)}
    </div>
  </div>;
}

export function LoadingStatus({ children }: { children: ReactNode }) {
  return <span className="promty-loading-status" role="status"><LoadingIndicator />{children}</span>;
}
