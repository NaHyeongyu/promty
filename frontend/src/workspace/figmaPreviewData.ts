import type {
  ProjectDetailData,
  ProjectMemoryArtifact,
} from "../components/project-detail";
import type { Project } from "./types";

export const FIGMA_MOCK_PROJECT_ID = "7ec7f56d-9024-4c72-8b62-e5c8709f1ba1";

const projectSeeds: Array<{
  id: string;
  name: string;
  slug: string;
  createdTimestamp: string;
  latestTimestamp: string;
  latestUpdatedAt: string;
  latestActivityLabel: string;
  sessions: number;
  events: number;
  filesChanged: number;
  prompts: number;
  trackedFiles: number;
  models: string[];
  tags: string[];
  memoryCount: number;
  pendingMemoryCount: number;
  latestMemoryAt: string;
  isBookmarked: boolean;
  visibility: "private" | "public";
  githubUrl?: string;
  projectUrl?: string;
}> = [
  {
    id: FIGMA_MOCK_PROJECT_ID,
    name: "Promty Web Platform",
    slug: "promty-web-platform",
    createdTimestamp: "2026-05-12T02:20:00Z",
    latestTimestamp: "2026-07-18T05:42:00Z",
    latestUpdatedAt: "Jul 18, 2026, 3:42 PM",
    latestActivityLabel: "8 minutes ago",
    sessions: 38,
    events: 1248,
    filesChanged: 286,
    prompts: 412,
    trackedFiles: 148,
    models: ["gpt-5", "claude-sonnet-4", "gemini-2.5-pro"],
    tags: ["product", "react", "fastapi"],
    memoryCount: 26,
    pendingMemoryCount: 3,
    latestMemoryAt: "2026-07-18T05:36:00Z",
    isBookmarked: true,
    visibility: "private",
    githubUrl: "https://github.com/nahg0525/PromptHub",
    projectUrl: "https://promty.ai",
  },
  {
    id: "bd2d153b-fda3-4a23-985f-0116f2432f61",
    name: "Promty Collector SDK",
    slug: "promty-collector-sdk",
    createdTimestamp: "2026-05-19T08:10:00Z",
    latestTimestamp: "2026-07-18T03:18:00Z",
    latestUpdatedAt: "Jul 18, 2026, 1:18 PM",
    latestActivityLabel: "2 hours ago",
    sessions: 24,
    events: 886,
    filesChanged: 194,
    prompts: 267,
    trackedFiles: 83,
    models: ["claude-sonnet-4", "gpt-5"],
    tags: ["python", "cli", "collector"],
    memoryCount: 18,
    pendingMemoryCount: 1,
    latestMemoryAt: "2026-07-18T03:05:00Z",
    isBookmarked: true,
    visibility: "private",
    githubUrl: "https://github.com/nahg0525/promty-collector",
  },
  {
    id: "2a732e93-6e44-4aba-aebb-641f330834e2",
    name: "Memory Engine & API",
    slug: "memory-engine-api",
    createdTimestamp: "2026-05-22T01:00:00Z",
    latestTimestamp: "2026-07-17T10:42:00Z",
    latestUpdatedAt: "Jul 17, 2026, 8:42 PM",
    latestActivityLabel: "yesterday",
    sessions: 31,
    events: 1034,
    filesChanged: 221,
    prompts: 346,
    trackedFiles: 112,
    models: ["gpt-5", "gemini-2.5-pro"],
    tags: ["memory", "api", "postgres"],
    memoryCount: 22,
    pendingMemoryCount: 0,
    latestMemoryAt: "2026-07-17T10:35:00Z",
    isBookmarked: true,
    visibility: "private",
    githubUrl: "https://github.com/nahg0525/promty-api",
  },
  {
    id: "420b824c-0698-4d34-ada2-69f75ca93730",
    name: "Community Launch",
    slug: "community-launch",
    createdTimestamp: "2026-06-10T04:30:00Z",
    latestTimestamp: "2026-07-16T07:08:00Z",
    latestUpdatedAt: "Jul 16, 2026, 5:08 PM",
    latestActivityLabel: "2 days ago",
    sessions: 17,
    events: 482,
    filesChanged: 96,
    prompts: 153,
    trackedFiles: 57,
    models: ["claude-sonnet-4", "gpt-5"],
    tags: ["community", "sharing", "analytics"],
    memoryCount: 11,
    pendingMemoryCount: 2,
    latestMemoryAt: "2026-07-16T06:56:00Z",
    isBookmarked: true,
    visibility: "public",
    githubUrl: "https://github.com/nahg0525/promty-community",
  },
  {
    id: "0be0fd53-e224-4537-9413-740e0a81ddc6",
    name: "Marketing Automation",
    slug: "marketing-automation",
    createdTimestamp: "2026-06-24T06:15:00Z",
    latestTimestamp: "2026-07-15T02:46:00Z",
    latestUpdatedAt: "Jul 15, 2026, 12:46 PM",
    latestActivityLabel: "3 days ago",
    sessions: 12,
    events: 339,
    filesChanged: 71,
    prompts: 118,
    trackedFiles: 42,
    models: ["gpt-5", "claude-sonnet-4"],
    tags: ["content", "social", "automation"],
    memoryCount: 8,
    pendingMemoryCount: 0,
    latestMemoryAt: "2026-07-15T02:38:00Z",
    isBookmarked: false,
    visibility: "private",
    githubUrl: "https://github.com/nahg0525/promty-marketing",
  },
  {
    id: "281a7a15-e5a5-498c-9511-67d5e406447c",
    name: "Docs & Onboarding",
    slug: "docs-onboarding",
    createdTimestamp: "2026-06-30T03:00:00Z",
    latestTimestamp: "2026-07-13T09:20:00Z",
    latestUpdatedAt: "Jul 13, 2026, 7:20 PM",
    latestActivityLabel: "5 days ago",
    sessions: 9,
    events: 211,
    filesChanged: 48,
    prompts: 76,
    trackedFiles: 29,
    models: ["gemini-2.5-pro", "gpt-5"],
    tags: ["docs", "onboarding", "mcp"],
    memoryCount: 6,
    pendingMemoryCount: 1,
    latestMemoryAt: "2026-07-13T09:12:00Z",
    isBookmarked: false,
    visibility: "public",
    githubUrl: "https://github.com/nahg0525/promty-docs",
  },
];

