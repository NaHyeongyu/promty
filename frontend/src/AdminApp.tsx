import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileClock,
  FileJson,
  FolderKanban,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  cancelAdminJob,
  createAdminCollectorToken,
  createAdminProject,
  deleteAdminProject,
  deleteAdminUser,
  disconnectAdminGithub,
  exportAdminEvents,
  exportAdminProject,
  fetchAdminAuditLogs,
  fetchAdminEvents,
  fetchAdminJobs,
  fetchAdminOverview,
  fetchAdminProjects,
  fetchAdminSystem,
  fetchAdminUsers,
  restoreAdminUser,
  retryAdminJob,
  revokeAdminCollectorToken,
  revokeAllAdminCollectorTokens,
  suspendAdminUser,
  updateAdminProject,
} from "./api/admin";
import type { AdminProjectMutation } from "./api/admin";
import { fetchCurrentUser, logoutSession } from "./api/auth";
import { ForbiddenError, UnauthorizedError } from "./api/client";
import { AdminDashboard } from "./components/app/AdminDashboard";
import { AuthLoadingPage, WebLoginPage } from "./components/app/AuthScreens";
import { BrandLogo } from "./components/app/Branding";
import {
  formatCompactNumber,
  formatOptionalTimestamp,
  formatRelativeTimestamp,
} from "./lib/formatters";
import type {
  AdminAuditLog,
  AdminEventPage,
  AdminJob,
  AdminOverview,
  AdminPage,
  AdminProject,
  AdminSystem,
  AdminUser,
  AuthStatus,
  AuthUser,
} from "./workspace/types";
import "./styles-admin.css";

type AdminSection =
  | "overview"
  | "users"
  | "projects"
  | "operations"
  | "activity"
  | "system"
  | "security"
  | "audit";

type AdminData = {
  audit: AdminPage<AdminAuditLog>;
  events: AdminEventPage;
  jobs: AdminPage<AdminJob>;
  overview: AdminOverview;
  projects: AdminPage<AdminProject>;
  system: AdminSystem;
  users: AdminPage<AdminUser>;
};

type ConfirmationAction =
  | { kind: "disconnect-github"; user: AdminUser }
  | { kind: "revoke-all-tokens"; user: AdminUser }
  | { kind: "revoke-token"; tokenId: string; tokenName: string; user: AdminUser }
  | { kind: "issue-token"; user: AdminUser }
  | { kind: "suspend-user"; user: AdminUser }
  | { kind: "restore-user"; user: AdminUser }
  | { kind: "delete-user"; user: AdminUser }
  | { kind: "delete-project"; project: AdminProject }
  | { kind: "export-project"; project: AdminProject }
  | { job: AdminJob; kind: "cancel-job" }
  | { job: AdminJob; kind: "retry-job" }
  | { expected: string; kind: "export-events"; query: string };

type ProjectEditorState =
  | { mode: "create" }
  | { mode: "edit"; project: AdminProject };

type IssuedToken = { name: string; token: string; username: string };

const SECTION_META: Array<{
  description: string;
  icon: typeof LayoutDashboard;
  id: AdminSection;
  label: string;
}> = [
  { description: "System-wide operational picture", icon: LayoutDashboard, id: "overview", label: "Overview" },
  { description: "Identity and access control", icon: Users, id: "users", label: "Users" },
  { description: "Repository and activity inventory", icon: FolderKanban, id: "projects", label: "Projects" },
  { description: "Memory generation and pipelines", icon: Bot, id: "operations", label: "Operations" },
  { description: "Decrypted event intelligence", icon: Activity, id: "activity", label: "Event stream" },
  { description: "Runtime and database telemetry", icon: Server, id: "system", label: "System" },
  { description: "Risk posture and credentials", icon: ShieldAlert, id: "security", label: "Security" },
  { description: "Administrator activity trail", icon: FileClock, id: "audit", label: "Audit log" },
];

function sectionFromUrl(): AdminSection {
  const requested = new URLSearchParams(window.location.search).get("section");
  return SECTION_META.some((section) => section.id === requested)
    ? (requested as AdminSection)
    : "overview";
}

function projectHref(project: { id: string; slug?: string }) {
  const key = project.slug || project.id;
  return `/?${new URLSearchParams({ project: key, tab: "overview" }).toString()}`;
}

function statusTone(status: string, stale = false) {
  if (stale || status === "failed" || status === "suspended") return "danger";
  if (status === "running" || status === "pending") return "warning";
  if (status === "succeeded" || status === "active") return "success";
  return "neutral";
}

function actionExpected(action: ConfirmationAction) {
  if ("user" in action) return action.user.username;
  if ("project" in action) return action.project.slug;
  if ("job" in action) return action.job.project.slug;
  return action.expected;
}

