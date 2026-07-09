import {
  Bookmark,
  Folder,
  Gauge,
  LogOut,
  Settings,
} from "lucide-react";
import type { AuthUser, Project, SidebarItemId } from "../../workspace/types";
import { BrandLockup } from "./Branding";

export function WorkspaceSidebar({
  activeItem,
  canUseAdmin,
  currentUser,
  onLogout,
  onOpenProject,
  onSelectItem,
  savedProjectCount,
  savedProjects,
  selectedProjectId,
}: {
  activeItem: SidebarItemId;
  canUseAdmin: boolean;
  currentUser: AuthUser | null;
  onLogout: () => void;
  onOpenProject: (projectId: string) => void;
  onSelectItem: (item: SidebarItemId) => void;
  savedProjectCount: number;
  savedProjects: Project[];
  selectedProjectId: string | null;
}) {
  const sidebarUserName = currentUser?.username ?? "Profile";
  const sidebarUserInitial =
    sidebarUserName.trim().charAt(0).toUpperCase() || "P";

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <BrandLockup />
        </div>
      </div>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav" aria-label="Workspace">
        <button
          aria-pressed={activeItem === "projects"}
          className="sidebar-item"
          data-active={activeItem === "projects"}
          onClick={() => onSelectItem("projects")}
          type="button"
        >
          <Folder
            aria-hidden="true"
            className="sidebar-icon"
            size={18}
            strokeWidth={1.5}
          />
          Projects
        </button>
        <section className="sidebar-saved-section" aria-label="Saved projects">
          <div className="sidebar-saved-header">
            <span>Saved</span>
            <small>{savedProjectCount}</small>
          </div>
          {savedProjects.length > 0 ? (
            <div className="sidebar-saved-list">
              {savedProjects.map((project) => (
                <button
                  className="sidebar-saved-project"
                  data-active={project.id === selectedProjectId ? "true" : undefined}
                  key={project.id}
                  onClick={() => onOpenProject(project.id)}
                  title={project.name}
                  type="button"
                >
                  <Bookmark
                    aria-hidden="true"
                    fill="currentColor"
                    size={14}
                    strokeWidth={1.5}
                  />
                  <span>
                    <strong>{project.name}</strong>
                    <small>{project.latestActivityLabel}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="sidebar-saved-empty">No saved projects</p>
          )}
        </section>
        {canUseAdmin ? (
          <button
            aria-pressed={activeItem === "admin"}
            className="sidebar-item"
            data-active={activeItem === "admin"}
            onClick={() => onSelectItem("admin")}
            type="button"
          >
            <Gauge
              aria-hidden="true"
              className="sidebar-icon"
              size={18}
              strokeWidth={1.5}
            />
            Admin
          </button>
        ) : null}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-divider" />

      <div className="sidebar-footer">
        <button
          aria-pressed={activeItem === "profile"}
          className="sidebar-item profile-item sidebar-profile-card"
          data-active={activeItem === "profile"}
          onClick={() => onSelectItem("profile")}
          type="button"
        >
          <span className="sidebar-avatar" aria-hidden="true">
            {currentUser?.avatar_url ? (
              <img alt="" src={currentUser.avatar_url} />
            ) : (
              sidebarUserInitial
            )}
          </span>
          <span className="sidebar-profile-copy">
            <span>{sidebarUserName}</span>
            <span>Profile</span>
          </span>
        </button>

        <button
          aria-pressed={activeItem === "settings"}
          className="sidebar-item"
          data-active={activeItem === "settings"}
          onClick={() => onSelectItem("settings")}
          type="button"
        >
          <Settings
            aria-hidden="true"
            className="sidebar-icon"
            size={18}
            strokeWidth={1.5}
          />
          <span>Settings</span>
        </button>

        <button
          className="sidebar-item sidebar-item-danger"
          onClick={onLogout}
          type="button"
        >
          <LogOut
            aria-hidden="true"
            className="sidebar-icon"
            size={18}
            strokeWidth={1.5}
          />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
