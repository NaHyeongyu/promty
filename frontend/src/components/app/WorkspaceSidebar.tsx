import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  Folder,
  Gauge,
  House,
  Inbox,
  LogOut,
  Menu,
  Radio,
  Settings,
  X,
} from "lucide-react";
import type { AuthUser, Project, SidebarItemId } from "../../workspace/types";
import { BrandLockup } from "./Branding";

export type CollectorSidebarStatus = {
  detail: string;
  tone: "attention" | "connected" | "muted";
};

export function WorkspaceSidebar({
  activeItem,
  canUseAdmin,
  collectorStatus,
  currentUser,
  onLogout,
  onOpenProject,
  onSelectItem,
  pendingReviewCount,
  savedProjectCount,
  savedProjects,
  selectedProjectId,
}: {
  activeItem: SidebarItemId;
  canUseAdmin: boolean;
  collectorStatus: CollectorSidebarStatus;
  currentUser: AuthUser | null;
  onLogout: () => void;
  onOpenProject: (projectId: string) => void;
  onSelectItem: (item: SidebarItemId) => void;
  pendingReviewCount: number;
  savedProjectCount: number;
  savedProjects: Project[];
  selectedProjectId: string | null;
}) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const sidebarUserName = currentUser?.username ?? "Account";
  const sidebarUserInitial = sidebarUserName.trim().charAt(0).toUpperCase() || "P";

  useEffect(() => {
    const closeAccountMenu = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    const closeMenusOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isAccountMenuOpen) {
          setIsAccountMenuOpen(false);
          accountButtonRef.current?.focus();
        } else if (isMobileMenuOpen) {
          setIsMobileMenuOpen(false);
          mobileToggleRef.current?.focus();
        }
      }
    };

    document.addEventListener("mousedown", closeAccountMenu);
    document.addEventListener("keydown", closeMenusOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeAccountMenu);
      document.removeEventListener("keydown", closeMenusOnEscape);
    };
  }, [isAccountMenuOpen, isMobileMenuOpen]);

  const selectItem = (item: SidebarItemId) => {
    setIsAccountMenuOpen(false);
    setIsMobileMenuOpen(false);
    onSelectItem(item);
  };
  const openProject = (projectId: string) => {
    setIsMobileMenuOpen(false);
    onOpenProject(projectId);
  };

  return (
    <aside
      className="sidebar"
      aria-label="Primary navigation"
      data-mobile-open={isMobileMenuOpen || undefined}
    >
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <BrandLockup />
        </div>
        <button
          aria-expanded={isMobileMenuOpen}
          aria-controls="workspace-sidebar-content"
          aria-label={isMobileMenuOpen ? "Close navigation" : "Open navigation"}
          className="sidebar-mobile-toggle"
          onClick={() => setIsMobileMenuOpen((current) => !current)}
          ref={mobileToggleRef}
          type="button"
        >
          {isMobileMenuOpen ? (
            <X aria-hidden="true" size={20} strokeWidth={1.5} />
          ) : (
            <Menu aria-hidden="true" size={20} strokeWidth={1.5} />
          )}
        </button>
      </div>

      <div className="sidebar-content" id="workspace-sidebar-content">
        <div className="sidebar-divider" />

        <nav className="sidebar-nav" aria-label="Workspace">
          <SidebarNavItem
            active={activeItem === "home"}
            icon={House}
            label="Home"
            onClick={() => selectItem("home")}
          />
          <SidebarNavItem
            active={activeItem === "projects"}
            icon={Folder}
            label="Projects"
            onClick={() => selectItem("projects")}
          />
          <SidebarNavItem
            active={activeItem === "reviews"}
            badge={pendingReviewCount > 0 ? pendingReviewCount : undefined}
            icon={Inbox}
            label="Reviews"
            onClick={() => selectItem("reviews")}
          />

          <section className="sidebar-saved-section" aria-label="Pinned projects">
            <div className="sidebar-saved-header">
              <span>Pinned</span>
              <small>{savedProjectCount}</small>
            </div>
            {savedProjects.length > 0 ? (
              <div className="sidebar-saved-list">
                {savedProjects.map((project) => (
                  <button
                    className="sidebar-saved-project"
                    data-active={project.id === selectedProjectId ? "true" : undefined}
                    key={project.id}
                    onClick={() => openProject(project.id)}
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
              <p className="sidebar-saved-empty">Pin projects for quick access.</p>
            )}
          </section>

          {canUseAdmin ? (
            <SidebarNavItem
              active={activeItem === "admin"}
              icon={Gauge}
              label="Admin"
              onClick={() => selectItem("admin")}
            />
          ) : null}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-divider" />

        <div className="sidebar-footer">
          <button
            className="sidebar-collector-status"
            data-tone={collectorStatus.tone}
            onClick={() => selectItem("settings")}
            type="button"
          >
            <Radio aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>
              <strong>Collector</strong>
              <small>{collectorStatus.detail}</small>
            </span>
          </button>

          <div className="sidebar-account" ref={accountMenuRef}>
            <button
              aria-expanded={isAccountMenuOpen}
              aria-controls="sidebar-account-actions"
              className="sidebar-item sidebar-profile-card"
              data-active={activeItem === "settings" || activeItem === "profile"}
              onClick={() => setIsAccountMenuOpen((current) => !current)}
              ref={accountButtonRef}
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
                <span>{currentUser?.email ?? "Account settings"}</span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className="sidebar-account-chevron"
                size={15}
                strokeWidth={1.5}
              />
            </button>

            {isAccountMenuOpen ? (
              <div className="sidebar-account-menu" id="sidebar-account-actions">
                <button onClick={() => selectItem("settings")} type="button">
                  <Settings aria-hidden="true" size={16} strokeWidth={1.5} />
                  <span>Settings</span>
                </button>
                <button
                  className="is-danger"
                  onClick={() => {
                    setIsAccountMenuOpen(false);
                    void onLogout();
                  }}
                  type="button"
                >
                  <LogOut aria-hidden="true" size={16} strokeWidth={1.5} />
                  <span>Log out</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarNavItem({
  active,
  badge,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  badge?: number;
  icon: typeof House;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className="sidebar-item"
      data-active={active}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="sidebar-icon" size={18} strokeWidth={1.5} />
      <span>{label}</span>
      {badge ? <span className="sidebar-item-badge">{badge}</span> : null}
    </button>
  );
}