function downloadJson(payload: Record<string, unknown>, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatBytes(value: number | null) {
  if (value === null) return "Unavailable";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function AdminApp() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [section, setSection] = useState<AdminSection>(sectionFromUrl);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState("all");
  const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction | null>(null);
  const [confirmationValue, setConfirmationValue] = useState("");
  const [actionDetail, setActionDetail] = useState("");
  const [projectEditor, setProjectEditor] = useState<ProjectEditorState | null>(null);
  const [issuedToken, setIssuedToken] = useState<IssuedToken | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadData = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [overview, users, projects, jobs, events, system, audit] = await Promise.all([
        fetchAdminOverview(signal),
        fetchAdminUsers(signal),
        fetchAdminProjects(signal),
        fetchAdminJobs(signal),
        fetchAdminEvents("", signal),
        fetchAdminSystem(signal),
        fetchAdminAuditLogs(signal),
      ]);
      setData({ audit, events, jobs, overview, projects, system, users });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof UnauthorizedError) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        setData(null);
        return;
      }
      if (error instanceof ForbiddenError) setAuthStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Admin control center request failed");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void fetchCurrentUser()
      .then((user) => {
        if (!active) return;
        setCurrentUser(user);
        setAuthStatus(user.is_admin ? "authenticated" : "error");
        if (!user.is_admin) setErrorMessage("This control center is restricted to the configured administrator.");
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof UnauthorizedError) setAuthStatus("unauthenticated");
        else {
          setAuthStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Session request failed");
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [authStatus]);

  useEffect(() => {
    const onPopState = () => setSection(sectionFromUrl());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key.toLowerCase() === "r" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void loadData();
      }
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated" || section !== "activity" || !data) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchAdminEvents(searchQuery, controller.signal)
        .then((events) => setData((current) => current ? { ...current, events } : current))
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setErrorMessage(error instanceof Error ? error.message : "Event search failed");
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [authStatus, section, searchQuery, data !== null]);

  const selectSection = (nextSection: AdminSection) => {
    setSection(nextSection);
    setSearchQuery("");
    setIsMobileNavOpen(false);
    const url = new URL(window.location.href);
    if (nextSection === "overview") url.searchParams.delete("section");
    else url.searchParams.set("section", nextSection);
    window.history.pushState(null, "", url);
  };

  const closeConfirmation = () => {
    setConfirmationAction(null);
    setConfirmationValue("");
    setActionDetail("");
  };

  const runConfirmedAction = async () => {
    if (!confirmationAction || confirmationValue !== actionExpected(confirmationAction)) return;
    setIsMutating(true);
    setErrorMessage(null);
    try {
      const action = confirmationAction;
      if (action.kind === "disconnect-github") {
        await disconnectAdminGithub(action.user.id, confirmationValue);
        setNotice(`GitHub access disconnected for ${action.user.username}.`);
      } else if (action.kind === "revoke-all-tokens") {
        const result = await revokeAllAdminCollectorTokens(action.user.id, confirmationValue);
        setNotice(`${result.revoked} collector token${result.revoked === 1 ? "" : "s"} revoked for ${action.user.username}.`);
      } else if (action.kind === "revoke-token") {
        await revokeAdminCollectorToken(action.user.id, action.tokenId, confirmationValue);
        setNotice(`${action.tokenName} revoked for ${action.user.username}.`);
      } else if (action.kind === "issue-token") {
        const name = actionDetail.trim() || "Admin-issued collector";
        const result = await createAdminCollectorToken(action.user.id, confirmationValue, name);
        setIssuedToken({ name, token: result.token, username: action.user.username });
        setNotice(`Collector token issued for ${action.user.username}.`);
      } else if (action.kind === "suspend-user") {
        await suspendAdminUser(action.user.id, confirmationValue, actionDetail.trim());
        setNotice(`${action.user.username} suspended and all access blocked.`);
      } else if (action.kind === "restore-user") {
        await restoreAdminUser(action.user.id, confirmationValue);
        setNotice(`${action.user.username} restored.`);
      } else if (action.kind === "delete-user") {
        await deleteAdminUser(action.user.id, confirmationValue);
        setNotice(`${action.user.username} and all owned data deleted.`);
        setExpandedUserId(null);
      } else if (action.kind === "delete-project") {
        await deleteAdminProject(action.project.id, confirmationValue);
        setNotice(`${action.project.name} and related data deleted.`);
      } else if (action.kind === "export-project") {
        const payload = await exportAdminProject(action.project.id, confirmationValue);
        downloadJson(payload, `promty-project-${action.project.slug}.json`);
        setNotice(`${action.project.name} export prepared.`);
      } else if (action.kind === "cancel-job") {
        const result = await cancelAdminJob(action.job.id, confirmationValue);
        setNotice(`Job ${action.job.id.slice(0, 8)} cancelled${result.retryable ? " and is safe to retry" : ""}.`);
      } else if (action.kind === "retry-job") {
        await retryAdminJob(action.job.id, confirmationValue);
        setNotice(`Job ${action.job.id.slice(0, 8)} returned to the pending queue.`);
      } else {
        const payload = await exportAdminEvents(confirmationValue, action.query);
        downloadJson(payload, "promty-events-export.json");
        setNotice("Event export prepared.");
      }
      closeConfirmation();
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Administrator action failed");
    } finally {
      setIsMutating(false);
    }
  };

  const saveProject = async (payload: AdminProjectMutation & { name?: string; owner_id?: string }) => {
    if (!projectEditor) return;
    setIsMutating(true);
    setErrorMessage(null);
    try {
      if (projectEditor.mode === "create") {
        if (!payload.name || !payload.owner_id) return;
        await createAdminProject({ ...payload, name: payload.name, owner_id: payload.owner_id });
        setNotice(`${payload.name} created.`);
      } else {
        await updateAdminProject(projectEditor.project.id, payload);
        setNotice(`${payload.name || projectEditor.project.name} updated.`);
      }
      setProjectEditor(null);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Project mutation failed");
    } finally {
      setIsMutating(false);
    }
  };

  if (authStatus === "loading") return <AuthLoadingPage />;
  if (authStatus === "unauthenticated") return <WebLoginPage errorMessage={null} />;
  if (authStatus === "error") {
    return (
      <main className="ops-access-denied">
        <section>
          <ShieldAlert aria-hidden="true" size={28} strokeWidth={1.4} />
          <span>ADMINISTRATOR ACCESS</span>
          <h1>Control center access denied</h1>
          <p>{errorMessage ?? "Your account is not authorized for this console."}</p>
          <a className="toolbar-button" href="/"><ArrowLeft size={16} /> Return to workspace</a>
        </section>
      </main>
    );
  }

  const activeMeta = SECTION_META.find((item) => item.id === section) ?? SECTION_META[0];
  const systemHealthy = data
    ? data.overview.metrics.failed_jobs === 0 && data.overview.metrics.stale_jobs === 0 &&
      !data.overview.risks.some((risk) => risk.severity === "high")
    : null;

  return (
    <div className="ops-shell">
      <aside className="ops-rail" data-open={isMobileNavOpen || undefined}>
        <div className="ops-brand">
          <BrandLogo />
          <div><strong>CONTROL</strong><span>Promty operations</span></div>
          <button aria-label="Close navigation" className="ops-mobile-close" onClick={() => setIsMobileNavOpen(false)} type="button"><X size={18} /></button>
        </div>
        <div className="ops-environment">
          <span className="ops-pulse" data-healthy={systemHealthy === null ? undefined : systemHealthy} />
          <div>
            <strong>{systemHealthy === null ? (isLoading ? "CHECKING SYSTEM" : "SYSTEM STATUS UNKNOWN") : systemHealthy ? "SYSTEM NOMINAL" : "ATTENTION REQUIRED"}</strong>
            <small>{data?.system.deployment.environment ?? "unknown"} · {data?.system.deployment.region ?? "local"}</small>
          </div>
        </div>
        <nav className="ops-nav" aria-label="Admin control center">
          <span className="ops-nav-label">COMMAND</span>
          {SECTION_META.map((item) => {
            const Icon = item.icon;
            return (
              <button aria-current={section === item.id ? "page" : undefined} data-active={section === item.id} key={item.id} onClick={() => selectSection(item.id)} type="button">
                <Icon size={17} strokeWidth={1.4} />
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
                <ChevronRight size={14} />
              </button>
            );
          })}
        </nav>
        <div className="ops-rail-footer">
          <a href="/"><ArrowLeft size={16} /><span>Workspace</span></a>
          <button onClick={() => void logoutSession().finally(() => setAuthStatus("unauthenticated"))} type="button"><LogOut size={16} /><span>Sign out</span></button>
          <div className="ops-operator">
            <span className="sidebar-avatar">{currentUser?.avatar_url ? <img alt="" src={currentUser.avatar_url} /> : currentUser?.username.slice(0, 1).toUpperCase()}</span>
            <div><strong>{currentUser?.username}</strong><small>SOLE ADMINISTRATOR</small></div>
          </div>
        </div>
      </aside>

      <main className="ops-main">
        <header className="ops-topbar">
          <button aria-label="Open navigation" className="ops-mobile-menu" onClick={() => setIsMobileNavOpen(true)} type="button"><Menu size={19} /></button>
          <div className="ops-breadcrumb"><span>PROMTY / CONTROL</span><strong>{activeMeta.label.toUpperCase()}</strong></div>
          <label className="ops-search">
            <Search size={16} strokeWidth={1.5} />
            <input aria-label="Search current admin view" onChange={(event) => setSearchQuery(event.target.value)} placeholder={`Search ${activeMeta.label.toLowerCase()}…`} ref={searchRef} type="search" value={searchQuery} />
            <kbd>/</kbd>
          </label>
          <button className="ops-refresh" disabled={isLoading} onClick={() => void loadData()} type="button">
            <RefreshCw className={isLoading ? "is-spinning" : undefined} size={16} /><span>{isLoading ? "Syncing" : "Sync"}</span>
          </button>
        </header>
        <div className="ops-status-strip">
          <span><CircleDot size={12} /> {data ? "API READY" : "API CHECKING"}</span>
          <span><Database size={12} /> {data ? `${data.system.database.dialect.toUpperCase()} ONLINE` : "DATABASE CHECKING"}</span>
          <span><ShieldCheck size={12} /> ADMIN ID LOCKED</span>
          <span className="ops-status-time">LAST SYNC {formatOptionalTimestamp(data?.overview.generated_at ?? null, "PENDING")}</span>
        </div>

        <div className="ops-content">
          <header className="ops-page-heading">
            <div><span>OPERATIONS INTELLIGENCE</span><h1>{activeMeta.label}</h1><p>{activeMeta.description}</p></div>
            <div className="ops-heading-facts"><span>Scope <strong>ALL DATA</strong></span><span>Authority <strong>ADMIN</strong></span></div>
          </header>
          {notice ? <div className="ops-notice" role="status"><CheckCircle2 size={16} /><span>{notice}</span><button aria-label="Dismiss" onClick={() => setNotice(null)} type="button"><X size={15} /></button></div> : null}
          {errorMessage && data ? <div className="ops-error" role="alert"><AlertTriangle size={16} /><span>{errorMessage}</span></div> : null}
          {!data ? (
            <div className="ops-loading" data-error={!isLoading || undefined}>
              {isLoading ? <LoaderCircle className="is-spinning" size={20} /> : <AlertTriangle size={20} />}
              <span>{isLoading ? "Building operational picture…" : errorMessage ?? "The operational picture could not be loaded."}</span>
              {!isLoading ? <button className="toolbar-button" onClick={() => void loadData()} type="button"><RefreshCw size={16} /> Retry</button> : null}
            </div>
          ) : (
            <AdminSectionContent
              currentAdmin={currentUser}
              data={data}
              expandedUserId={expandedUserId}
              jobFilter={jobFilter}
              onConfirm={(action) => { setConfirmationAction(action); setActionDetail(action.kind === "suspend-user" ? "Administrative access suspension" : ""); }}
              onEditProject={setProjectEditor}
              onExpandUser={(id) => setExpandedUserId((current) => current === id ? null : id)}
              onJobFilter={setJobFilter}
              onRefresh={() => void loadData()}
              searchQuery={searchQuery}
              section={section}
            />
          )}
        </div>
      </main>

      {confirmationAction ? (
        <ConfirmationDialog
          action={confirmationAction}
          actionDetail={actionDetail}
          confirmationValue={confirmationValue}
          isMutating={isMutating}
          onCancel={closeConfirmation}
          onChange={setConfirmationValue}
          onDetailChange={setActionDetail}
          onConfirm={() => void runConfirmedAction()}
        />
      ) : null}
      {projectEditor && data ? (
        <ProjectEditorDialog
          editor={projectEditor}
          isMutating={isMutating}
          onCancel={() => setProjectEditor(null)}
          onSave={(payload) => void saveProject(payload)}
          users={data.users.items}
        />
      ) : null}
      {issuedToken ? <IssuedTokenDialog issued={issuedToken} onClose={() => setIssuedToken(null)} /> : null}
    </div>
  );
}