export function figmaMockProjects(): Project[] {
  return projectSeeds.map((seed) => ({ ...seed }));
}

function memoryArtifact(
  overrides: Partial<ProjectMemoryArtifact> & Pick<ProjectMemoryArtifact, "id" | "title">,
): ProjectMemoryArtifact {
  const { id, title, ...rest } = overrides;
  return {
    artifactStage: "verified_memory",
    changedFileCount: 4,
    changedFiles: [],
    commitSha: null,
    createdAt: "Jul 18, 2026, 3:36 PM",
    draftConfidence: null,
    draftGenerator: null,
    draftType: null,
    endSequence: null,
    fallbackReason: null,
    firstEventAt: "2026-07-18T03:10:00Z",
    generator: "promty-memory",
    id,
    lastEventAt: "2026-07-18T05:36:00Z",
    memoryBatchId: "batch-2026-07-18",
    memoryBatchIds: ["batch-2026-07-18"],
    memoryScope: "verified",
    model: "gpt-5",
    needsUserVerification: false,
    outcome: null,
    promptCount: 18,
    reason: null,
    reviewState: "verified",
    requestedGenerator: "promty-memory",
    sections: [],
    sessionId: null,
    sourceDraftIds: [],
    sourceSessionIds: ["session-auth", "session-memory"],
    sliceIndex: null,
    startSequence: null,
    summary: null,
    summaryLevel: 0,
    suggestedUserAction: null,
    tags: ["product", "architecture"],
    technologies: ["React", "TypeScript", "FastAPI"],
    title,
    triggerReason: "session_complete",
    updatedAt: "Jul 18, 2026, 3:36 PM",
    versions: [],
    whyItMatters: null,
    windowReason: "session_complete",
    ...rest,
  };
}

