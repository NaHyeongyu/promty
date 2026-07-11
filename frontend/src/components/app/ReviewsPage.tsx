import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import { formatRelativeTimestamp } from "../../lib/formatters";
import type { Project } from "../../workspace/types";

export function ReviewsPage({
  onOpenProjectMemory,
  projects,
}: {
  onOpenProjectMemory: (projectId: string) => void;
  projects: Project[];
}) {
  const pendingProjects = projects.filter((project) => project.pendingMemoryCount > 0);
  const pendingCount = pendingProjects.reduce(
    (total, project) => total + project.pendingMemoryCount,
    0,
  );

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Reviews</h1>
        </div>
        <div className="page-actions">
          <span className="status-pill">{pendingCount} pending</span>
        </div>
      </header>

      <section className="reviews-workspace" aria-labelledby="reviews-title">
        <div className="reviews-heading">
          <span>Memory review</span>
          <h2 id="reviews-title">Verify captured work before it becomes project memory</h2>
          <p>Review generated context with its source session and changed files.</p>
        </div>

        {pendingProjects.length > 0 ? (
          <div className="reviews-list">
            {pendingProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => onOpenProjectMemory(project.id)}
                type="button"
              >
                <CircleAlert aria-hidden="true" size={18} strokeWidth={1.5} />
                <span>
                  <strong>{project.name}</strong>
                  <small>
                    {project.pendingMemoryCount} {project.pendingMemoryCount === 1 ? "item" : "items"}
                    {project.latestMemoryAt
                      ? ` · memory updated ${
                          formatRelativeTimestamp(project.latestMemoryAt) ?? "recently"
                        }`
                      : ""}
                  </small>
                </span>
                <span>Open memory</span>
                <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} />
              </button>
            ))}
          </div>
        ) : (
          <div className="reviews-empty">
            <CheckCircle2 aria-hidden="true" size={22} strokeWidth={1.5} />
            <div>
              <strong>No memory waiting for review</strong>
              <span>New captured work will appear here when it needs your attention.</span>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