function AdminSectionContent({
  currentAdmin,
  data,
  expandedUserId,
  jobFilter,
  onConfirm,
  onEditProject,
  onExpandUser,
  onJobFilter,
  onRefresh,
  searchQuery,
  section,
}: {
  currentAdmin: AuthUser | null;
  data: AdminData;
  expandedUserId: string | null;
  jobFilter: string;
  onConfirm: (action: ConfirmationAction) => void;
  onEditProject: (editor: ProjectEditorState) => void;
  onExpandUser: (id: string) => void;
  onJobFilter: (status: string) => void;
  onRefresh: () => void;
  searchQuery: string;
  section: AdminSection;
}) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const users = useMemo(() => data.users.items.filter((user) =>
    [user.username, user.email, user.github_id, user.status].some((value) => value?.toLowerCase().includes(normalizedSearch))), [data.users.items, normalizedSearch]);
  const projects = useMemo(() => data.projects.items.filter((project) =>
    [project.name, project.slug, project.owner.username, project.description, ...project.tags].some((value) => value?.toLowerCase().includes(normalizedSearch))), [data.projects.items, normalizedSearch]);
  const jobs = useMemo(() => data.jobs.items.filter((job) => {
    const matchesStatus = jobFilter === "all" || (jobFilter === "stale" ? job.stale : job.status === jobFilter);
    const matchesSearch = [job.id, job.project.name, job.owner.username, job.generator, job.reason, job.error].some((value) => value?.toLowerCase().includes(normalizedSearch));
    return matchesStatus && matchesSearch;
  }), [data.jobs.items, jobFilter, normalizedSearch]);
  const events = useMemo(() => data.events.items.filter((event) =>
    [event.event_type, event.tool, event.project.name, event.owner.username, JSON.stringify(event.payload)].some((value) => value.toLowerCase().includes(normalizedSearch))), [data.events.items, normalizedSearch]);
  const audit = useMemo(() => data.audit.items.filter((item) =>
    [item.action, item.actor.username, item.request_method, item.request_path, item.resource_id].some((value) => value?.toLowerCase().includes(normalizedSearch))), [data.audit.items, normalizedSearch]);

  if (section === "overview") {
    return <AdminDashboard errorMessage={null} isLoading={false} onOpenProject={(projectId) => window.location.assign(projectHref({ id: projectId }))} onRefresh={onRefresh} overview={data.overview} />;
  }

  if (section === "users") {
    return (
      <section className="ops-panel">
        <PanelHeader detail={`${users.length} shown · ${data.users.total} total`} icon={Users} title="Identity inventory" />
        <div className="ops-data-table ops-users-table">
          <div className="ops-data-row is-head"><span>Identity</span><span>Access</span><span>Activity</span><span>Footprint</span><span /></div>
          {users.map((user) => (
            <div className="ops-user-record" key={user.id}>
              <button aria-expanded={expandedUserId === user.id} className="ops-data-row" onClick={() => onExpandUser(user.id)} type="button">
                <span className="ops-identity"><span className="sidebar-avatar">{user.avatar_url ? <img alt="" src={user.avatar_url} /> : user.username[0]?.toUpperCase()}</span><span><strong>{user.username}</strong><small>{user.email ?? `GitHub ${user.github_id}`}</small></span></span>
                <span><StatusBadge tone={statusTone(user.status)}>{user.status.toUpperCase()}</StatusBadge><small>{user.is_admin ? "Administrator" : user.github.connected ? "GitHub connected" : "Member"}</small></span>
                <span><strong>{user.latest_activity_at ? formatRelativeTimestamp(user.latest_activity_at) : "No activity"}</strong><small>{formatCompactNumber(user.counts.events)} events</small></span>
                <span><strong>{user.counts.projects} projects</strong><small>{user.active_collector_tokens} active token{user.active_collector_tokens === 1 ? "" : "s"}</small></span>
                <ChevronDown data-open={expandedUserId === user.id} size={15} />
              </button>
              {expandedUserId === user.id ? <UserControlDrawer onConfirm={onConfirm} user={user} /> : null}
            </div>
          ))}
          {users.length === 0 ? <EmptyData label="No users match this query." /> : null}
        </div>
      </section>
    );
  }

  if (section === "projects") {
    return (
      <section className="ops-panel">
        <div className="ops-section-toolbar"><PanelHeader detail={`${projects.length} shown · ${data.projects.total} total`} icon={FolderKanban} title="Project inventory" /><button onClick={() => onEditProject({ mode: "create" })} type="button"><Plus size={14} /> Create project</button></div>
        <div className="ops-data-table ops-project-table">
          <div className="ops-data-row is-head"><span>Project</span><span>Owner</span><span>Telemetry</span><span>Memory</span><span>State</span><span>Controls</span></div>
          {projects.map((project) => (
            <div className="ops-data-row" key={project.id}>
              <span><a className="ops-primary-link" href={projectHref(project)}><strong>{project.name}</strong><ExternalLink size={12} /></a><small>{project.slug}</small></span>
              <span><strong>{project.owner.username}</strong><small>{project.visibility}</small></span>
              <span><strong>{formatCompactNumber(project.prompt_count)} prompts</strong><small>{formatCompactNumber(project.event_count)} events</small></span>
              <span><strong>{formatCompactNumber(project.memory_count)} summaries</strong><small>{project.latest_memory_at ? formatRelativeTimestamp(project.latest_memory_at) : "None"}</small></span>
              <span><StatusBadge tone={project.failed_jobs > 0 ? "danger" : project.github_connected ? "success" : "warning"}>{project.failed_jobs > 0 ? `${project.failed_jobs} FAILED` : project.github_connected ? "CONNECTED" : "NO REPO"}</StatusBadge></span>
              <span className="ops-row-actions">
                <button aria-label={`Edit ${project.name}`} onClick={() => onEditProject({ mode: "edit", project })} title="Edit" type="button"><Pencil size={13} /></button>
                <button aria-label={`Export ${project.name}`} onClick={() => onConfirm({ kind: "export-project", project })} title="Export" type="button"><Download size={13} /></button>
                <button aria-label={`Delete ${project.name}`} className="is-danger" onClick={() => onConfirm({ kind: "delete-project", project })} title="Delete" type="button"><Trash2 size={13} /></button>
              </span>
            </div>
          ))}
          {projects.length === 0 ? <EmptyData label="No projects match this query." /> : null}
        </div>
      </section>
    );
  }

  if (section === "operations") {
    const statuses = ["all", "pending", "running", "failed", "succeeded", "superseded", "stale"];
    return (
      <div className="ops-section-stack">
        <div className="ops-mini-metrics">
          <MiniMetric icon={Activity} label="Running" value={data.overview.metrics.running_jobs} />
          <MiniMetric icon={Clock3} label="Pending" value={data.overview.metrics.pending_jobs} />
          <MiniMetric danger icon={AlertTriangle} label="Failed" value={data.overview.metrics.failed_jobs} />
          <MiniMetric danger icon={FileClock} label="Stale" value={data.overview.metrics.stale_jobs} />
        </div>
        <section className="ops-panel">
          <PanelHeader detail={`${jobs.length} shown · ${data.jobs.total} total`} icon={Boxes} title="Memory generation jobs" />
          <div className="ops-filter-bar">{statuses.map((status) => <button data-active={jobFilter === status} key={status} onClick={() => onJobFilter(status)} type="button">{status.toUpperCase()}</button>)}</div>
          <div className="ops-data-table ops-job-table">
            <div className="ops-data-row is-head"><span>Status</span><span>Project</span><span>Generator</span><span>Result</span><span>Updated</span><span>Controls</span></div>
            {jobs.map((job) => (
              <div className="ops-data-row" key={job.id} title={job.error ?? undefined}>
                <span><StatusBadge tone={statusTone(job.status, job.stale)}>{job.stale ? "STALE" : job.status.toUpperCase()}</StatusBadge><small>attempt {job.attempt_count}</small></span>
                <span><strong>{job.project.name}</strong><small>{job.owner.username}</small></span>
                <span><strong>{job.generator}</strong><small>{job.id.slice(0, 8)}</small></span>
                <span><strong>{job.result_status ?? job.reason}</strong><small>{job.error ?? job.error_code ?? "No error detail"}</small></span>
                <span><strong>{job.updated_at ? formatRelativeTimestamp(job.updated_at) : "Unknown"}</strong><small>{formatOptionalTimestamp(job.updated_at, "Unknown")}</small></span>
                <span className="ops-row-actions">
                  <button disabled={!job.cancellable} onClick={() => onConfirm({ job, kind: "cancel-job" })} title="Cancel" type="button"><X size={13} /></button>
                  <button disabled={!job.retryable} onClick={() => onConfirm({ job, kind: "retry-job" })} title="Safe retry" type="button"><RotateCcw size={13} /></button>
                </span>
              </div>
            ))}
            {jobs.length === 0 ? <EmptyData label="No memory jobs match this view." /> : null}
          </div>
        </section>
      </div>
    );
  }

  if (section === "activity") {
    return (
      <section className="ops-panel">
        <div className="ops-section-toolbar">
          <PanelHeader detail={`${events.length} loaded · ${data.events.total} total${data.events.search_truncated ? " · search window limited" : ""}`} icon={Activity} title="Decrypted event stream" />
          <button onClick={() => onConfirm({ expected: currentAdmin?.username ?? "", kind: "export-events", query: searchQuery })} type="button"><FileJson size={14} /> Export matching JSON</button>
        </div>
        <div className="ops-data-table ops-event-table">
          <div className="ops-data-row is-head"><span>Event</span><span>Project</span><span>Owner</span><span>Session</span><span>Timestamp</span><span /></div>
          {events.map((event) => (
            <div className="ops-event-record" key={event.id}>
              <button aria-expanded={expandedEventId === event.id} className="ops-data-row" onClick={() => setExpandedEventId((current) => current === event.id ? null : event.id)} type="button">
                <span><strong>{event.event_type}</strong><small>{event.tool} · seq {event.sequence}</small></span>
                <span><strong>{event.project.name}</strong><small>{event.project.slug}</small></span>
                <span><strong>{event.owner.username}</strong><small>{event.id.slice(0, 8)}</small></span>
                <span><strong>{event.session_id.slice(0, 8)}</strong><small>schema v{event.schema_version}</small></span>
                <span><strong>{event.created_at ? formatRelativeTimestamp(event.created_at) : "Unknown"}</strong><small>{formatOptionalTimestamp(event.created_at, "Unknown")}</small></span>
                <ChevronDown data-open={expandedEventId === event.id} size={15} />
              </button>
              {expandedEventId === event.id ? <pre className="ops-event-detail">{JSON.stringify(event.payload, null, 2)}</pre> : null}
            </div>
          ))}
          {events.length === 0 ? <EmptyData label="No events match this query." /> : null}
        </div>
      </section>
    );
  }

  if (section === "system") return <SystemSection system={data.system} />;

  if (section === "security") {
    const securedUsers = users.filter((user) => user.active_collector_tokens > 0 || user.github.connected || user.status === "suspended");
    return (
      <div className="ops-security-grid">
        <section className="ops-panel">
          <PanelHeader detail={`${data.overview.risks.length} findings`} icon={ShieldAlert} title="Risk register" />
          <div className="ops-risk-register">
            {data.overview.risks.map((risk) => <div data-severity={risk.severity} key={risk.title}><AlertTriangle size={16} /><span><strong>{risk.title}</strong><small>{risk.detail}</small></span><StatusBadge tone={risk.severity === "high" ? "danger" : risk.severity === "medium" ? "warning" : "neutral"}>{risk.severity.toUpperCase()}</StatusBadge></div>)}
            {data.overview.risks.length === 0 ? <EmptyData label="No active configuration risks." /> : null}
          </div>
        </section>
        <section className="ops-panel">
          <PanelHeader detail="Enforced controls" icon={ShieldCheck} title="Security posture" />
          <dl className="ops-posture-list">
            <div><dt>Administrator model</dt><dd>Single GitHub numeric ID</dd></div>
            <div><dt>Session cookie</dt><dd>{data.overview.system.session_cookie_secure ? "Secure" : "Development mode"}</dd></div>
            <div><dt>SameSite policy</dt><dd>{data.overview.system.session_cookie_samesite}</dd></div>
            <div><dt>Admin rate limit</dt><dd>{data.overview.system.admin_rate_limit.requests} / {data.overview.system.admin_rate_limit.window_seconds}s</dd></div>
            <div><dt>Audit retention</dt><dd>{data.overview.system.admin_audit_retention_days} days</dd></div>
            <div><dt>Allowed origins</dt><dd>{data.overview.system.cors_origins.length}</dd></div>
          </dl>
        </section>
        <section className="ops-panel is-wide">
          <PanelHeader detail={`${securedUsers.length} identities`} icon={KeyRound} title="Credential control" />
          <div className="ops-security-users">
            {securedUsers.map((user) => <div key={user.id}><span><strong>{user.username}</strong><small>{user.email ?? user.github_id}</small></span><span><strong>{user.active_collector_tokens} collector tokens</strong><small>{user.status === "suspended" ? "Access suspended" : user.github.connected ? "GitHub linked" : "GitHub not linked"}</small></span><span className="ops-inline-actions"><button disabled={user.active_collector_tokens === 0} onClick={() => onConfirm({ kind: "revoke-all-tokens", user })} type="button">Revoke tokens</button><button disabled={!user.github.connected} onClick={() => onConfirm({ kind: "disconnect-github", user })} type="button">Disconnect GitHub</button></span></div>)}
          </div>
        </section>
      </div>
    );
  }

  return (
    <section className="ops-panel">
      <PanelHeader detail={`${audit.length} shown · ${data.audit.total} total`} icon={FileClock} title="Administrator audit trail" />
      <div className="ops-data-table ops-audit-table">
        <div className="ops-data-row is-head"><span>Action</span><span>Actor</span><span>Resource</span><span>Request</span><span>Timestamp</span></div>
        {audit.map((item) => <div className="ops-data-row" key={item.id}><span><strong>{item.action}</strong><small>{item.id.slice(0, 8)}</small></span><span><strong>{item.actor.username}</strong><small>GitHub {item.actor.github_id}</small></span><span><strong>{item.resource_type ?? "admin_console"}</strong><small>{item.resource_id ?? "global"}</small></span><span><StatusBadge tone={item.status_code < 400 ? "success" : "danger"}>{item.request_method} {item.status_code}</StatusBadge><small>{item.request_path}</small></span><span><strong>{item.created_at ? formatRelativeTimestamp(item.created_at) : "Unknown"}</strong><small>{formatOptionalTimestamp(item.created_at, "Unknown")}</small></span></div>)}
        {audit.length === 0 ? <EmptyData label="No audit entries match this query." /> : null}
      </div>
    </section>
  );
}

