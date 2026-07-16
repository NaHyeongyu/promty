import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  BookOpen,
  ChevronDown,
  Compass,
  Folder,
  Gauge,
  Inbox,
  LogOut,
  Menu,
  Radio,
  Share2,
  Settings,
  X,
} from "lucide-react";
import type { AuthUser, Project, SidebarItemId } from "../../workspace/types";
import { useI18n } from "../../i18n/I18nProvider";
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
  isReviewQueueOpen,
  onLogout,
  onOpenProject,
  onOpenReviewQueue,
  onSelectItem,
  pendingReviewProjectCount,
  publishedFlowsEnabled,
  savedProjectCount,
  savedProjects,
  selectedProjectId,
}: {
  activeItem: SidebarItemId;
  canUseAdmin: boolean;
  collectorStatus: CollectorSidebarStatus;
  currentUser: AuthUser | null;
  isReviewQueueOpen: boolean;
  onLogout: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenReviewQueue: (returnFocusElement: HTMLElement | null) => void;
  onSelectItem: (item: SidebarItemId) => void;
  pendingReviewProjectCount: number;
  publishedFlowsEnabled: boolean;
  savedProjectCount: number;
  savedProjects: Project[];
  selectedProjectId: string | null;
}) {
  const { t } = useI18n();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const reviewQueueButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarUserName = currentUser?.username ?? t("settings.account");
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
  const openReviewQueue = () => {
    const returnFocusElement = isMobileMenuOpen
      ? mobileToggleRef.current
      : reviewQueueButtonRef.current;
    setIsAccountMenuOpen(false);
    setIsMobileMenuOpen(false);
    onOpenReviewQueue(returnFocusElement);
  };

  return (
    <aside
      className="sidebar"
      aria-label={t("nav.primary")}
      data-mobile-open={isMobileMenuOpen || undefined}
    >
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <BrandLockup />
        </div>
        <button
          aria-expanded={isMobileMenuOpen}
          aria-controls="workspace-sidebar-content"
          aria-label={
            isMobileMenuOpen ? t("nav.closeNavigation") : t("nav.openNavigation")
          }
          className="sidebar-mobile-toggle"
          data-review-queue-fallback-focus="true"
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

        <nav className="sidebar-nav" aria-label={t("nav.workspace")}>
          <SidebarNavItem
            active={activeItem === "projects"}
            icon={Folder}
            label={t("nav.projects")}
            onClick={() => selectItem("projects")}
          />
          <SidebarNavItem
            active={activeItem === "explore"}
            icon={Compass}
            label={t("nav.explore")}
            onClick={() => selectItem("explore")}
          />
          {publishedFlowsEnabled ? (
            <SidebarNavItem
              active={activeItem === "community"}
              icon={Share2}
              label={t("nav.community")}
              onClick={() => selectItem("community")}
            />
          ) : null}
          <SidebarNavItem
            active={isReviewQueueOpen}
            action
            ariaControls="review-queue"
            ariaExpanded={isReviewQueueOpen}
            ariaHasPopup="dialog"
            ariaLabel={
              pendingReviewProjectCount > 0
                ? `${t("nav.reviewQueue")}, ${pendingReviewProjectCount}`
                : t("nav.reviewQueue")
            }
            badge={
              pendingReviewProjectCount > 0
                ? pendingReviewProjectCount
                : undefined
            }
            icon={Inbox}
            label={t("nav.reviewQueue")}
            onClick={openReviewQueue}
            ref={reviewQueueButtonRef}
            reviewQueueFallbackFocus
          />

          <section className="sidebar-saved-section" aria-label={t("nav.pinned")}>
            <div className="sidebar-saved-header">
              <span>{t("nav.pinned")}</span>
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
              <p className="sidebar-saved-empty">{t("nav.pinnedEmpty")}</p>
            )}
          </section>

          {canUseAdmin ? (
            <SidebarNavItem
              active={activeItem === "admin"}
              icon={Gauge}
              label={t("nav.admin")}
              onClick={() => selectItem("admin")}
            />
          ) : null}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <button
            className="sidebar-collector-status"
            data-tone={collectorStatus.tone}
            onClick={() => selectItem("settings")}
            type="button"
          >
            <Radio aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>
              <strong>{t("nav.collector")}</strong>
              <small>{collectorStatus.detail}</small>
            </span>
          </button>

          <a
            className="sidebar-docs-link"
            href="/docs/collector"
            rel="noreferrer"
            target="_blank"
          >
            <BookOpen aria-hidden="true" size={16} strokeWidth={1.5} />
            <span>
              <strong>{t("nav.setupGuide")}</strong>
              <small>Codex & Claude Code</small>
            </span>
          </a>

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
                <span>{currentUser?.email ?? t("nav.accountSettings")}</span>
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
                  <span>{t("common.settings")}</span>
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
                  <span>{t("nav.logout")}</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

const SidebarNavItem = function SidebarNavItem({
  active,
  action = false,
  ariaControls,
  ariaExpanded,
  ariaHasPopup,
  ariaLabel,
  badge,
  icon: Icon,
  label,
  onClick,
  ref,
  reviewQueueFallbackFocus,
}: {
  active: boolean;
  action?: boolean;
  ariaControls?: string;
  ariaExpanded?: boolean;
  ariaHasPopup?: "dialog";
  ariaLabel?: string;
  badge?: number;
  icon: typeof Folder;
  label: string;
  onClick: () => void;
  ref?: React.Ref<HTMLButtonElement>;
  reviewQueueFallbackFocus?: boolean;
}) {
  return (
    <button
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      aria-label={ariaLabel}
      aria-pressed={ariaHasPopup ? undefined : active}
      className={action ? "sidebar-item sidebar-item-action" : "sidebar-item"}
      data-active={active}
      data-review-queue-fallback-focus={reviewQueueFallbackFocus || undefined}
      onClick={onClick}
      ref={ref}
      type="button"
    >
      <Icon aria-hidden="true" className="sidebar-icon" size={18} strokeWidth={1.5} />
      <span>{label}</span>
      {badge ? (
        <span aria-hidden="true" className="sidebar-item-badge">
          {badge}
        </span>
      ) : null}
    </button>
  );
};