const currentProjectMemory = memoryArtifact({
  artifactStage: "project_memory",
  changedFileCount: 286,
  changedFiles: [
    { additions: 284, deletions: 41, path: "frontend/src/AuthenticatedApp.tsx", status: "modified" },
    { additions: 196, deletions: 32, path: "frontend/src/components/project-detail/MemoryPanel.tsx", status: "modified" },
    { additions: 152, deletions: 18, path: "backend/app/services/memory/project_memory.py", status: "modified" },
    { additions: 88, deletions: 12, path: "collector/src/mcp_server.py", status: "modified" },
  ],
  commitSha: "c3e8a91",
  id: "figma-project-memory",
  memoryScope: "project",
  outcome: "# Promty product memory\n\nPromty is the shared memory layer for AI-assisted software work. It turns sessions from Codex, Claude Code, Gemini CLI, and other coding agents into a durable project record that the next agent can immediately use.\n\n## Product direction\n\n- Capture decisions, constraints, and implementation context automatically.\n- Keep generated memory reviewable and traceable to sessions and changed files.\n- Make the approved project memory available to every supported coding agent.\n- Preserve the complete content in the UI instead of truncating important details.\n\n## Current release scope\n\nThe MVP includes project dashboards, generated and verified memory, prompt and session activity, repository browsing, public project sharing, community discovery, support, admin monitoring, and collector health.\n\n## Operating constraints\n\nSecurity and privacy are product requirements. Private project content stays private by default, public sharing is explicit, and every generated memory must retain provenance.",
  promptCount: 412,
  reviewState: "verified",
  sourceSessionIds: ["session-auth", "session-memory", "session-community", "session-mvp"],
  summary: "Approved product direction, architecture decisions, MVP scope, and operating constraints.",
  summaryLevel: 2,
  tags: ["product", "architecture", "mvp", "security"],
  title: "Promty product and architecture context",
  whyItMatters: "Every coding agent can continue from the same verified decisions without reconstructing context.",
});

const verifiedMemories = [
  memoryArtifact({
    changedFileCount: 14,
    changedFiles: [
      { additions: 132, deletions: 18, path: "frontend/src/components/project-detail/MemoryPanel.tsx", status: "modified" },
      { additions: 64, deletions: 11, path: "frontend/src/components/project-detail/project-memory.css", status: "modified" },
    ],
    id: "figma-memory-detail-ux",
    outcome: "Memory cards show useful summaries while the detail view preserves the full document, provenance, source sessions, and changed files.",
    promptCount: 27,
    summary: "Removed content truncation and made long-term memory fully inspectable.",
    tags: ["memory", "ux"],
    title: "Show complete memory content without ellipsis",
    whyItMatters: "Users can trust that no implementation constraint is silently hidden.",
  }),
  memoryArtifact({
    changedFileCount: 22,
    id: "figma-auth-security",
    outcome: "Web sessions now use secure cookie-backed authentication with rate limiting, security headers, and explicit OAuth state validation.",
    promptCount: 41,
    summary: "Hardened authentication, sessions, OAuth state, and API boundaries for launch.",
    tags: ["security", "auth", "oauth"],
    title: "Launch-ready authentication and session security",
  }),
  memoryArtifact({
    changedFileCount: 18,
    id: "figma-community",
    outcome: "Public projects include view analytics, popularity ranking, saves, owner profiles, and explicit visibility controls.",
    promptCount: 33,
    summary: "Completed the community discovery and public project sharing model.",
    tags: ["community", "analytics"],
    title: "Community discovery and public project analytics",
  }),
  memoryArtifact({
    changedFileCount: 11,
    id: "figma-marketing",
    outcome: "The marketing content studio prepares Korean and English social posts with reusable channel templates and a review-before-publish workflow.",
    promptCount: 24,
    summary: "Designed a bilingual, approval-based social content automation workflow.",
    tags: ["marketing", "automation"],
    title: "Bilingual social content automation",
  }),
];

