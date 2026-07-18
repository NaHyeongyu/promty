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
  Languages,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquareText,
  Megaphone,
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
  acknowledgeAdminRisk,
  cancelAdminJob,
  clearAdminRiskAcknowledgement,
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
  fetchAdminSupportInquiries,
  fetchAdminUsers,
  restoreAdminUser,
  retryAdminJob,
  revokeAdminCollectorToken,
  revokeAllAdminCollectorTokens,
  suspendAdminUser,
  updateAdminAlertState,
  updateAdminSupportInquiry,
  updateAdminProject,
} from "./api/admin";
import { fetchCurrentUser, logoutSession } from "./api/auth";
import { ForbiddenError, UnauthorizedError } from "./api/client";
import { AdminDashboard } from "./components/app/AdminDashboard";
import { MarketingContentStudio } from "./components/app/MarketingContentStudio";
import { AuthLoadingPage, WebLoginPage } from "./components/app/AuthScreens";
import { BrandLogo } from "./components/app/Branding";
import {
  formatCompactNumber,
  formatOptionalTimestamp,
  formatRelativeTimestamp,
} from "./lib/formatters";
import { useAdminLocale } from "./i18n/useAdminLocale";
import type {
  AdminAuditLog,
  AdminEventPage,
  AdminJob,
  AdminOverview,
  AdminPage,
  AdminProject,
  AdminSystem,
  AdminSupportInquiry,
  AdminUser,
  AuthStatus,
  AuthUser,
} from "./workspace/types";
import "./styles-admin.css";

type AdminSection =
  | "overview"
  | "marketing"
  | "users"
  | "projects"
  | "support"
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
  support: AdminPage<AdminSupportInquiry>;
  system: AdminSystem;
  users: AdminPage<AdminUser>;
};

type ConfirmationAction =
  | { expected: string; kind: "acknowledge-risk"; risk: AdminOverview["risks"][number] }
  | { expected: string; kind: "clear-risk-acknowledgement"; risk: AdminOverview["risks"][number] }
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
type AdminProjectFormPayload = {
  confirmation: string;
  default_branch: string;
  description: string | null;
  github_url: string | null;
  name: string;
  owner_id?: string;
  project_url: string | null;
  slug: string | null;
  tags: string[];
  visibility: "private" | "public";
};
type AdminProjectSort = "popularity" | "recent" | "saves" | "views" | "views_7d";
type AdminProjectVisibility = "all" | "private" | "public";

const ADMIN_PAGE_SIZE = 25;
type PagedAdminSection = "activity" | "audit" | "operations" | "projects" | "security" | "support" | "users";
const INITIAL_PAGE_OFFSETS: Record<PagedAdminSection, number> = {
  activity: 0,
  audit: 0,
  operations: 0,
  projects: 0,
  security: 0,
  support: 0,
  users: 0,
};