function UserControlDrawer({ onConfirm, user }: { onConfirm: (action: ConfirmationAction) => void; user: AdminUser }) {
  const locked = user.is_admin;
  return (
    <div className="ops-user-drawer">
      <div className="ops-user-facts">
        <span><small>USER ID</small><code>{user.id}</code></span>
        <span><small>GITHUB ID</small><code>{user.github_id}</code></span>
        <span><small>CREATED</small><strong>{formatOptionalTimestamp(user.created_at, "Unknown")}</strong></span>
        <span><small>STATUS</small><strong>{user.status.toUpperCase()}</strong></span>
      </div>
      {user.suspension_reason ? <div className="ops-suspension-note"><ShieldAlert size={14} /><span><strong>Suspended {formatOptionalTimestamp(user.suspended_at, "")}</strong><small>{user.suspension_reason}</small></span></div> : null}
      <div className="ops-credential-block">
        <div className="ops-credential-heading"><span><KeyRound size={15} /> Collector tokens</span><span className="ops-inline-actions"><button disabled={user.status === "suspended"} onClick={() => onConfirm({ kind: "issue-token", user })} type="button">Issue token</button><button disabled={user.active_collector_tokens === 0} onClick={() => onConfirm({ kind: "revoke-all-tokens", user })} type="button">Revoke all</button></span></div>
        {user.collector_tokens.map((token) => <div className="ops-token-row" key={token.id}><span className="admin-state-dot" data-on={token.status === "active"} /><span><strong>{token.name}</strong><small>{token.collector_version ?? "Unknown version"} · last used {formatOptionalTimestamp(token.last_used_at, "never")}</small></span><code>{token.id.slice(0, 8)}</code><button disabled={token.status === "revoked"} onClick={() => onConfirm({ kind: "revoke-token", tokenId: token.id, tokenName: token.name, user })} type="button">{token.status === "revoked" ? "Revoked" : "Revoke"}</button></div>)}
        {user.collector_tokens.length === 0 ? <EmptyData label="No collector tokens issued." /> : null}
      </div>
      <div className="ops-credential-block">
        <div className="ops-credential-heading"><span><GitBranch size={15} /> GitHub repository access</span><button disabled={!user.github.connected} onClick={() => onConfirm({ kind: "disconnect-github", user })} type="button">Disconnect</button></div>
        <div className="ops-github-state"><StatusBadge tone={user.github.connected ? "success" : "neutral"}>{user.github.connected ? "CONNECTED" : "NOT CONNECTED"}</StatusBadge><span>{user.github.scopes.length ? user.github.scopes.join(" · ") : "No active scopes"}</span><small>Updated {formatOptionalTimestamp(user.github.updated_at, "never")}</small></div>
      </div>
      <div className="ops-account-controls">
        <span><ShieldAlert size={15} /><span><strong>Account lifecycle</strong><small>The sole administrator account is permanently protected.</small></span></span>
        <div className="ops-inline-actions">
          {user.status === "suspended" ? <button disabled={locked} onClick={() => onConfirm({ kind: "restore-user", user })} type="button"><RotateCcw size={13} /> Restore</button> : <button disabled={locked} onClick={() => onConfirm({ kind: "suspend-user", user })} type="button"><ShieldAlert size={13} /> Suspend</button>}
          <button className="is-danger" disabled={locked} onClick={() => onConfirm({ kind: "delete-user", user })} type="button"><Trash2 size={13} /> Delete user + data</button>
        </div>
      </div>
    </div>
  );
}

