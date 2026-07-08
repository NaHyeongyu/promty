import type { ProjectDetailTabId } from "./types";

export function ProjectDetailLoadingSkeleton({
  activeTab,
}: {
  activeTab: ProjectDetailTabId;
}) {
  if (activeTab === "ai-activity") {
    return (
      <section
        aria-label="Loading activity"
        aria-live="polite"
        className="bh-detail-skeleton bh-detail-skeleton-activity bh-activity-layout"
        data-view="prompts"
        role="status"
      >
        <div className="bh-activity-view-tabs bh-activity-view-tabs-skeleton">
          {Array.from({ length: 2 }).map((_, index) => (
            <span className="skeleton-pill skeleton-pill-action" key={index} />
          ))}
        </div>

        <div className="bh-prompt-activity-layout">
          <div className="bh-prompt-sidebar">
            <div className="bh-prompt-search bh-prompt-search-skeleton">
              <span className="skeleton-icon" />
              <span className="skeleton-line skeleton-line-md" />
            </div>
            <div className="bh-work-type-filter bh-work-type-filter-skeleton">
              {Array.from({ length: 3 }).map((_, index) => (
                <span className="skeleton-pill" key={index} />
              ))}
            </div>

            <div className="bh-prompt-list">
              {Array.from({ length: 7 }).map((_, index) => (
                <article className="bh-prompt-row bh-prompt-row-skeleton" key={index}>
                  <div className="bh-prompt-row-main">
                    <div className="bh-prompt-row-header">
                      <span className="skeleton-line skeleton-line-sm" />
                      <span className="skeleton-line skeleton-line-sm" />
                    </div>
                    <div className="bh-prompt-row-meta">
                      <span className="skeleton-pill" />
                      <span className="skeleton-pill" />
                    </div>
                    <div className="bh-prompt-text">
                      <span className="skeleton-line skeleton-line-md" />
                      <span className="skeleton-line skeleton-line-description" />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="bh-prompt-change-detail bh-prompt-change-detail-skeleton">
            <div className="bh-prompt-change-header">
              <div>
                <span className="skeleton-line skeleton-line-title" />
                <span className="skeleton-line skeleton-line-md" />
              </div>
              <span className="skeleton-pill skeleton-pill-action" />
            </div>
            <div className="bh-prompt-change-summary">
              <span className="skeleton-line skeleton-line-section" />
              <span className="skeleton-line skeleton-line-description" />
              <span className="skeleton-line skeleton-line-md" />
            </div>
            <div className="bh-prompt-change-list">
              {Array.from({ length: 4 }).map((_, index) => (
                <span className="skeleton-line skeleton-code-line" key={index} />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (activeTab === "files") {
    return (
      <section
        aria-label="Loading repository files"
        aria-live="polite"
        className="bh-detail-skeleton bh-detail-skeleton-files"
        role="status"
      >
        <div className="bh-files-layout">
          {Array.from({ length: 2 }).map((_, sectionIndex) => (
            <section className="bh-files-section" key={sectionIndex}>
              <div className="bh-files-section-header">
                <span className="skeleton-line skeleton-line-section" />
                <span className="skeleton-line skeleton-line-description" />
              </div>
              <div
                className={
                  sectionIndex === 0
                    ? "bh-detail-skeleton-tree"
                    : "bh-detail-skeleton-code"
                }
              >
                {Array.from({ length: sectionIndex === 0 ? 10 : 14 }).map((_, index) => (
                  <span
                    className={
                      sectionIndex === 0
                        ? index % 3 === 0
                          ? "skeleton-line skeleton-line-md"
                          : "skeleton-line skeleton-line-sm"
                        : "skeleton-line skeleton-code-line"
                    }
                    key={index}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Loading project overview"
      aria-live="polite"
      className="bh-detail-skeleton bh-detail-skeleton-overview bh-overview-dashboard"
      role="status"
    >
      <section className="bh-overview-statistics" aria-label="Loading statistics">
        <dl>
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              className="bh-overview-stat-card bh-overview-stat-card-skeleton"
              key={index}
            >
              <div className="bh-overview-stat-copy">
                <dt>
                  <span className="skeleton-line skeleton-line-sm" />
                </dt>
                <dd>
                  <span className="skeleton-line skeleton-line-title" />
                </dd>
                <span className="skeleton-line skeleton-line-sm" />
              </div>
              <span className="bh-overview-stat-sparkline bh-overview-stat-sparkline-skeleton" />
            </div>
          ))}
        </dl>
      </section>

      <div className="bh-overview-detail-grid">
        <section
          className="bh-overview-card bh-overview-card-repository bh-overview-card-skeleton"
        >
          <div className="bh-overview-card-header">
            <span className="skeleton-line skeleton-line-section" />
            <span className="skeleton-pill skeleton-pill-action" />
          </div>
          <div className="bh-project-context-layout">
            <div className="bh-project-context-links">
              {Array.from({ length: 2 }).map((_, index) => (
                <div className="bh-project-context-link-field" key={index}>
                  <span className="skeleton-line skeleton-line-sm" />
                  <span className="skeleton-line skeleton-line-description" />
                </div>
              ))}
            </div>
            <div className="bh-overview-card-divider" />
            <div className="bh-project-context-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <section className="bh-project-context-section" key={index}>
                  <span className="skeleton-line skeleton-line-sm" />
                  <span className="skeleton-line skeleton-line-md" />
                </section>
              ))}
            </div>
          </div>
        </section>

        <section
          className="bh-overview-card bh-overview-card-description bh-overview-card-skeleton"
        >
          <div className="bh-overview-card-header">
            <span className="skeleton-line skeleton-line-section" />
            <span className="skeleton-pill skeleton-pill-action" />
          </div>
          <div className="bh-overview-description-skeleton">
            {Array.from({ length: 5 }).map((_, index) => (
              <span className="skeleton-line skeleton-line-md" key={index} />
            ))}
          </div>
        </section>
      </div>
      {/* Community overview skeleton is paused for now.
      <div className="bh-detail-skeleton-community">
        <span className="skeleton-line skeleton-line-section" />
        <span className="skeleton-line skeleton-line-description" />
      </div>
      */}
    </section>
  );
}