const SECTION_META: Array<{
  icon: typeof LayoutDashboard;
  id: AdminSection;
}> = [
  { icon: LayoutDashboard, id: "overview" },
  { icon: Megaphone, id: "marketing" },
  { icon: Users, id: "users" },
  { icon: FolderKanban, id: "projects" },
  { icon: MessageSquareText, id: "support" },
  { icon: Bot, id: "operations" },
  { icon: Activity, id: "activity" },
  { icon: Server, id: "system" },
  { icon: ShieldAlert, id: "security" },
  { icon: FileClock, id: "audit" },
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
  const { locale, serverText, setLocale, text } = useAdminLocale();
  const sectionMeta = useMemo(() => {
    const copy: Record<AdminSection, { description: string; label: string }> = {
      overview: { description: text("System-wide operational picture", "시스템 전체 운영 현황"), label: text("Overview", "개요") },
      marketing: { description: text("Bilingual social content and distribution", "한국어·영어 SNS 콘텐츠 및 배포"), label: text("Marketing", "마케팅") },
      users: { description: text("Identity and access control", "사용자 계정 및 접근 제어"), label: text("Users", "사용자") },
      projects: { description: text("Repository and activity inventory", "프로젝트·저장소·활동 현황"), label: text("Projects", "프로젝트") },
      support: { description: text("User inquiries and delivery failures", "사용자 문의 및 알림 전송 관리"), label: text("Support", "고객 문의") },
      operations: { description: text("Memory generation and pipelines", "메모리 생성 작업 및 파이프라인"), label: text("Operations", "작업 관리") },
      activity: { description: text("Decrypted event intelligence", "복호화된 이벤트 활동 내역"), label: text("Event stream", "이벤트") },
      system: { description: text("Runtime and database telemetry", "런타임 및 데이터베이스 상태"), label: text("System", "시스템") },
      security: { description: text("Risk posture and credentials", "보안 위험 및 인증 정보 관리"), label: text("Security", "보안") },
      audit: { description: text("Administrator activity trail", "관리자 활동 감사 기록"), label: text("Audit log", "감사 로그") },
    };
    return SECTION_META.map((item) => ({ ...item, ...copy[item.id] }));
  }, [text]);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [section, setSection] = useState<AdminSection>(sectionFromUrl);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState("all");
  const [projectSort, setProjectSort] = useState<AdminProjectSort>("popularity");
  const [projectVisibility, setProjectVisibility] = useState<AdminProjectVisibility>("all");
  const [auditOutcome, setAuditOutcome] = useState<"all" | "error" | "success">("all");
  const [auditResourceType, setAuditResourceType] = useState("all");
  const [pageOffsets, setPageOffsets] = useState(INITIAL_PAGE_OFFSETS);
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
      const userSection = section === "security" ? "security" : "users";
      const [overview, users, projects, support, jobs, events, system, audit] = await Promise.all([
        fetchAdminOverview(signal),
        fetchAdminUsers({
          limit: ADMIN_PAGE_SIZE,
          offset: pageOffsets[userSection],
          query: section === userSection ? searchQuery : undefined,
        }, signal),
        fetchAdminProjects({
          limit: ADMIN_PAGE_SIZE,
          offset: pageOffsets.projects,
          query: section === "projects" ? searchQuery : undefined,
          sort: projectSort,
          visibility: projectVisibility,
        }, signal),
        fetchAdminSupportInquiries({
          limit: ADMIN_PAGE_SIZE,
          offset: pageOffsets.support,
        }, signal),
        fetchAdminJobs({
          limit: ADMIN_PAGE_SIZE,
          offset: pageOffsets.operations,
          query: section === "operations" ? searchQuery : undefined,
          status: section === "operations" ? jobFilter : undefined,
        }, signal),
        fetchAdminEvents({
          limit: ADMIN_PAGE_SIZE,
          offset: pageOffsets.activity,
          query: section === "activity" ? searchQuery : undefined,
        }, signal),
        fetchAdminSystem(signal),
        fetchAdminAuditLogs({
          limit: ADMIN_PAGE_SIZE,
          offset: pageOffsets.audit,
          outcome: section === "audit" && auditOutcome !== "all" ? auditOutcome : undefined,
          query: section === "audit" ? searchQuery : undefined,
          resourceType: section === "audit" && auditResourceType !== "all" ? auditResourceType : undefined,
        }, signal),
      ]);
      setData({ audit, events, jobs, overview, projects, support, system, users });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof UnauthorizedError) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);
        setData(null);
        return;
      }
      if (error instanceof ForbiddenError) setAuthStatus("error");
      setErrorMessage(error instanceof Error ? error.message : text("Admin control center request failed", "관리자 제어 센터 요청에 실패했습니다."));
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
        if (!user.is_admin) setErrorMessage(text("This control center is restricted to the configured administrator.", "이 제어 센터는 지정된 관리자만 사용할 수 있습니다."));
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof UnauthorizedError) setAuthStatus("unauthenticated");
        else {
          setAuthStatus("error");
          setErrorMessage(error instanceof Error ? error.message : text("Session request failed", "세션 확인에 실패했습니다."));
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
    if (authStatus !== "authenticated") return;
    const refreshOverview = () => {
      if (document.visibilityState !== "visible") return;
      void fetchAdminOverview()
        .then((overview) => setData((current) => current ? { ...current, overview } : current))
        .catch(() => undefined);
    };
    const interval = window.setInterval(refreshOverview, 60_000);
    document.addEventListener("visibilitychange", refreshOverview);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOverview);
    };
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
    if (
      authStatus !== "authenticated" ||
      !data ||
      !(section in INITIAL_PAGE_OFFSETS)
    ) return;
    const pagedSection = section as PagedAdminSection;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const options = {
        limit: ADMIN_PAGE_SIZE,
        offset: pageOffsets[pagedSection],
        query: searchQuery,
      };
      setIsLoading(true);
      const request = pagedSection === "users" || pagedSection === "security"
        ? fetchAdminUsers(options, controller.signal).then((users) => ({ users }))
        : pagedSection === "projects"
          ? fetchAdminProjects({ ...options, sort: projectSort, visibility: projectVisibility }, controller.signal).then((projects) => ({ projects }))
          : pagedSection === "support"
            ? fetchAdminSupportInquiries(options, controller.signal).then((support) => ({ support }))
          : pagedSection === "operations"
            ? fetchAdminJobs({ ...options, status: jobFilter }, controller.signal).then((jobs) => ({ jobs }))
            : pagedSection === "activity"
              ? fetchAdminEvents(options, controller.signal).then((events) => ({ events }))
              : fetchAdminAuditLogs(
                  {
                    ...options,
                    outcome: auditOutcome === "all" ? undefined : auditOutcome,
                    resourceType: auditResourceType === "all" ? undefined : auditResourceType,
                  },
                  controller.signal,
                ).then((audit) => ({ audit }));
      void request
        .then((page) => setData((current) => current ? { ...current, ...page } : current))
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setErrorMessage(error instanceof Error ? error.message : text("Administrator list request failed", "관리자 목록 요청에 실패했습니다."));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    auditOutcome,
    auditResourceType,
    authStatus,
    data !== null,
    jobFilter,
    pageOffsets,
    projectSort,
    projectVisibility,
    searchQuery,
    section,
    text,
  ]);

  const selectSection = (nextSection: AdminSection) => {
    setSection(nextSection);
    setSearchQuery("");
    if (nextSection in INITIAL_PAGE_OFFSETS) {
      setPageOffsets((current) => ({ ...current, [nextSection]: 0 }));
    }
    setIsMobileNavOpen(false);
    const url = new URL(window.location.href);
    if (nextSection === "overview") url.searchParams.delete("section");
    else url.searchParams.set("section", nextSection);
    window.history.pushState(null, "", url);
  };

  const openActionItem = (item: AdminOverview["action_items"][number]) => {
    if (item.target === "support" || item.area === "Support") {
      selectSection("support");
      return;
    }
    if (item.target === "operations:failed" || item.title === "Generation jobs failed") {
      setJobFilter("failed");
      selectSection("operations");
      return;
    }
    if (item.target === "operations:stale" || item.title === "Generation jobs may be stuck") {
      setJobFilter("stale");
      selectSection("operations");
      return;
    }
    if (item.target === "activity" || item.area === "AI activity") {
      selectSection("activity");
      return;
    }
    if (item.target?.startsWith("operations") || item.area === "Memory" || item.area === "AI generation") {
      setJobFilter("all");
      selectSection("operations");
      return;
    }
    selectSection(item.target === "projects" || item.area === "Projects" ? "projects" : "security");
  };

  const updateActionItem = async (
    item: AdminOverview["action_items"][number],
    state: "read" | "resolved" | "snoozed",
  ) => {
    if (!item.key || !item.condition_hash) return;
    try {
      await updateAdminAlertState(item.key, item.condition_hash, state);
      const overview = await fetchAdminOverview();
      setData((current) => current ? { ...current, overview } : current);
      if (state === "resolved") setNotice(text("Alert resolved until the condition changes.", "조건이 바뀔 때까지 알림을 해결 처리했습니다."));
      if (state === "snoozed") setNotice(text("Alert snoozed for 24 hours.", "알림을 24시간 보류했습니다."));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : text("Alert state could not be saved.", "알림 상태를 저장하지 못했습니다."));
    }
  };

  const updateSupportStatus = async (
    inquiry: AdminSupportInquiry,
    status: AdminSupportInquiry["status"],
  ) => {
    try {
      await updateAdminSupportInquiry(inquiry.id, status);
      await loadData();
      setNotice(text("Inquiry status updated.", "문의 상태를 업데이트했습니다."));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : text("Inquiry could not be updated.", "문의 상태를 업데이트하지 못했습니다."));
    }
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
        setNotice(text(`GitHub access disconnected for ${action.user.username}.`, `${action.user.username}의 GitHub 연결을 해제했습니다.`));
      } else if (action.kind === "revoke-all-tokens") {
        const result = await revokeAllAdminCollectorTokens(action.user.id, confirmationValue);
        setNotice(text(`${result.revoked} collector token${result.revoked === 1 ? "" : "s"} revoked for ${action.user.username}.`, `${action.user.username}의 수집기 토큰 ${result.revoked}개를 폐기했습니다.`));
      } else if (action.kind === "revoke-token") {
        await revokeAdminCollectorToken(action.user.id, action.tokenId, confirmationValue);
        setNotice(text(`${action.tokenName} revoked for ${action.user.username}.`, `${action.user.username}의 ${action.tokenName} 토큰을 폐기했습니다.`));
      } else if (action.kind === "issue-token") {
        const name = actionDetail.trim() || text("Admin-issued collector", "관리자 발급 수집기");
        const result = await createAdminCollectorToken(action.user.id, confirmationValue, name);
        setIssuedToken({ name, token: result.token, username: action.user.username });
        setNotice(text(`Collector token issued for ${action.user.username}.`, `${action.user.username}의 수집기 토큰을 발급했습니다.`));
      } else if (action.kind === "suspend-user") {
        await suspendAdminUser(action.user.id, confirmationValue, actionDetail.trim());
        setNotice(text(`${action.user.username} suspended and all access blocked.`, `${action.user.username} 계정을 정지하고 모든 접근을 차단했습니다.`));
      } else if (action.kind === "restore-user") {
        await restoreAdminUser(action.user.id, confirmationValue);
        setNotice(text(`${action.user.username} restored.`, `${action.user.username} 계정을 복구했습니다.`));
      } else if (action.kind === "delete-user") {
        await deleteAdminUser(action.user.id, confirmationValue);
        setNotice(text(`${action.user.username} and all owned data deleted.`, `${action.user.username} 및 소유 데이터를 모두 삭제했습니다.`));
        setExpandedUserId(null);
      } else if (action.kind === "delete-project") {
        await deleteAdminProject(action.project.id, confirmationValue);
        setNotice(text(`${action.project.name} and related data deleted.`, `${action.project.name} 및 관련 데이터를 삭제했습니다.`));
      } else if (action.kind === "export-project") {
        const payload = await exportAdminProject(action.project.id, confirmationValue);
        downloadJson(payload, `promty-project-${action.project.slug}.json`);
        setNotice(text(`${action.project.name} export prepared.`, `${action.project.name} 내보내기를 준비했습니다.`));
      } else if (action.kind === "cancel-job") {
        const result = await cancelAdminJob(action.job.id, confirmationValue);
        setNotice(text(`Job ${action.job.id.slice(0, 8)} cancelled${result.retryable ? " and is safe to retry" : ""}.`, `작업 ${action.job.id.slice(0, 8)}을 취소했습니다${result.retryable ? ". 안전하게 재시도할 수 있습니다" : ""}.`));
      } else if (action.kind === "retry-job") {
        await retryAdminJob(action.job.id, confirmationValue);
        setNotice(text(`Job ${action.job.id.slice(0, 8)} returned to the pending queue.`, `작업 ${action.job.id.slice(0, 8)}을 대기열로 되돌렸습니다.`));
      } else if (action.kind === "acknowledge-risk") {
        await acknowledgeAdminRisk(action.risk.key, confirmationValue);
        setNotice(text(`Risk acknowledged: ${action.risk.title}.`, `위험 항목을 확인 처리했습니다: ${serverText(action.risk.title)}.`));
      } else if (action.kind === "clear-risk-acknowledgement") {
        await clearAdminRiskAcknowledgement(action.risk.key, confirmationValue);
        setNotice(text(`Risk acknowledgement cleared: ${action.risk.title}.`, `위험 항목 확인 상태를 해제했습니다: ${serverText(action.risk.title)}.`));
      } else {
        const payload = await exportAdminEvents(confirmationValue, action.query);
        downloadJson(payload, "promty-events-export.json");
        setNotice(text("Event export prepared.", "이벤트 내보내기를 준비했습니다."));
      }
      closeConfirmation();
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : text("Administrator action failed", "관리자 작업에 실패했습니다."));
    } finally {
      setIsMutating(false);
    }
  };

  const saveProject = async (payload: AdminProjectFormPayload) => {
    if (!projectEditor) return;
    setIsMutating(true);
    setErrorMessage(null);
    try {
      if (projectEditor.mode === "create") {
        if (!payload.name || !payload.owner_id) return;
        await createAdminProject({ ...payload, name: payload.name, owner_id: payload.owner_id });
        setNotice(text(`${payload.name} created.`, `${payload.name} 프로젝트를 생성했습니다.`));
      } else {
        const { owner_id: _ownerId, ...update } = payload;
        await updateAdminProject(projectEditor.project.id, update);
        setNotice(text(`${payload.name || projectEditor.project.name} updated.`, `${payload.name || projectEditor.project.name} 프로젝트를 수정했습니다.`));
      }
      setProjectEditor(null);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : text("Project mutation failed", "프로젝트 변경에 실패했습니다."));
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
          <span>{text("ADMINISTRATOR ACCESS", "관리자 접근")}</span>
          <h1>{text("Control center access denied", "제어 센터 접근이 거부되었습니다")}</h1>
          <p>{errorMessage ?? text("Your account is not authorized for this console.", "이 콘솔을 사용할 권한이 없는 계정입니다.")}</p>
          <a className="toolbar-button" href="/app"><ArrowLeft size={16} /> {text("Return to workspace", "워크스페이스로 돌아가기")}</a>
        </section>
      </main>
    );
  }

  const activeMeta = sectionMeta.find((item) => item.id === section) ?? sectionMeta[0];
  const systemHealthy = data
    ? data.overview.metrics.failed_jobs === 0 && data.overview.metrics.stale_jobs === 0 &&
      (data.overview.metrics.failed_support_notifications ?? 0) === 0 &&
      !data.overview.risks.some((risk) => risk.severity === "high")
    : null;

  return (
    <div className="ops-shell">
      <aside className="ops-rail" data-open={isMobileNavOpen || undefined}>
        <div className="ops-brand">
          <BrandLogo />
          <div><strong>CONTROL</strong><span>{text("Promty operations", "Promty 운영 관리")}</span></div>
          <button aria-label={text("Close navigation", "탐색 메뉴 닫기")} className="ops-mobile-close" onClick={() => setIsMobileNavOpen(false)} type="button"><X size={18} /></button>
        </div>
        <div className="ops-environment">
          <span className="ops-pulse" data-healthy={systemHealthy === null ? undefined : systemHealthy} />
          <div>
            <strong>{systemHealthy === null ? (isLoading ? text("CHECKING SYSTEM", "시스템 확인 중") : text("SYSTEM STATUS UNKNOWN", "시스템 상태 알 수 없음")) : systemHealthy ? text("SYSTEM NOMINAL", "시스템 정상") : text("ATTENTION REQUIRED", "확인 필요")}</strong>
            <small>{data?.system.deployment.environment ?? text("unknown", "알 수 없음")} · {data?.system.deployment.region ?? text("local", "로컬")}</small>
          </div>
        </div>
        <nav className="ops-nav" aria-label={text("Admin control center", "관리자 제어 센터")}>
          <span className="ops-nav-label">{text("COMMAND", "관리 메뉴")}</span>
          {sectionMeta.map((item) => {
            const Icon = item.icon;
            return (
              <button aria-current={section === item.id ? "page" : undefined} data-active={section === item.id} key={item.id} onClick={() => selectSection(item.id)} type="button">
                <Icon size={17} strokeWidth={1.4} />
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
                {item.id === "overview" && (data?.overview.action_summary?.unread ?? data?.overview.action_items.length ?? 0) > 0 ? (
                  <em className="ops-nav-alert-count">{data?.overview.action_summary?.unread ?? data?.overview.action_items.length}</em>
                ) : null}
                <ChevronRight size={14} />
              </button>
            );
          })}
        </nav>
        <div className="ops-rail-footer">
          <a href="/app"><ArrowLeft size={16} /><span>{text("Workspace", "워크스페이스")}</span></a>
          <button onClick={() => void logoutSession().finally(() => setAuthStatus("unauthenticated"))} type="button"><LogOut size={16} /><span>{text("Sign out", "로그아웃")}</span></button>
          <div className="ops-operator">
            <span className="sidebar-avatar">{currentUser?.avatar_url ? <img alt="" src={currentUser.avatar_url} /> : currentUser?.username.slice(0, 1).toUpperCase()}</span>
            <div><strong>{currentUser?.username}</strong><small>{text("SOLE ADMINISTRATOR", "시스템 관리자")}</small></div>
          </div>
        </div>
      </aside>

      <main className="ops-main">
        <header className="ops-topbar">
          <button aria-label={text("Open navigation", "탐색 메뉴 열기")} className="ops-mobile-menu" onClick={() => setIsMobileNavOpen(true)} type="button"><Menu size={19} /></button>
          <div className="ops-breadcrumb"><span>PROMTY / CONTROL</span><strong>{activeMeta.label.toUpperCase()}</strong></div>
          <label className="ops-search">
            <Search size={16} strokeWidth={1.5} />
            <input aria-label={text("Search current admin view", "현재 관리자 화면 검색")} onChange={(event) => {
              setSearchQuery(event.target.value);
              if (section in INITIAL_PAGE_OFFSETS) {
                setPageOffsets((current) => ({ ...current, [section]: 0 }));
              }
            }} placeholder={text(`Search ${activeMeta.label.toLowerCase()}…`, `${activeMeta.label} 검색…`)} ref={searchRef} type="search" value={searchQuery} />
            <kbd>/</kbd>
          </label>
          <div aria-label={text("Language", "언어")} className="ops-language-switch" role="group">
            <Languages aria-hidden="true" size={15} />
            <button aria-pressed={locale === "ko"} data-active={locale === "ko"} onClick={() => setLocale("ko")} type="button">한</button>
            <button aria-pressed={locale === "en"} data-active={locale === "en"} onClick={() => setLocale("en")} type="button">EN</button>
          </div>
          <button className="ops-refresh" disabled={isLoading} onClick={() => void loadData()} type="button">
            <RefreshCw className={isLoading ? "is-spinning" : undefined} size={16} /><span>{isLoading ? text("Syncing", "동기화 중") : text("Sync", "동기화")}</span>
          </button>
        </header>
        <div className="ops-status-strip">
          <span><CircleDot size={12} /> {data ? text("API READY", "API 정상") : text("API CHECKING", "API 확인 중")}</span>
          <span><Database size={12} /> {data ? `${data.system.database.dialect.toUpperCase()} ${text("ONLINE", "정상")}` : text("DATABASE CHECKING", "데이터베이스 확인 중")}</span>
          <span><ShieldCheck size={12} /> {text("ADMIN ID LOCKED", "관리자 ID 잠금")}</span>
          <span className="ops-status-time">{text("LAST SYNC", "최근 동기화")} {formatOptionalTimestamp(data?.overview.generated_at ?? null, text("PENDING", "대기 중"))}</span>
        </div>

        <div className="ops-content">
          <header className="ops-page-heading">
            <div><span>{text("OPERATIONS INTELLIGENCE", "운영 인텔리전스")}</span><h1>{activeMeta.label}</h1><p>{activeMeta.description}</p></div>
            <div className="ops-heading-facts"><span>{text("Scope", "범위")} <strong>{text("ALL DATA", "전체 데이터")}</strong></span><span>{text("Authority", "권한")} <strong>{text("ADMIN", "관리자")}</strong></span></div>
          </header>
          {notice ? <div className="ops-notice" role="status"><CheckCircle2 size={16} /><span>{notice}</span><button aria-label={text("Dismiss", "닫기")} onClick={() => setNotice(null)} type="button"><X size={15} /></button></div> : null}
          {errorMessage && data ? <div className="ops-error" role="alert"><AlertTriangle size={16} /><span>{errorMessage}</span></div> : null}
          {!data ? (
            <div className="ops-loading" data-error={!isLoading || undefined}>
              {isLoading ? <LoaderCircle className="is-spinning" size={20} /> : <AlertTriangle size={20} />}
              <span>{isLoading ? text("Building operational picture…", "운영 현황을 불러오는 중…") : errorMessage ?? text("The operational picture could not be loaded.", "운영 현황을 불러오지 못했습니다.")}</span>
              {!isLoading ? <button className="toolbar-button" onClick={() => void loadData()} type="button"><RefreshCw size={16} /> {text("Retry", "다시 시도")}</button> : null}
            </div>
          ) : (
            <AdminSectionContent
              currentAdmin={currentUser}
              data={data}
              auditOutcome={auditOutcome}
              auditResourceType={auditResourceType}
              expandedUserId={expandedUserId}
              jobFilter={jobFilter}
              onConfirm={(action) => { setConfirmationAction(action); setActionDetail(action.kind === "suspend-user" ? text("Administrative access suspension", "관리자에 의한 계정 접근 정지") : ""); }}
              onEditProject={setProjectEditor}
              onExpandUser={(id) => setExpandedUserId((current) => current === id ? null : id)}
              onAuditOutcome={(outcome) => {
                setAuditOutcome(outcome);
                setPageOffsets((current) => ({ ...current, audit: 0 }));
              }}
              onAuditResourceType={(resourceType) => {
                setAuditResourceType(resourceType);
                setPageOffsets((current) => ({ ...current, audit: 0 }));
              }}
              onJobFilter={(status) => {
                setJobFilter(status);
                setPageOffsets((current) => ({ ...current, operations: 0 }));
              }}
              onOpenActionItem={openActionItem}
              onUpdateActionItem={updateActionItem}
              onUpdateSupportInquiry={(inquiry, status) => void updateSupportStatus(inquiry, status)}
              onPageChange={(pagedSection, offset) => {
                setPageOffsets((current) => ({ ...current, [pagedSection]: offset }));
              }}
              onProjectSort={(value) => {
                setProjectSort(value);
                setPageOffsets((current) => ({ ...current, projects: 0 }));
              }}
              onProjectVisibility={(value) => {
                setProjectVisibility(value);
                setPageOffsets((current) => ({ ...current, projects: 0 }));
              }}
              onRefresh={() => void loadData()}
              searchQuery={searchQuery}
              section={section}
              projectSort={projectSort}
              projectVisibility={projectVisibility}
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
  auditOutcome,
  auditResourceType,
  currentAdmin,
  data,
  expandedUserId,
  jobFilter,
  onConfirm,
  onAuditOutcome,
  onAuditResourceType,
  onEditProject,
  onExpandUser,
  onJobFilter,
  onOpenActionItem,
  onUpdateActionItem,
  onUpdateSupportInquiry,
  onPageChange,
  onProjectSort,
  onProjectVisibility,
  onRefresh,
  searchQuery,
  section,
  projectSort,
  projectVisibility,
}: {
  auditOutcome: "all" | "error" | "success";
  auditResourceType: string;
  currentAdmin: AuthUser | null;
  data: AdminData;
  expandedUserId: string | null;
  jobFilter: string;
  onConfirm: (action: ConfirmationAction) => void;
  onAuditOutcome: (outcome: "all" | "error" | "success") => void;
  onAuditResourceType: (resourceType: string) => void;
  onEditProject: (editor: ProjectEditorState) => void;
  onExpandUser: (id: string) => void;
  onJobFilter: (status: string) => void;
  onOpenActionItem: (item: AdminOverview["action_items"][number]) => void;
  onUpdateActionItem: (
    item: AdminOverview["action_items"][number],
    state: "read" | "resolved" | "snoozed",
  ) => Promise<void> | void;
  onUpdateSupportInquiry: (
    inquiry: AdminSupportInquiry,
    status: AdminSupportInquiry["status"],
  ) => void;
  onPageChange: (section: PagedAdminSection, offset: number) => void;
  onProjectSort: (value: AdminProjectSort) => void;
  onProjectVisibility: (value: AdminProjectVisibility) => void;
  onRefresh: () => void;
  searchQuery: string;
  section: AdminSection;
  projectSort: AdminProjectSort;
  projectVisibility: AdminProjectVisibility;
}) {
  const { serverText, text } = useAdminLocale();
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const users = data.users.items;
  const projects = data.projects.items;
  const jobs = data.jobs.items;
  const events = data.events.items;
  const audit = data.audit.items;

  if (section === "overview") {
    return <AdminDashboard errorMessage={null} isLoading={false} onOpenActionItem={onOpenActionItem} onOpenProject={(projectId) => window.location.assign(projectHref({ id: projectId }))} onRefresh={onRefresh} onUpdateActionItem={onUpdateActionItem} overview={data.overview} />;
  }

  if (section === "marketing") {
    return <MarketingContentStudio />;
  }

  if (section === "users") {
    return (
      <section className="ops-panel">
        <PanelHeader detail={text(`${users.length} shown · ${data.users.total} total`, `${users.length}개 표시 · 전체 ${data.users.total}개`)} icon={Users} title={text("Identity inventory", "사용자 계정 현황")} />
        <div className="ops-data-table ops-users-table">
          <div className="ops-data-row is-head"><span>{text("Identity", "계정")}</span><span>{text("Access", "접근 권한")}</span><span>{text("Activity", "활동")}</span><span>{text("Footprint", "사용 현황")}</span><span /></div>
          {users.map((user) => (
            <div className="ops-user-record" key={user.id}>
              <button aria-expanded={expandedUserId === user.id} className="ops-data-row" onClick={() => onExpandUser(user.id)} type="button">
                <span className="ops-identity"><span className="sidebar-avatar">{user.avatar_url ? <img alt="" src={user.avatar_url} /> : user.username[0]?.toUpperCase()}</span><span><strong>{user.username}</strong><small>{user.email ?? `GitHub ${user.github_id}`}</small></span></span>
                <span><StatusBadge tone={statusTone(user.status)}>{user.status === "suspended" ? text("SUSPENDED", "정지") : text("ACTIVE", "활성")}</StatusBadge><small>{user.is_admin ? text("Administrator", "관리자") : user.github.connected ? text("GitHub connected", "GitHub 연결됨") : text("Member", "일반 사용자")}</small></span>
                <span><strong>{user.latest_activity_at ? formatRelativeTimestamp(user.latest_activity_at) : text("No activity", "활동 없음")}</strong><small>{text(`${formatCompactNumber(user.counts.events)} events`, `이벤트 ${formatCompactNumber(user.counts.events)}개`)}</small></span>
                <span><strong>{text(`${user.counts.projects} projects`, `프로젝트 ${user.counts.projects}개`)}</strong><small>{text(`${user.active_collector_tokens} active token${user.active_collector_tokens === 1 ? "" : "s"}`, `활성 토큰 ${user.active_collector_tokens}개`)}</small></span>
                <ChevronDown data-open={expandedUserId === user.id} size={15} />
              </button>
              {expandedUserId === user.id ? <UserControlDrawer onConfirm={onConfirm} user={user} /> : null}
            </div>
          ))}
          {users.length === 0 ? <EmptyData label={text("No users match this query.", "검색 조건에 맞는 사용자가 없습니다.")} /> : null}
        </div>
        <PaginationControls onPageChange={(offset) => onPageChange("users", offset)} page={data.users} />
      </section>
    );
  }

  if (section === "projects") {
    return (
      <section className="ops-panel">
        <div className="ops-section-toolbar"><PanelHeader detail={text(`${projects.length} shown · ${data.projects.total} total`, `${projects.length}개 표시 · 전체 ${data.projects.total}개`)} icon={FolderKanban} title={text("Project inventory", "프로젝트 현황")} /><button onClick={() => onEditProject({ mode: "create" })} type="button"><Plus size={14} /> {text("Create project", "프로젝트 생성")}</button></div>
        <div className="ops-project-filters">
          <label>{text("Visibility", "공개 범위")}<select onChange={(event) => onProjectVisibility(event.target.value as AdminProjectVisibility)} value={projectVisibility}><option value="all">{text("All projects", "전체 프로젝트")}</option><option value="public">{text("Public only", "공개만")}</option><option value="private">{text("Private only", "비공개만")}</option></select></label>
          <label>{text("Sort", "정렬")}<select onChange={(event) => onProjectSort(event.target.value as AdminProjectSort)} value={projectSort}><option value="popularity">{text("Weekly popularity", "주간 인기 점수")}</option><option value="views_7d">{text("Views · 7 days", "7일 조회수")}</option><option value="views">{text("Views · all time", "전체 조회수")}</option><option value="saves">{text("Saves", "저장수")}</option><option value="recent">{text("Recent activity", "최근 활동")}</option></select></label>
          <span>{text("Popularity = unique views × 2 + repeat views × 0.25 + new saves × 8", "인기 점수 = 고유 조회 × 2 + 반복 조회 × 0.25 + 신규 저장 × 8")}</span>
        </div>
        <div className="ops-data-table ops-project-table">
          <div className="ops-data-row is-head"><span>{text("Project", "프로젝트")}</span><span>{text("Owner", "소유자")}</span><span>{text("Reach", "조회")}</span><span>{text("Saves & popularity", "저장·인기")}</span><span>{text("AI activity", "AI 활동")}</span><span>{text("State", "상태")}</span><span>{text("Controls", "관리")}</span></div>
          {projects.map((project) => (
            <div className="ops-data-row" key={project.id}>
              <span><a className="ops-primary-link" href={projectHref(project)}><strong>{project.name}</strong><ExternalLink size={12} /></a><small>{project.slug}</small></span>
              <span><strong>{project.owner.username}</strong><small>{project.visibility}</small></span>
              <span><strong>{text(`${formatCompactNumber(project.view_count ?? 0)} total views`, `전체 조회 ${formatCompactNumber(project.view_count ?? 0)}회`)}</strong><small>{text(`${formatCompactNumber(project.views_7d ?? 0)} / 7d · ${formatCompactNumber(project.unique_viewers_7d ?? 0)} unique`, `7일 ${formatCompactNumber(project.views_7d ?? 0)}회 · 고유 ${formatCompactNumber(project.unique_viewers_7d ?? 0)}명`)}</small></span>
              <span><strong>{text(`${formatCompactNumber(project.save_count ?? 0)} saves`, `저장 ${formatCompactNumber(project.save_count ?? 0)}회`)}</strong><small>{text(`+${formatCompactNumber(project.saves_7d ?? 0)} / 7d · score ${formatCompactNumber(project.weekly_popularity_score ?? 0)}`, `7일 +${formatCompactNumber(project.saves_7d ?? 0)} · 점수 ${formatCompactNumber(project.weekly_popularity_score ?? 0)}`)}</small></span>
              <span><strong>{text(`${formatCompactNumber(project.prompt_count)} prompts · ${formatCompactNumber(project.memory_count)} summaries`, `프롬프트 ${formatCompactNumber(project.prompt_count)}개 · 요약 ${formatCompactNumber(project.memory_count)}개`)}</strong><small>{text(`${formatCompactNumber(project.event_count)} events`, `이벤트 ${formatCompactNumber(project.event_count)}개`)}</small></span>
              <span><StatusBadge tone={project.failed_jobs > 0 ? "danger" : project.github_connected ? "success" : "warning"}>{project.failed_jobs > 0 ? text(`${project.failed_jobs} FAILED`, `${project.failed_jobs}개 실패`) : project.github_connected ? text("CONNECTED", "연결됨") : text("NO REPO", "저장소 없음")}</StatusBadge></span>
              <span className="ops-row-actions">
                <button aria-label={text(`Edit ${project.name}`, `${project.name} 수정`)} onClick={() => onEditProject({ mode: "edit", project })} title={text("Edit", "수정")} type="button"><Pencil size={13} /></button>
                <button aria-label={text(`Export ${project.name}`, `${project.name} 내보내기`)} onClick={() => onConfirm({ kind: "export-project", project })} title={text("Export", "내보내기")} type="button"><Download size={13} /></button>
                <button aria-label={text(`Delete ${project.name}`, `${project.name} 삭제`)} className="is-danger" onClick={() => onConfirm({ kind: "delete-project", project })} title={text("Delete", "삭제")} type="button"><Trash2 size={13} /></button>
              </span>
            </div>
          ))}
          {projects.length === 0 ? <EmptyData label={text("No projects match this query.", "검색 조건에 맞는 프로젝트가 없습니다.")} /> : null}
        </div>
        <PaginationControls onPageChange={(offset) => onPageChange("projects", offset)} page={data.projects} />
      </section>
    );
  }

  if (section === "support") {
    return (
      <section className="ops-panel">
        <PanelHeader
          detail={text(`${data.support.total} inquiries`, `문의 ${data.support.total}개`)}
          icon={MessageSquareText}
          title={text("Support inbox", "고객 문의함")}
        />
        <div className="ops-support-list">
          {data.support.items.map((inquiry) => (
            <article className="ops-support-card" data-status={inquiry.status} key={inquiry.id}>
              <header>
                <div>
                  <span>{inquiry.category} · {formatOptionalTimestamp(inquiry.created_at, text("Unknown", "알 수 없음"))}</span>
                  <h3>{inquiry.subject}</h3>
                  <small>{inquiry.requester_username} · <a href={`mailto:${inquiry.requester_email}`}>{inquiry.requester_email}</a></small>
                </div>
                <StatusBadge tone={inquiry.status === "resolved" ? "success" : inquiry.status === "in_progress" ? "warning" : "danger"}>
                  {inquiry.status === "in_progress" ? text("IN PROGRESS", "처리 중") : inquiry.status === "resolved" ? text("RESOLVED", "해결") : text("NEW", "신규")}
                </StatusBadge>
              </header>
              <p>{inquiry.message}</p>
              {inquiry.notification_status === "failed" ? <div className="ops-support-delivery-error"><AlertTriangle size={14} /> {inquiry.notification_error ?? text("Email notification failed.", "이메일 알림 전송에 실패했습니다.")}</div> : null}
              <footer>
                <a href={`mailto:${inquiry.requester_email}?subject=${encodeURIComponent(`[Promty] ${inquiry.subject}`)}`}>{text("Reply by email", "이메일 답장")}</a>
                {inquiry.status !== "in_progress" ? <button onClick={() => onUpdateSupportInquiry(inquiry, "in_progress")} type="button">{text("Start work", "처리 시작")}</button> : null}
                {inquiry.status !== "resolved" ? <button className="is-primary" onClick={() => onUpdateSupportInquiry(inquiry, "resolved")} type="button">{text("Mark resolved", "해결 처리")}</button> : <button onClick={() => onUpdateSupportInquiry(inquiry, "new")} type="button">{text("Reopen", "다시 열기")}</button>}
              </footer>
            </article>
          ))}
          {data.support.items.length === 0 ? <EmptyData label={text("No support inquiries yet.", "아직 접수된 문의가 없습니다.")} /> : null}
        </div>
        <PaginationControls onPageChange={(offset) => onPageChange("support", offset)} page={data.support} />
      </section>
    );
  }

  if (section === "operations") {
    const statuses = ["all", "pending", "running", "failed", "succeeded", "superseded", "stale"] as const;
    return (
      <div className="ops-section-stack">
        <div className="ops-mini-metrics">
          <MiniMetric icon={Activity} label={text("Running", "실행 중")} value={data.overview.metrics.running_jobs} />
          <MiniMetric icon={Clock3} label={text("Pending", "대기 중")} value={data.overview.metrics.pending_jobs} />
          <MiniMetric danger icon={AlertTriangle} label={text("Failed", "실패")} value={data.overview.metrics.failed_jobs} />
          <MiniMetric danger icon={FileClock} label={text("Stale", "지연")} value={data.overview.metrics.stale_jobs} />
        </div>
        <section className="ops-panel">
          <PanelHeader detail={text(`${jobs.length} shown · ${data.jobs.total} total`, `${jobs.length}개 표시 · 전체 ${data.jobs.total}개`)} icon={Boxes} title={text("Memory generation jobs", "메모리 생성 작업")} />
          <div className="ops-filter-bar">{statuses.map((status) => <button data-active={jobFilter === status} key={status} onClick={() => onJobFilter(status)} type="button">{{ all: text("ALL", "전체"), pending: text("PENDING", "대기"), running: text("RUNNING", "실행 중"), failed: text("FAILED", "실패"), succeeded: text("SUCCEEDED", "성공"), superseded: text("SUPERSEDED", "대체됨"), stale: text("STALE", "지연") }[status]}</button>)}</div>
          <div className="ops-data-table ops-job-table">
            <div className="ops-data-row is-head"><span>{text("Status", "상태")}</span><span>{text("Project", "프로젝트")}</span><span>{text("Generator", "생성기")}</span><span>{text("Result", "결과")}</span><span>{text("Updated", "수정 시각")}</span><span>{text("Controls", "관리")}</span></div>
            {jobs.map((job) => (
              <div className="ops-job-record" key={job.id}>
                <div className="ops-data-row" title={job.error ?? undefined}>
                  <span><StatusBadge tone={statusTone(job.status, job.stale)}>{job.stale ? text("STALE", "지연") : job.status.toUpperCase()}</StatusBadge><small>{text(`attempt ${job.attempt_count}`, `${job.attempt_count}회 시도`)}</small></span>
                  <span><strong>{job.project.name}</strong><small>{job.owner.username}</small></span>
                  <span><strong>{job.generator}</strong><small>{job.id.slice(0, 8)}</small></span>
                  <span><strong>{job.result_status ?? job.reason}</strong><small>{job.error ?? job.error_code ?? text("No error detail", "오류 상세 없음")}</small></span>
                  <span><strong>{job.updated_at ? formatRelativeTimestamp(job.updated_at) : text("Unknown", "알 수 없음")}</strong><small>{formatOptionalTimestamp(job.updated_at, text("Unknown", "알 수 없음"))}</small></span>
                  <span className="ops-row-actions">
                    <button aria-expanded={expandedJobId === job.id} onClick={() => setExpandedJobId((current) => current === job.id ? null : job.id)} title={text("View incident detail", "장애 상세 보기")} type="button"><ChevronDown data-open={expandedJobId === job.id} size={13} /></button>
                    <button disabled={!job.cancellable} onClick={() => onConfirm({ job, kind: "cancel-job" })} title={text("Cancel", "취소")} type="button"><X size={13} /></button>
                    <button disabled={!job.retryable} onClick={() => onConfirm({ job, kind: "retry-job" })} title={text("Safe retry", "안전하게 재시도")} type="button"><RotateCcw size={13} /></button>
                  </span>
                </div>
                {expandedJobId === job.id ? (
                  <div className="ops-job-detail">
                    <dl>
                      <div><dt>{text("Job ID", "작업 ID")}</dt><dd><code>{job.id}</code></dd></div>
                      <div><dt>{text("Session", "세션")}</dt><dd><code>{job.session_id ?? text("Not linked", "연결 없음")}</code></dd></div>
                      <div><dt>{text("Created", "생성 시각")}</dt><dd>{formatOptionalTimestamp(job.created_at, text("Unknown", "알 수 없음"))}</dd></div>
                      <div><dt>{text("Lease expires", "작업 임대 만료")}</dt><dd>{formatOptionalTimestamp(job.lease_expires_at, text("Not leased", "임대 없음"))}</dd></div>
                      <div><dt>{text("Completed", "완료 시각")}</dt><dd>{formatOptionalTimestamp(job.completed_at, text("Not completed", "완료 안 됨"))}</dd></div>
                      <div><dt>{text("Error code", "오류 코드")}</dt><dd><code>{job.error_code ?? text("None", "없음")}</code></dd></div>
                    </dl>
                    <div className="ops-job-error"><strong>{text("Provider result", "공급자 결과")}</strong><pre>{job.error ?? job.result_status ?? text("No provider error was recorded.", "기록된 공급자 오류가 없습니다.")}</pre></div>
                    <aside className="ops-job-runbook">
                      <strong>{text("Recommended response", "권장 대응 절차")}</strong>
                      <ol>
                        <li>{text("Confirm provider configuration and current system status.", "공급자 설정과 현재 시스템 상태를 확인합니다.")}</li>
                        <li>{job.stale ? text("Cancel the stale lease before starting replacement work.", "대체 작업을 시작하기 전에 지연된 임대를 취소합니다.") : text("Review the error code and affected project context.", "오류 코드와 영향받은 프로젝트 컨텍스트를 확인합니다.")}</li>
                        <li>{job.retryable ? text("This job is marked safe to retry.", "이 작업은 안전하게 재시도할 수 있습니다.") : text("Do not retry automatically; correct the cause or create a new generation request.", "자동 재시도하지 말고 원인을 수정하거나 새 생성 요청을 만듭니다.")}</li>
                      </ol>
                      <a href="/admin?section=system">{text("Open system telemetry", "시스템 상태 열기")} <ExternalLink size={12} /></a>
                    </aside>
                  </div>
                ) : null}
              </div>
            ))}
            {jobs.length === 0 ? <EmptyData label={text("No memory jobs match this view.", "이 조건에 맞는 메모리 작업이 없습니다.")} /> : null}
          </div>
          <PaginationControls onPageChange={(offset) => onPageChange("operations", offset)} page={data.jobs} />
        </section>
      </div>
    );
  }

  if (section === "activity") {
    return (
      <section className="ops-panel">
        <div className="ops-section-toolbar">
          <PanelHeader detail={text(`${events.length} loaded · ${data.events.total} total${data.events.search_truncated ? " · search window limited" : ""}`, `${events.length}개 로드 · 전체 ${data.events.total}개${data.events.search_truncated ? " · 검색 범위 제한됨" : ""}`)} icon={Activity} title={text("Decrypted event stream", "복호화된 이벤트 내역")} />
          <button onClick={() => onConfirm({ expected: currentAdmin?.username ?? "", kind: "export-events", query: searchQuery })} type="button"><FileJson size={14} /> {text("Export matching JSON", "검색 결과 JSON 내보내기")}</button>
        </div>
        <div className="ops-data-table ops-event-table">
          <div className="ops-data-row is-head"><span>{text("Event", "이벤트")}</span><span>{text("Project", "프로젝트")}</span><span>{text("Owner", "소유자")}</span><span>{text("Session", "세션")}</span><span>{text("Timestamp", "발생 시각")}</span><span /></div>
          {events.map((event) => (
            <div className="ops-event-record" key={event.id}>
              <button aria-expanded={expandedEventId === event.id} className="ops-data-row" onClick={() => setExpandedEventId((current) => current === event.id ? null : event.id)} type="button">
                <span><strong>{event.event_type}</strong><small>{event.tool} · {text("seq", "순번")} {event.sequence}</small></span>
                <span><strong>{event.project.name}</strong><small>{event.project.slug}</small></span>
                <span><strong>{event.owner.username}</strong><small>{event.id.slice(0, 8)}</small></span>
                <span><strong>{event.session_id.slice(0, 8)}</strong><small>{text("schema", "스키마")} v{event.schema_version}</small></span>
                <span><strong>{event.created_at ? formatRelativeTimestamp(event.created_at) : text("Unknown", "알 수 없음")}</strong><small>{formatOptionalTimestamp(event.created_at, text("Unknown", "알 수 없음"))}</small></span>
                <ChevronDown data-open={expandedEventId === event.id} size={15} />
              </button>
              {expandedEventId === event.id ? <pre className="ops-event-detail">{JSON.stringify(event.payload, null, 2)}</pre> : null}
            </div>
          ))}
          {events.length === 0 ? <EmptyData label={text("No events match this query.", "검색 조건에 맞는 이벤트가 없습니다.")} /> : null}
        </div>
        <PaginationControls onPageChange={(offset) => onPageChange("activity", offset)} page={data.events} />
      </section>
    );
  }

  if (section === "system") return <SystemSection system={data.system} />;

  if (section === "security") {
    const securedUsers = users;
    return (
      <div className="ops-security-grid">
        <section className="ops-panel">
          <PanelHeader detail={text(`${data.overview.risks.length} findings`, `발견 항목 ${data.overview.risks.length}개`)} icon={ShieldAlert} title={text("Risk register", "위험 항목")} />
          <div className="ops-risk-register">
            {data.overview.risks.map((risk) => (
              <div data-acknowledged={risk.acknowledged || undefined} data-severity={risk.severity} key={risk.key}>
                <AlertTriangle size={16} />
                <span>
                  <strong>{serverText(risk.title)}</strong>
                  <small>{serverText(risk.detail)}</small>
                  {risk.acknowledged ? <small className="ops-risk-acknowledged">{text(`Acknowledged by ${risk.acknowledged_by ?? "administrator"} · ${formatOptionalTimestamp(risk.acknowledged_at, "")}`, `${risk.acknowledged_by ?? "관리자"} 확인 · ${formatOptionalTimestamp(risk.acknowledged_at, "")}`)}</small> : null}
                </span>
                <div className="ops-risk-actions">
                  <StatusBadge tone={risk.acknowledged ? "success" : risk.severity === "high" ? "danger" : risk.severity === "medium" ? "warning" : "neutral"}>{risk.acknowledged ? text("ACKNOWLEDGED", "확인됨") : risk.severity === "high" ? text("HIGH", "높음") : risk.severity === "medium" ? text("MEDIUM", "중간") : text("INFO", "정보")}</StatusBadge>
                  <button onClick={() => onConfirm({ expected: currentAdmin?.username ?? "", kind: risk.acknowledged ? "clear-risk-acknowledgement" : "acknowledge-risk", risk })} type="button">{risk.acknowledged ? text("Clear", "해제") : text("Acknowledge", "확인")}</button>
                </div>
              </div>
            ))}
            {data.overview.risks.length === 0 ? <EmptyData label={text("No active configuration risks.", "현재 활성화된 설정 위험이 없습니다.")} /> : null}
          </div>
        </section>
        <section className="ops-panel">
          <PanelHeader detail={text("Enforced controls", "적용 중인 보안 제어")} icon={ShieldCheck} title={text("Security posture", "보안 상태")} />
          <dl className="ops-posture-list">
            <div><dt>{text("Administrator model", "관리자 모델")}</dt><dd>{text("Single GitHub numeric ID", "단일 GitHub 숫자 ID")}</dd></div>
            <div><dt>{text("Session cookie", "세션 쿠키")}</dt><dd>{data.overview.system.session_cookie_secure ? text("Secure", "보안 적용") : text("Development mode", "개발 모드")}</dd></div>
            <div><dt>{text("SameSite policy", "SameSite 정책")}</dt><dd>{data.overview.system.session_cookie_samesite}</dd></div>
            <div><dt>{text("Admin rate limit", "관리자 요청 제한")}</dt><dd>{data.overview.system.admin_rate_limit.requests} / {data.overview.system.admin_rate_limit.window_seconds}s</dd></div>
            <div><dt>{text("Audit retention", "감사 로그 보존")}</dt><dd>{text(`${data.overview.system.admin_audit_retention_days} days`, `${data.overview.system.admin_audit_retention_days}일`)}</dd></div>
            <div><dt>{text("Allowed origins", "허용 출처")}</dt><dd>{data.overview.system.cors_origins.length}</dd></div>
          </dl>
        </section>
        <section className="ops-panel is-wide">
          <PanelHeader detail={text(`${securedUsers.length} shown · ${data.users.total} total identities`, `${securedUsers.length}개 표시 · 전체 계정 ${data.users.total}개`)} icon={KeyRound} title={text("Credential control", "인증 정보 관리")} />
          <div className="ops-security-users">
            {securedUsers.map((user) => <div key={user.id}><span><strong>{user.username}</strong><small>{user.email ?? user.github_id}</small></span><span><strong>{text(`${user.active_collector_tokens} collector tokens`, `수집기 토큰 ${user.active_collector_tokens}개`)}</strong><small>{user.status === "suspended" ? text("Access suspended", "접근 정지") : user.github.connected ? text("GitHub linked", "GitHub 연결됨") : text("GitHub not linked", "GitHub 연결 안 됨")}</small></span><span className="ops-inline-actions"><button disabled={user.active_collector_tokens === 0} onClick={() => onConfirm({ kind: "revoke-all-tokens", user })} type="button">{text("Revoke tokens", "토큰 폐기")}</button><button disabled={!user.github.connected} onClick={() => onConfirm({ kind: "disconnect-github", user })} type="button">{text("Disconnect GitHub", "GitHub 연결 해제")}</button></span></div>)}
            {securedUsers.length === 0 ? <EmptyData label={text("No credential-bearing identities match this query.", "검색 조건에 맞는 인증 정보 보유 계정이 없습니다.")} /> : null}
          </div>
          <PaginationControls onPageChange={(offset) => onPageChange("security", offset)} page={data.users} />
        </section>
      </div>
    );
  }

  return (
    <section className="ops-panel">
      <PanelHeader detail={text(`${audit.length} shown · ${data.audit.total} total`, `${audit.length}개 표시 · 전체 ${data.audit.total}개`)} icon={FileClock} title={text("Administrator audit trail", "관리자 감사 기록")} />
      <div className="ops-audit-filters">
        <div className="ops-filter-bar">
          {(["all", "success", "error"] as const).map((outcome) => <button data-active={auditOutcome === outcome} key={outcome} onClick={() => onAuditOutcome(outcome)} type="button">{{ all: text("ALL", "전체"), success: text("SUCCESS", "성공"), error: text("ERROR", "오류") }[outcome]}</button>)}
        </div>
        <label>{text("Resource", "리소스")}<select onChange={(event) => onAuditResourceType(event.target.value)} value={auditResourceType}><option value="all">{text("All resources", "전체 리소스")}</option><option value="user">{text("Users", "사용자")}</option><option value="project">{text("Projects", "프로젝트")}</option><option value="memory_job">{text("Jobs", "작업")}</option><option value="risk">{text("Risks", "위험 항목")}</option><option value="admin_console">{text("Admin console", "관리자 콘솔")}</option></select></label>
      </div>
      <div className="ops-data-table ops-audit-table">
        <div className="ops-data-row is-head"><span>{text("Action", "작업")}</span><span>{text("Actor", "실행자")}</span><span>{text("Resource", "리소스")}</span><span>{text("Request", "요청")}</span><span>{text("Timestamp", "발생 시각")}</span></div>
        {audit.map((item) => <div className="ops-data-row" key={item.id}><span><strong>{item.action}</strong><small>{item.id.slice(0, 8)}</small></span><span><strong>{item.actor.username}</strong><small>GitHub {item.actor.github_id}</small></span><span><strong>{item.resource_type ?? "admin_console"}</strong><small>{item.resource_id ?? text("global", "전체")}</small></span><span><StatusBadge tone={item.status_code < 400 ? "success" : "danger"}>{item.request_method} {item.status_code}</StatusBadge><small>{item.request_path}</small></span><span><strong>{item.created_at ? formatRelativeTimestamp(item.created_at) : text("Unknown", "알 수 없음")}</strong><small>{formatOptionalTimestamp(item.created_at, text("Unknown", "알 수 없음"))}</small></span></div>)}
        {audit.length === 0 ? <EmptyData label={text("No audit entries match this query.", "검색 조건에 맞는 감사 기록이 없습니다.")} /> : null}
      </div>
      <PaginationControls onPageChange={(offset) => onPageChange("audit", offset)} page={data.audit} />
    </section>
  );
}

function UserControlDrawer({ onConfirm, user }: { onConfirm: (action: ConfirmationAction) => void; user: AdminUser }) {
  const { text } = useAdminLocale();
  const locked = user.is_admin;
  return (
    <div className="ops-user-drawer">
      <div className="ops-user-facts">
        <span><small>{text("USER ID", "사용자 ID")}</small><code>{user.id}</code></span>
        <span><small>GITHUB ID</small><code>{user.github_id}</code></span>
        <span><small>{text("CREATED", "생성일")}</small><strong>{formatOptionalTimestamp(user.created_at, text("Unknown", "알 수 없음"))}</strong></span>
        <span><small>{text("STATUS", "상태")}</small><strong>{user.status === "suspended" ? text("SUSPENDED", "정지") : text("ACTIVE", "활성")}</strong></span>
      </div>
      {user.suspension_reason ? <div className="ops-suspension-note"><ShieldAlert size={14} /><span><strong>{text("Suspended", "정지됨")} {formatOptionalTimestamp(user.suspended_at, "")}</strong><small>{user.suspension_reason}</small></span></div> : null}
      <div className="ops-credential-block">
        <div className="ops-credential-heading"><span><KeyRound size={15} /> {text("Collector tokens", "수집기 토큰")}</span><span className="ops-inline-actions"><button disabled={user.status === "suspended"} onClick={() => onConfirm({ kind: "issue-token", user })} type="button">{text("Issue token", "토큰 발급")}</button><button disabled={user.active_collector_tokens === 0} onClick={() => onConfirm({ kind: "revoke-all-tokens", user })} type="button">{text("Revoke all", "모두 폐기")}</button></span></div>
        {user.collector_tokens.map((token) => <div className="ops-token-row" key={token.id}><span className="admin-state-dot" data-on={token.status === "active"} /><span><strong>{token.name}</strong><small>{token.collector_version ?? text("Unknown version", "버전 알 수 없음")} · {text("last used", "최근 사용")} {formatOptionalTimestamp(token.last_used_at, text("never", "사용 기록 없음"))}</small></span><code>{token.id.slice(0, 8)}</code><button disabled={token.status === "revoked"} onClick={() => onConfirm({ kind: "revoke-token", tokenId: token.id, tokenName: token.name, user })} type="button">{token.status === "revoked" ? text("Revoked", "폐기됨") : text("Revoke", "폐기")}</button></div>)}
        {user.collector_tokens.length === 0 ? <EmptyData label={text("No collector tokens issued.", "발급된 수집기 토큰이 없습니다.")} /> : null}
      </div>
      <div className="ops-credential-block">
        <div className="ops-credential-heading"><span><GitBranch size={15} /> {text("GitHub repository access", "GitHub 저장소 접근")}</span><button disabled={!user.github.connected} onClick={() => onConfirm({ kind: "disconnect-github", user })} type="button">{text("Disconnect", "연결 해제")}</button></div>
        <div className="ops-github-state"><StatusBadge tone={user.github.connected ? "success" : "neutral"}>{user.github.connected ? text("CONNECTED", "연결됨") : text("NOT CONNECTED", "연결 안 됨")}</StatusBadge><span>{user.github.scopes.length ? user.github.scopes.join(" · ") : text("No active scopes", "활성 권한 범위 없음")}</span><small>{text("Updated", "수정일")} {formatOptionalTimestamp(user.github.updated_at, text("never", "기록 없음"))}</small></div>
      </div>
      <div className="ops-account-controls">
        <span><ShieldAlert size={15} /><span><strong>{text("Account lifecycle", "계정 수명 주기")}</strong><small>{text("The sole administrator account is permanently protected.", "유일한 관리자 계정은 영구적으로 보호됩니다.")}</small></span></span>
        <div className="ops-inline-actions">
          {user.status === "suspended" ? <button disabled={locked} onClick={() => onConfirm({ kind: "restore-user", user })} type="button"><RotateCcw size={13} /> {text("Restore", "복구")}</button> : <button disabled={locked} onClick={() => onConfirm({ kind: "suspend-user", user })} type="button"><ShieldAlert size={13} /> {text("Suspend", "정지")}</button>}
          <button className="is-danger" disabled={locked} onClick={() => onConfirm({ kind: "delete-user", user })} type="button"><Trash2 size={13} /> {text("Delete user + data", "사용자 및 데이터 삭제")}</button>
        </div>
      </div>
    </div>
  );
}

function SystemSection({ system }: { system: AdminSystem }) {
  const { text } = useAdminLocale();
  return (
    <div className="ops-system-grid">
      <section className="ops-panel"><PanelHeader detail={text("Process", "프로세스")} icon={Server} title={text("Runtime", "런타임")} /><dl className="ops-posture-list"><div><dt>{text("Environment", "환경")}</dt><dd>{system.deployment.environment}</dd></div><div><dt>{text("Region", "리전")}</dt><dd>{system.deployment.region ?? text("local", "로컬")}</dd></div><div><dt>{text("Release", "릴리스")}</dt><dd><code>{system.deployment.release_sha?.slice(0, 12) ?? text("unversioned", "버전 없음")}</code></dd></div><div><dt>{text("Uptime", "가동 시간")}</dt><dd>{Math.floor(system.runtime.uptime_seconds / 60).toLocaleString()} {text("min", "분")}</dd></div><div><dt>Python</dt><dd>{system.runtime.python}</dd></div><div><dt>{text("Platform", "플랫폼")}</dt><dd title={system.runtime.platform}>{system.runtime.platform}</dd></div></dl></section>
      <section className="ops-panel"><PanelHeader detail={system.database.dialect} icon={Database} title={text("Database", "데이터베이스")} /><dl className="ops-posture-list"><div><dt>{text("Migration", "마이그레이션")}</dt><dd><code>{system.database.migration ?? "n/a"}</code></dd></div><div><dt>{text("Total size", "전체 크기")}</dt><dd>{formatBytes(system.database.size_bytes)}</dd></div><div><dt>{text("Pool", "연결 풀")}</dt><dd title={system.database.pool}>{system.database.pool}</dd></div>{Object.entries(system.database.connections).map(([key, value]) => <div key={key}><dt>{text("Connections", "연결")} · {key}</dt><dd>{value}</dd></div>)}</dl></section>
      <section className="ops-panel"><PanelHeader detail={system.worker.status} icon={Bot} title={text("Worker & providers", "워커 및 공급자")} /><dl className="ops-posture-list"><div><dt>{text("Pending batches", "대기 배치")}</dt><dd>{system.worker.pending_batches}</dd></div><div><dt>{text("Running batches", "실행 배치")}</dt><dd>{system.worker.running_batches}</dd></div><div><dt>OpenAI</dt><dd>{system.providers.openai.configured ? system.providers.openai.model : text("Not configured", "설정 안 됨")}</dd></div><div><dt>Gemini</dt><dd>{system.providers.gemini.configured ? system.providers.gemini.model : text("Not configured", "설정 안 됨")}</dd></div><div><dt>{text("Billing telemetry", "결제 사용량 정보")}</dt><dd>{system.providers.real_billing_available ? text("Available", "사용 가능") : text("Not connected", "연결 안 됨")}</dd></div></dl></section>
      <section className="ops-panel is-wide"><PanelHeader detail={text(`${system.database.table_sizes.length} largest relations`, `상위 테이블 ${system.database.table_sizes.length}개`)} icon={Boxes} title={text("Database footprint", "데이터베이스 사용량")} /><div className="ops-table-sizes">{system.database.table_sizes.map((table) => <div key={table.name}><span><strong>{table.name}</strong><small>PostgreSQL relation</small></span><code>{formatBytes(table.size_bytes)}</code></div>)}{system.database.table_sizes.length === 0 ? <EmptyData label={text("Table sizing is available on PostgreSQL.", "테이블 크기는 PostgreSQL에서 확인할 수 있습니다.")} /> : null}</div></section>
    </div>
  );
}

function ProjectEditorDialog({ editor, isMutating, onCancel, onSave, users }: { editor: ProjectEditorState; isMutating: boolean; onCancel: () => void; onSave: (payload: AdminProjectFormPayload) => void; users: AdminUser[] }) {
  const { text } = useAdminLocale();
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
        <header><span><FolderKanban size={17} /> {text("PROJECT CONTROL", "프로젝트 관리")}</span><button aria-label={text("Close", "닫기")} onClick={onCancel} type="button"><X size={16} /></button></header>
        <div className="ops-editor-title"><h2>{project ? text(`Edit ${project.name}`, `${project.name} 수정`) : text("Create project", "프로젝트 생성")}</h2><p>{project ? text("Update project identity, repository metadata, and visibility.", "프로젝트 정보, 저장소 메타데이터 및 공개 범위를 수정합니다.") : text("Create a project for any identity in the system.", "시스템의 사용자 계정에 프로젝트를 생성합니다.")}</p></div>
        <div className="ops-form-grid">
          <label>{text("Owner", "소유자")}<select disabled={Boolean(project)} onChange={(event) => setOwnerId(event.target.value)} value={ownerId}>{users.map((user) => <option key={user.id} value={user.id}>{user.username}{user.status === "suspended" ? text(" · suspended", " · 정지됨") : ""}</option>)}</select></label>
          <label>{text("Name", "이름")}<input onChange={(event) => setName(event.target.value)} value={name} /></label>
          <label>Slug<input onChange={(event) => setSlug(event.target.value)} placeholder="generated-from-name" value={slug} /></label>
          <label>{text("Default branch", "기본 브랜치")}<input onChange={(event) => setDefaultBranch(event.target.value)} value={defaultBranch} /></label>
          <label className="is-wide">{text("Description", "설명")}<textarea onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label>
          <label>GitHub URL<input onChange={(event) => setGithubUrl(event.target.value)} placeholder="https://github.com/…" type="url" value={githubUrl} /></label>
          <label>Project URL<input onChange={(event) => setProjectUrl(event.target.value)} placeholder="https://…" type="url" value={projectUrl} /></label>
          <label>{text("Visibility", "공개 범위")}<select onChange={(event) => setVisibility(event.target.value as "private" | "public")} value={visibility}><option value="private">{text("Private", "비공개")}</option><option value="public">{text("Public", "공개")}</option></select></label>
          <label>{text("Tags", "태그")}<input onChange={(event) => setTags(event.target.value)} placeholder="ai, backend, product" value={tags} /></label>
          <label className="is-wide">{text("Type", "확인을 위해")} <strong>{expected}</strong>{text(" to confirm", " 입력")}<input onChange={(event) => setConfirmation(event.target.value)} spellCheck="false" value={confirmation} /></label>
        </div>
        <div className="ops-confirm-actions"><button disabled={isMutating} onClick={onCancel} type="button">{text("Cancel", "취소")}</button><button disabled={!valid || isMutating} onClick={() => onSave({ confirmation, default_branch: defaultBranch.trim(), description: description.trim() || null, github_url: githubUrl.trim() || null, name: name.trim(), owner_id: project ? undefined : ownerId, project_url: projectUrl.trim() || null, slug: slug.trim() || null, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), visibility })} type="button">{isMutating ? <LoaderCircle className="is-spinning" size={14} /> : project ? <Pencil size={14} /> : <Plus size={14} />}{project ? text("Save project", "프로젝트 저장") : text("Create project", "프로젝트 생성")}</button></div>
      </section>
    </div>
  );
}