function SystemSection({ system }: { system: AdminSystem }) {
  return (
    <div className="ops-system-grid">
      <section className="ops-panel"><PanelHeader detail="Process" icon={Server} title="Runtime" /><dl className="ops-posture-list"><div><dt>Environment</dt><dd>{system.deployment.environment}</dd></div><div><dt>Region</dt><dd>{system.deployment.region ?? "local"}</dd></div><div><dt>Release</dt><dd><code>{system.deployment.release_sha?.slice(0, 12) ?? "unversioned"}</code></dd></div><div><dt>Uptime</dt><dd>{Math.floor(system.runtime.uptime_seconds / 60).toLocaleString()} min</dd></div><div><dt>Python</dt><dd>{system.runtime.python}</dd></div><div><dt>Platform</dt><dd title={system.runtime.platform}>{system.runtime.platform}</dd></div></dl></section>
      <section className="ops-panel"><PanelHeader detail={system.database.dialect} icon={Database} title="Database" /><dl className="ops-posture-list"><div><dt>Migration</dt><dd><code>{system.database.migration ?? "n/a"}</code></dd></div><div><dt>Total size</dt><dd>{formatBytes(system.database.size_bytes)}</dd></div><div><dt>Pool</dt><dd title={system.database.pool}>{system.database.pool}</dd></div>{Object.entries(system.database.connections).map(([key, value]) => <div key={key}><dt>Connections · {key}</dt><dd>{value}</dd></div>)}</dl></section>
      <section className="ops-panel"><PanelHeader detail={system.worker.status} icon={Bot} title="Worker & providers" /><dl className="ops-posture-list"><div><dt>Pending batches</dt><dd>{system.worker.pending_batches}</dd></div><div><dt>Running batches</dt><dd>{system.worker.running_batches}</dd></div><div><dt>OpenAI</dt><dd>{system.providers.openai.configured ? system.providers.openai.model : "Not configured"}</dd></div><div><dt>Gemini</dt><dd>{system.providers.gemini.configured ? system.providers.gemini.model : "Not configured"}</dd></div><div><dt>Billing telemetry</dt><dd>{system.providers.real_billing_available ? "Available" : "Not connected"}</dd></div></dl></section>
      <section className="ops-panel is-wide"><PanelHeader detail={`${system.database.table_sizes.length} largest relations`} icon={Boxes} title="Database footprint" /><div className="ops-table-sizes">{system.database.table_sizes.map((table) => <div key={table.name}><span><strong>{table.name}</strong><small>PostgreSQL relation</small></span><code>{formatBytes(table.size_bytes)}</code></div>)}{system.database.table_sizes.length === 0 ? <EmptyData label="Table sizing is available on PostgreSQL." /> : null}</div></section>
    </div>
  );
}