export function figmaMockProjectDetail(project: Project): ProjectDetailData {
  return {
    activities: [
      { id: "session-mvp", label: "MVP launch readiness", model: "gpt-5", startedAt: "Today 2:48 PM", lastActivity: "Today 3:42 PM", prompts: 18, responses: 18, events: 64, filesChanged: 21 },
      { id: "session-memory", label: "Project memory UX", model: "claude-sonnet-4", startedAt: "Today 10:12 AM", lastActivity: "Today 12:04 PM", prompts: 27, responses: 26, events: 92, filesChanged: 14 },
      { id: "session-auth", label: "Security hardening", model: "gpt-5", startedAt: "Yesterday 1:20 PM", lastActivity: "Yesterday 5:36 PM", prompts: 41, responses: 41, events: 137, filesChanged: 22 },
      { id: "session-community", label: "Community analytics", model: "gemini-2.5-pro", startedAt: "Jul 16, 9:14 AM", lastActivity: "Jul 16, 1:08 PM", prompts: 33, responses: 32, events: 118, filesChanged: 18 },
      { id: "session-marketing", label: "Social automation", model: "claude-sonnet-4", startedAt: "Jul 15, 8:40 AM", lastActivity: "Jul 15, 11:46 AM", prompts: 24, responses: 24, events: 84, filesChanged: 11 },
    ],
    community: {
      draftFlows: 2,
      latestFlowAt: "Jul 18, 2026, 1:22 PM",
      publishedFlows: 7,
      recentFlows: [
        { fileCount: 6, id: "flow-memory-review", promptCount: 12, publishedAt: "Jul 18, 2026, 1:22 PM", slug: "memory-review-workflow", status: "published", summary: "Generate, review, and approve durable project memory.", title: "Project memory review workflow", updatedAt: "Jul 18, 2026, 1:22 PM", visibility: "public" },
        { fileCount: 4, id: "flow-launch-check", promptCount: 9, publishedAt: "Jul 17, 2026, 4:10 PM", slug: "mvp-launch-checklist", status: "published", summary: "Audit product, security, analytics, and deployment readiness.", title: "MVP launch readiness audit", updatedAt: "Jul 17, 2026, 4:10 PM", visibility: "public" },
      ],
      totalFlows: 9,
    },
    files: [
      { name: "frontend", type: "folder", children: [
        { name: "src", type: "folder", children: [
          { name: "AuthenticatedApp.tsx", path: "frontend/src/AuthenticatedApp.tsx", type: "file" },
          { name: "components", type: "folder", children: [
            { name: "project-detail", type: "folder", children: [
              { name: "MemoryPanel.tsx", path: "frontend/src/components/project-detail/MemoryPanel.tsx", type: "file" },
              { name: "OverviewStatistics.tsx", path: "frontend/src/components/project-detail/OverviewStatistics.tsx", type: "file" },
            ] },
          ] },
        ] },
      ] },
      { name: "backend", type: "folder", children: [
        { name: "app", type: "folder", children: [
          { name: "services", type: "folder", children: [
            { name: "memory", type: "folder", children: [
              { name: "project_memory.py", path: "backend/app/services/memory/project_memory.py", type: "file" },
              { name: "workflows.py", path: "backend/app/services/memory/workflows.py", type: "file" },
            ] },
          ] },
        ] },
      ] },
      { name: "collector", type: "folder", children: [
        { name: "src", type: "folder", children: [
          { name: "mcp_server.py", path: "collector/src/mcp_server.py", type: "file" },
          { name: "uploader", type: "folder", children: [
            { name: "client.py", path: "collector/src/uploader/client.py", type: "file" },
          ] },
        ] },
      ] },
    ],
    filesTotal: 148,
    filesTruncated: false,
    memory: {
      drafts: [
        memoryArtifact({ artifactStage: "memory_draft", draftConfidence: 0.94, id: "draft-mvp-readiness", memoryScope: "draft", needsUserVerification: true, reviewState: "generated", summary: "Deployment checks, support notifications, and launch monitoring are ready for final review.", title: "MVP readiness and launch operations" }),
        memoryArtifact({ artifactStage: "memory_draft", draftConfidence: 0.88, id: "draft-faq", memoryScope: "draft", needsUserVerification: true, reviewState: "generated", summary: "FAQ and inquiry workflows now route new customer messages to the owner email.", title: "Support inbox and FAQ workflow" }),
      ],
      latestArtifactAt: "2026-07-18T05:36:00Z",
      pendingRanges: [
        { canCheckpoint: true, changedFileCount: 9, draftId: "pending-1", endSequence: 1248, eventCount: 42, fileChangeEventCount: 16, firstEventAt: "2026-07-18T04:48:00Z", lastEventAt: "2026-07-18T05:42:00Z", promptCount: 12, responseCount: 12, sessionId: "session-mvp", startSequence: 1207, tool: "codex" },
      ],
      recentArtifacts: [currentProjectMemory, ...verifiedMemories],
      totalArtifacts: 26,
    },
    metricHistory: [
      { date: "Jul 5", sessions: 1, prompts: 9, filesChanged: 4, memories: 0 },
      { date: "Jul 6", sessions: 2, prompts: 16, filesChanged: 8, memories: 1 },
      { date: "Jul 7", sessions: 1, prompts: 11, filesChanged: 6, memories: 0 },
      { date: "Jul 8", sessions: 3, prompts: 28, filesChanged: 17, memories: 1 },
      { date: "Jul 9", sessions: 2, prompts: 21, filesChanged: 9, memories: 0 },
      { date: "Jul 10", sessions: 4, prompts: 36, filesChanged: 22, memories: 1 },
      { date: "Jul 11", sessions: 2, prompts: 19, filesChanged: 12, memories: 0 },
      { date: "Jul 12", sessions: 1, prompts: 8, filesChanged: 3, memories: 1 },
      { date: "Jul 13", sessions: 3, prompts: 31, filesChanged: 18, memories: 0 },
      { date: "Jul 14", sessions: 2, prompts: 23, filesChanged: 11, memories: 1 },
      { date: "Jul 15", sessions: 3, prompts: 34, filesChanged: 16, memories: 0 },
      { date: "Jul 16", sessions: 4, prompts: 45, filesChanged: 24, memories: 1 },
      { date: "Jul 17", sessions: 3, prompts: 41, filesChanged: 22, memories: 1 },
      { date: "Jul 18", sessions: 5, prompts: 52, filesChanged: 29, memories: 2 },
    ],
    overview: [
      { title: "Repository URL", value: "github.com/nahg0525/PromptHub", href: "https://github.com/nahg0525/PromptHub" },
      { title: "Project URL", value: "promty.ai", href: "https://promty.ai" },
      { title: "Description", value: "Shared memory and observability workspace for AI-assisted software development." },
      { title: "Visibility", value: "Private" },
      { title: "AI Models", value: "gpt-5, claude-sonnet-4, gemini-2.5-pro" },
      { title: "Activities", value: "1.2K" },
      { title: "Sessions", value: "38" },
      { title: "Sessions Added", value: "+5 this week" },
      { title: "Prompts", value: "412" },
      { title: "Prompts Added", value: "+96 this week" },
      { title: "Files Changed Added", value: "+74 this week" },
      { title: "Created", value: "May 12, 2026", description: "2 months ago" },
      { title: "Last Activity", value: "Jul 18, 2026", description: "8 minutes ago" },
      { title: "Repository Connected", value: "Connected", description: "main branch" },
    ],
    promptActivities: [
      { id: "prompt-412", sessionId: "session-mvp", sequence: 1248, model: "gpt-5", prompt: "Audit the MVP launch path and identify anything that could block production release.", response: "Reviewed authentication, deployment, support alerts, analytics, and collector health. No blocking issue remains; the final checklist is documented in project memory.", submittedAt: "Today 3:31 PM", responseReceivedAt: "Today 3:36 PM", responseSource: "assistant", filesChanged: 9, fileChanges: [{ path: "README.md", oldPath: null, status: "modified", additions: 28, deletions: 4 }, { path: "docs/aws-github-deployment.md", oldPath: null, status: "modified", additions: 44, deletions: 8 }] },
      { id: "prompt-401", sessionId: "session-memory", sequence: 1202, model: "claude-sonnet-4", prompt: "Make the complete memory visible in the detail experience and keep provenance easy to inspect.", response: "Updated the project memory document and history detail so long content is preserved, with source sessions and changed files still available.", submittedAt: "Today 11:18 AM", responseReceivedAt: "Today 11:25 AM", responseSource: "assistant", filesChanged: 6, fileChanges: [{ path: "frontend/src/components/project-detail/MemoryPanel.tsx", oldPath: null, status: "modified", additions: 132, deletions: 18 }] },
      { id: "prompt-388", sessionId: "session-auth", sequence: 1138, model: "gpt-5", prompt: "Harden web authentication and OAuth for launch without breaking the collector workflow.", response: "Added secure web sessions, OAuth state validation, security headers, and targeted rate limits while preserving token-based collector authentication.", submittedAt: "Yesterday 2:02 PM", responseReceivedAt: "Yesterday 2:16 PM", responseSource: "assistant", filesChanged: 12, fileChanges: [{ path: "backend/app/api/auth.py", oldPath: null, status: "modified", additions: 96, deletions: 21 }] },
    ],
    project: {
      defaultBranch: "main",
      description: "Shared memory and observability workspace for AI-assisted software development.",
      id: project.id,
      isBookmarked: true,
      lastActivityLabel: "8 minutes ago",
      modelNames: project.models,
      name: project.name,
      projectUrl: project.projectUrl,
      repositoryStatus: "Connected to GitHub",
      repositoryUrl: project.githubUrl,
      slug: project.slug,
      tags: project.tags,
      visibility: "private",
    },
    repositoryFiles: [
      { name: ".github", type: "folder", children: [{ name: "workflows", type: "folder", children: [{ name: "aws-deploy.yml", path: ".github/workflows/aws-deploy.yml", type: "file" }] }] },
      { name: "backend", type: "folder", children: [{ name: "app", type: "folder", children: [{ name: "main.py", path: "backend/app/main.py", type: "file" }, { name: "api", type: "folder", children: [{ name: "projects.py", path: "backend/app/api/projects.py", type: "file" }, { name: "memory.py", path: "backend/app/api/memory.py", type: "file" }] }] }] },
      { name: "collector", type: "folder", children: [{ name: "src", type: "folder", children: [{ name: "mcp_server.py", path: "collector/src/mcp_server.py", type: "file" }, { name: "cli.py", path: "collector/src/cli.py", type: "file" }] }] },
      { name: "frontend", type: "folder", children: [{ name: "src", type: "folder", children: [{ name: "AuthenticatedApp.tsx", path: "frontend/src/AuthenticatedApp.tsx", type: "file" }, { name: "components", type: "folder", children: [{ name: "project-detail", type: "folder", children: [{ name: "MemoryPanel.tsx", path: "frontend/src/components/project-detail/MemoryPanel.tsx", type: "file" }] }] }] }] },
      { name: "README.md", path: "README.md", type: "file" },
    ],
    repositoryFilesRepository: "nahg0525/PromptHub · main",
    repositoryFilesStatus: "connected",
    repositoryFilesTruncated: false,
  };
}