function ConfirmationDialog({ action, actionDetail, confirmationValue, isMutating, onCancel, onChange, onConfirm, onDetailChange }: { action: ConfirmationAction; actionDetail: string; confirmationValue: string; isMutating: boolean; onCancel: () => void; onChange: (value: string) => void; onConfirm: () => void; onDetailChange: (value: string) => void }) {
  const { text } = useAdminLocale();
  const expected = actionExpected(action);
  const config: Record<ConfirmationAction["kind"], [string, string]> = {
    "acknowledge-risk": [text("Acknowledge operational risk", "운영 위험 확인"), text("The risk remains active, but your acknowledgement and timestamp will be recorded in the administrator audit trail.", "위험은 계속 활성 상태로 남지만 확인한 관리자와 시각이 감사 로그에 기록됩니다.")],
    "cancel-job": [text("Cancel memory job", "메모리 작업 취소"), text("Running provider work may still finish externally, but its database result will be invalidated.", "외부 공급자의 실행은 완료될 수 있지만 데이터베이스 결과는 무효화됩니다.")],
    "clear-risk-acknowledgement": [text("Clear risk acknowledgement", "위험 확인 상태 해제"), text("The risk will return to the unacknowledged queue and this change will be recorded in the administrator audit trail.", "위험 항목이 미확인 상태로 돌아가며 변경 내용이 관리자 감사 로그에 기록됩니다.")],
    "delete-project": [text("Delete project and all data", "프로젝트 및 모든 데이터 삭제"), text("Sessions, events, artifacts, jobs, and repository metadata will be permanently deleted.", "세션, 이벤트, 산출물, 작업 및 저장소 메타데이터가 영구 삭제됩니다.")],
    "delete-user": [text("Delete user and all owned data", "사용자 및 소유 데이터 삭제"), text("This permanently deletes the identity, projects, events, artifacts, credentials, and connections.", "계정, 프로젝트, 이벤트, 산출물, 인증 정보 및 연결을 영구 삭제합니다.")],
    "disconnect-github": [text("Disconnect GitHub access", "GitHub 접근 연결 해제"), text("Repository browsing stops until the user authorizes GitHub again.", "사용자가 GitHub를 다시 승인할 때까지 저장소 탐색이 중단됩니다.")],
    "export-events": [text("Export matching events", "검색 이벤트 내보내기"), text("The JSON download contains decrypted event payloads and must be handled as sensitive data.", "JSON 파일에는 복호화된 이벤트 내용이 포함되므로 민감 정보로 취급해야 합니다.")],
    "export-project": [text("Export project data", "프로젝트 데이터 내보내기"), text("The JSON download includes decrypted event payloads, sessions, and generated artifacts.", "JSON 파일에는 복호화된 이벤트, 세션 및 생성 산출물이 포함됩니다.")],
    "issue-token": [text("Issue collector token", "수집기 토큰 발급"), text("The token secret is shown exactly once after creation.", "토큰 비밀값은 생성 직후 한 번만 표시됩니다.")],
    "restore-user": [text("Restore user access", "사용자 접근 복구"), text("Web sessions and active collector tokens can be used again.", "웹 세션과 활성 수집기 토큰을 다시 사용할 수 있습니다.")],
    "retry-job": [text("Retry memory job", "메모리 작업 재시도"), text("Only jobs cancelled before provider work began are eligible for safe retry.", "공급자 작업 시작 전에 취소된 작업만 안전하게 재시도할 수 있습니다.")],
    "revoke-all-tokens": [text("Revoke every collector token", "모든 수집기 토큰 폐기"), text("Affected collectors stop ingesting immediately and must be reauthorized.", "해당 수집기는 즉시 수집을 중단하며 다시 승인해야 합니다.")],
    "revoke-token": [text("Revoke collector token", "수집기 토큰 폐기"), text("The affected collector stops ingesting immediately.", "해당 수집기는 즉시 수집을 중단합니다.")],
    "suspend-user": [text("Suspend all user access", "모든 사용자 접근 정지"), text("Web sessions and collector ingestion are blocked until the account is restored.", "계정이 복구될 때까지 웹 세션과 수집기 입력이 차단됩니다.")],
  };
  const [title, detail] = config[action.kind];
  const detailValid = action.kind !== "suspend-user" || actionDetail.trim().length >= 3;
  return (
    <div className="ops-modal-backdrop">
      <section aria-labelledby="ops-confirm-title" aria-modal="true" className="ops-confirm-dialog" role="dialog">
        <div className="ops-confirm-icon"><ShieldAlert size={20} /></div>
        <div><span>{text("PRIVILEGED ADMIN ACTION", "관리자 권한 작업")}</span><h2 id="ops-confirm-title">{title}</h2><p>{detail}</p></div>
        {action.kind === "issue-token" ? <label>{text("Token name", "토큰 이름")}<input autoFocus onChange={(event) => onDetailChange(event.target.value)} placeholder={text("Admin-issued collector", "관리자 발급 수집기")} value={actionDetail} /></label> : null}
        {action.kind === "suspend-user" ? <label>{text("Suspension reason", "정지 사유")}<textarea autoFocus onChange={(event) => onDetailChange(event.target.value)} rows={3} value={actionDetail} /></label> : null}
        <label>{text("Type", "확인을 위해")} <strong>{expected}</strong>{text(" to confirm", " 입력")}<input autoFocus={action.kind !== "issue-token" && action.kind !== "suspend-user"} onChange={(event) => onChange(event.target.value)} spellCheck="false" value={confirmationValue} /></label>
        <div className="ops-confirm-actions"><button disabled={isMutating} onClick={onCancel} type="button">{text("Cancel", "취소")}</button><button className={action.kind.startsWith("delete") || action.kind === "suspend-user" ? "is-danger" : undefined} disabled={isMutating || confirmationValue !== expected || !detailValid} onClick={onConfirm} type="button">{isMutating ? <LoaderCircle className="is-spinning" size={15} /> : <ShieldAlert size={15} />} {text("Confirm action", "작업 확인")}</button></div>
      </section>
    </div>
  );
}