function ProjectEditorDialog({ editor, isMutating, onCancel, onSave, users }: { editor: ProjectEditorState; isMutating: boolean; onCancel: () => void; onSave: (payload: AdminProjectMutation & { name?: string; owner_id?: string }) => void; users: AdminUser[] }) {
  const project = editor.mode === "edit" ? editor.project : null;
  const initialOwner = project?.owner.id ?? users[0]?.id ?? "";
  const [ownerId, setOwnerId] = useState(initialOwner);
  const [name, setName] = useState(project?.name ?? "");
  const [slug, setSlug] = useState(project?.slug ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [githubUrl, setGithubUrl] = useState(project?.github_url ?? "");
  const [projectUrl, setProjectUrl] = useState(project?.project_url ?? "");
  const [defaultBranch, setDefaultBranch] = useState(project?.default_branch ?? "main");
  const [visibility, setVisibility] = useState<"private" | "public">(project?.visibility ?? "private");
  const [tags, setTags] = useState(project?.tags.join(", ") ?? "");
  const [confirmation, setConfirmation] = useState("");
  const owner = users.find((user) => user.id === ownerId);
  const expected = project?.slug ?? owner?.username ?? "";
  const valid = name.trim().length > 0 && defaultBranch.trim().length > 0 && confirmation === expected;
  return (
    <div className="ops-modal-backdrop">
      <section aria-modal="true" className="ops-editor-dialog" role="dialog">
        <header><span><FolderKanban size={17} /> PROJECT CONTROL</span><button aria-label="Close" onClick={onCancel} type="button"><X size={16} /></button></header>
        <div className="ops-editor-title"><h2>{project ? `Edit ${project.name}` : "Create project"}</h2><p>{project ? "Update project identity, repository metadata, and visibility." : "Create a project for any identity in the system."}</p></div>
        <div className="ops-form-grid">
          <label>Owner<select disabled={Boolean(project)} onChange={(event) => setOwnerId(event.target.value)} value={ownerId}>{users.map((user) => <option key={user.id} value={user.id}>{user.username}{user.status === "suspended" ? " · suspended" : ""}</option>)}</select></label>
          <label>Name<input onChange={(event) => setName(event.target.value)} value={name} /></label>
          <label>Slug<input onChange={(event) => setSlug(event.target.value)} placeholder="generated-from-name" value={slug} /></label>
          <label>Default branch<input onChange={(event) => setDefaultBranch(event.target.value)} value={defaultBranch} /></label>
          <label className="is-wide">Description<textarea onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label>
          <label>GitHub URL<input onChange={(event) => setGithubUrl(event.target.value)} placeholder="https://github.com/…" type="url" value={githubUrl} /></label>
          <label>Project URL<input onChange={(event) => setProjectUrl(event.target.value)} placeholder="https://…" type="url" value={projectUrl} /></label>
          <label>Visibility<select onChange={(event) => setVisibility(event.target.value as "private" | "public")} value={visibility}><option value="private">Private</option><option value="public">Public</option></select></label>
          <label>Tags<input onChange={(event) => setTags(event.target.value)} placeholder="ai, backend, product" value={tags} /></label>
          <label className="is-wide">Type <strong>{expected}</strong> to confirm<input onChange={(event) => setConfirmation(event.target.value)} spellCheck="false" value={confirmation} /></label>
        </div>
        <div className="ops-confirm-actions"><button disabled={isMutating} onClick={onCancel} type="button">Cancel</button><button disabled={!valid || isMutating} onClick={() => onSave({ confirmation, default_branch: defaultBranch.trim(), description: description.trim() || null, github_url: githubUrl.trim() || null, name: name.trim(), owner_id: project ? undefined : ownerId, project_url: projectUrl.trim() || null, slug: slug.trim() || null, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), visibility })} type="button">{isMutating ? <LoaderCircle className="is-spinning" size={14} /> : project ? <Pencil size={14} /> : <Plus size={14} />}{project ? "Save project" : "Create project"}</button></div>
      </section>
    </div>
  );
}