function IssuedTokenDialog({ issued, onClose }: { issued: IssuedToken; onClose: () => void }) {
  const { text } = useAdminLocale();
  const [copied, setCopied] = useState(false);
  return (
    <div className="ops-modal-backdrop">
      <section aria-modal="true" className="ops-secret-dialog" role="dialog">
        <KeyRound size={22} /><span>{text("ONE-TIME SECRET", "일회성 비밀값")}</span><h2>{text("Collector token issued", "수집기 토큰이 발급되었습니다")}</h2><p>{text("Copy this token now. It cannot be recovered after this dialog closes.", "지금 토큰을 복사하세요. 이 창을 닫으면 다시 확인할 수 없습니다.")}</p>
        <label>{issued.name} · {issued.username}<textarea readOnly rows={5} value={issued.token} /></label>
        <div className="ops-confirm-actions"><button onClick={() => void navigator.clipboard.writeText(issued.token).then(() => setCopied(true))} type="button"><Copy size={14} /> {copied ? text("Copied", "복사됨") : text("Copy token", "토큰 복사")}</button><button onClick={onClose} type="button">{text("I saved it", "저장했습니다")}</button></div>
      </section>
    </div>
  );
}

function PaginationControls({
  onPageChange,
  page,
}: {
  onPageChange: (offset: number) => void;
  page: { items: unknown[]; limit: number; offset: number; total: number };
}) {
  const { text } = useAdminLocale();
  if (page.total <= page.limit) return null;
  const start = page.total === 0 ? 0 : page.offset + 1;
  const end = Math.min(page.offset + page.items.length, page.total);
  const currentPage = Math.floor(page.offset / page.limit) + 1;
  const totalPages = Math.ceil(page.total / page.limit);
  return (
    <nav aria-label={text("Pagination", "페이지 이동")} className="ops-pagination">
      <span>{text(`${start}–${end} of ${page.total}`, `전체 ${page.total}개 중 ${start}–${end}`)}</span>
      <strong>{text(`Page ${currentPage} of ${totalPages}`, `${currentPage} / ${totalPages} 페이지`)}</strong>
      <div>
        <button disabled={page.offset === 0} onClick={() => onPageChange(Math.max(0, page.offset - page.limit))} type="button">{text("Previous", "이전")}</button>
        <button disabled={page.offset + page.limit >= page.total} onClick={() => onPageChange(page.offset + page.limit)} type="button">{text("Next", "다음")}</button>
      </div>
    </nav>
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