function ConfirmationDialog({ action, actionDetail, confirmationValue, isMutating, onCancel, onChange, onConfirm, onDetailChange }: { action: ConfirmationAction; actionDetail: string; confirmationValue: string; isMutating: boolean; onCancel: () => void; onChange: (value: string) => void; onConfirm: () => void; onDetailChange: (value: string) => void }) {
  const expected = actionExpected(action);
  const config: Record<ConfirmationAction["kind"], [string, string]> = {
    "cancel-job": ["Cancel memory job", "Running provider work may still finish externally, but its database result will be invalidated."],
    "delete-project": ["Delete project and all data", "Sessions, events, artifacts, jobs, and repository metadata will be permanently deleted."],
    "delete-user": ["Delete user and all owned data", "This permanently deletes the identity, projects, events, artifacts, credentials, and connections."],
    "disconnect-github": ["Disconnect GitHub access", "Repository browsing stops until the user authorizes GitHub again."],
    "export-events": ["Export matching events", "The JSON download contains decrypted event payloads and must be handled as sensitive data."],
    "export-project": ["Export project data", "The JSON download includes decrypted event payloads, sessions, and generated artifacts."],
    "issue-token": ["Issue collector token", "The token secret is shown exactly once after creation."],
    "restore-user": ["Restore user access", "Web sessions and active collector tokens can be used again."],
    "retry-job": ["Retry memory job", "Only jobs cancelled before provider work began are eligible for safe retry."],
    "revoke-all-tokens": ["Revoke every collector token", "Affected collectors stop ingesting immediately and must be reauthorized."],
    "revoke-token": ["Revoke collector token", "The affected collector stops ingesting immediately."],
    "suspend-user": ["Suspend all user access", "Web sessions and collector ingestion are blocked until the account is restored."],
  };
  const [title, detail] = config[action.kind];
  const detailValid = action.kind !== "suspend-user" || actionDetail.trim().length >= 3;
  return (
    <div className="ops-modal-backdrop">
      <section aria-labelledby="ops-confirm-title" aria-modal="true" className="ops-confirm-dialog" role="dialog">
        <div className="ops-confirm-icon"><ShieldAlert size={20} /></div>
        <div><span>PRIVILEGED ADMIN ACTION</span><h2 id="ops-confirm-title">{title}</h2><p>{detail}</p></div>
        {action.kind === "issue-token" ? <label>Token name<input autoFocus onChange={(event) => onDetailChange(event.target.value)} placeholder="Admin-issued collector" value={actionDetail} /></label> : null}
        {action.kind === "suspend-user" ? <label>Suspension reason<textarea autoFocus onChange={(event) => onDetailChange(event.target.value)} rows={3} value={actionDetail} /></label> : null}
        <label>Type <strong>{expected}</strong> to confirm<input autoFocus={action.kind !== "issue-token" && action.kind !== "suspend-user"} onChange={(event) => onChange(event.target.value)} spellCheck="false" value={confirmationValue} /></label>
        <div className="ops-confirm-actions"><button disabled={isMutating} onClick={onCancel} type="button">Cancel</button><button className={action.kind.startsWith("delete") || action.kind === "suspend-user" ? "is-danger" : undefined} disabled={isMutating || confirmationValue !== expected || !detailValid} onClick={onConfirm} type="button">{isMutating ? <LoaderCircle className="is-spinning" size={15} /> : <ShieldAlert size={15} />} Confirm action</button></div>
      </section>
    </div>
  );
}

function IssuedTokenDialog({ issued, onClose }: { issued: IssuedToken; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ops-modal-backdrop">
      <section aria-modal="true" className="ops-secret-dialog" role="dialog">
        <KeyRound size={22} /><span>ONE-TIME SECRET</span><h2>Collector token issued</h2><p>Copy this token now. It cannot be recovered after this dialog closes.</p>
        <label>{issued.name} · {issued.username}<textarea readOnly rows={5} value={issued.token} /></label>
        <div className="ops-confirm-actions"><button onClick={() => void navigator.clipboard.writeText(issued.token).then(() => setCopied(true))} type="button"><Copy size={14} /> {copied ? "Copied" : "Copy token"}</button><button onClick={onClose} type="button">I saved it</button></div>
      </section>
    </div>
  );
}

function PanelHeader({ detail, icon: Icon, title }: { detail: string; icon: typeof Users; title: string }) {
  return <header className="ops-panel-header"><span><Icon size={16} strokeWidth={1.4} /><strong>{title}</strong></span><small>{detail}</small></header>;
}

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className="ops-status-badge" data-tone={tone}>{children}</span>;
}

function MiniMetric({ danger = false, icon: Icon, label, value }: { danger?: boolean; icon: typeof Activity; label: string; value: number }) {
  return <div data-danger={danger && value > 0}><Icon size={17} /><span><small>{label}</small><strong>{formatCompactNumber(value)}</strong></span></div>;
}

function EmptyData({ label }: { label: string }) {
  return <div className="ops-empty"><Database size={16} /><span>{label}</span></div>;
}
