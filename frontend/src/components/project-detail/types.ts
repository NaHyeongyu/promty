import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";

export type ProjectDetailTabId = "overview" | "memory" | "ai-activity" | "files";

export type ProjectDetailTab = {
  id: ProjectDetailTabId;
  label: string;
};

export type ActivityViewId = "prompts" | "sessions";

export type ActivityNavigationState = {
  selectedPromptId: string | null;
  selectedSessionId: string | null;
  selectedSessionPromptId: string | null;
  view: ActivityViewId;
};

export type ProjectHeaderProps = {
  isBookmarked?: boolean;
  isBookmarkUpdating?: boolean;
  isLoading?: boolean;
  isShareCopied?: boolean;
  lastActivityLabel?: string;
  modelNames?: string[];
  name: string;
  onOpenAllProjects?: () => void;
  onConnectRepository?: () => void;
  onProjectSelect?: (projectId: string) => void;
  onShareProject?: () => void;
  onToggleBookmark?: () => void;
  projectOptions?: ProjectHeaderProjectOption[];
  repositoryStatus?: string;
  repositoryUrl?: string;
  selectedProjectId?: string;
};

export type ProjectDetailProject = ProjectHeaderProps & {
  description: string;
  id: string;
  isBookmarked: boolean;
  slug?: string;
  tags: string[];
  visibility?: "private" | "public";
};

export type ProjectHeaderProjectOption = {
  id: string;
  latestUpdatedAt?: string;
  name: string;
};

export type OverviewItem = {
  title: string;
  value: string;
  description?: string;
  href?: string;
  actions?: string[];
};

export type ProjectCommunityFlow = {
  fileCount: number;
  id: string;
  promptCount: number;
  publishedAt: string | null;
  slug: string;
  status: string;
  summary?: string | null;
  title: string;
  updatedAt: string | null;
  visibility: string;
};

export type ProjectCommunityStatus = {
  draftFlows: number;
  latestFlowAt: string | null;
  publishedFlows: number;
  recentFlows: ProjectCommunityFlow[];
  totalFlows: number;
};

export type ProjectMemoryArtifactVersion = {
  changedFileCount: number;
  changedFiles: Array<{
    additions?: number | null;
    deletions?: number | null;
    path: string;
    status?: string | null;
  }>;
  commitSha: string | null;
  createdAt: string | null;
  draftConfidence: number | null;
  draftGenerator: string | null;
  draftType: string | null;
  endSequence: number | null;
  fallbackReason: string | null;
  generator: string | null;
  id: string;
  memoryScope: ProjectMemoryScope | null;
  model: string | null;
  needsUserVerification: boolean | null;
  outcome: string | null;
  promptCount: number | null;
  reason: string | null;
  requestedGenerator: string | null;
  sections: Array<{
    summary: string;
    title: string;
  }>;
  sessionId: string | null;
  sliceIndex: number | null;
  startSequence: number | null;
  summary: string | null;
  suggestedUserAction: string | null;
  tags: string[];
  technologies: string[];
  title: string;
  version: number;
  windowReason: string | null;
};

export type ProjectMemoryArtifactStage =
  | "generated_memory"
  | "memory_draft"
  | "project_memory"
  | "verified_memory";

export type ProjectMemoryReviewState =
  | "draft"
  | "edited"
  | "generated"
  | "ignored"
  | "saved"
  | "verified";

export type ProjectMemoryScope = "draft" | "generated" | "project" | "verified";

export type ProjectMemoryArtifact = {
  artifactStage: ProjectMemoryArtifactStage | null;
  changedFileCount: number;
  changedFiles: Array<{
    additions?: number | null;
    deletions?: number | null;
    path: string;
    status?: string | null;
  }>;
  commitSha: string | null;
  createdAt: string | null;
  draftConfidence: number | null;
  draftGenerator: string | null;
  draftType: string | null;
  endSequence: number | null;
  fallbackReason: string | null;
  firstEventAt: string | null;
  generator: string | null;
  id: string;
  lastEventAt: string | null;
  memoryScope: ProjectMemoryScope | null;
  model: string | null;
  needsUserVerification: boolean | null;
  outcome: string | null;
  promptCount: number | null;
  reason: string | null;
  reviewState: ProjectMemoryReviewState | null;
  requestedGenerator: string | null;
  sections: Array<{
    summary: string;
    title: string;
  }>;
  sessionId: string | null;
  sliceIndex: number | null;
  startSequence: number | null;
  summary: string | null;
  summaryLevel: number | null;
  suggestedUserAction: string | null;
  tags: string[];
  technologies: string[];
  title: string;
  triggerReason: string | null;
  updatedAt: string | null;
  versions: ProjectMemoryArtifactVersion[];
  whyItMatters: string | null;
  windowReason: string | null;
};

export type ProjectMemorySnapshot = {
  bodyMarkdown: string;
  confidence: number | null;
  sections: {
    coreWorkflow: string[];
    currentDirection: string;
    importantDecisions: Array<{
      decision: string;
      reason: string;
      sourceMemoryIds: string[];
    }>;
    instructionsForFutureAiAgents: string[];
    openQuestions: string[];
    productGoal: string;
    rejectedDirections: Array<{
      direction: string;
      reason: string;
      sourceMemoryIds: string[];
    }>;
    technicalAssumptions: string[];
  };
  sourceMemoryIds: string[];
  warnings: string[];
};

export type ProjectMemoryStatus = {
  drafts: ProjectMemoryArtifact[];
  latestArtifactAt: string | null;
  pendingRanges: ProjectMemoryPendingRange[];
  projectMemory: ProjectMemorySnapshot | null;
  projectMemoryArtifact: ProjectMemoryArtifact | null;
  recentArtifacts: ProjectMemoryArtifact[];
  totalArtifacts: number;
};

export type ProjectMemoryPendingRange = {
  canCheckpoint: boolean;
  endSequence: number;
  eventCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  promptCount: number;
  sessionId: string;
  startSequence: number;
  tool: string;
};

export type ActivityItem = {
  id: string;
  model: string;
  startedAt: string;
  lastActivity: string;
  prompts: number;
  responses: number;
  events: number;
  filesChanged: number;
};

export type PromptFileChange = {
  additions: number | null;
  binary?: boolean;
  deletions: number | null;
  oldPath?: string | null;
  patch?: string | null;
  patchOmittedReason?: string | null;
  patchTruncated?: boolean;
  path: string;
  status: string;
};

export type PromptActivityItem = {
  fileChanges: PromptFileChange[];
  filesChanged: number;
  id: string;
  model: string;
  prompt: string;
  promptOriginalLength?: number | null;
  promptStorageLimit?: number | null;
  promptTruncated?: boolean;
  response?: string | null;
  responseOriginalLength?: number | null;
  responseReceivedAt?: string | null;
  responseSource?: string | null;
  responseStorageLimit?: number | null;
  responseTruncated?: boolean;
  sequence: number;
  sessionId: string;
  submittedAt: string;
};

export type PromptActivityPage = {
  cursor: string | null;
  hasMore: boolean;
  items: PromptActivityItem[];
  limit: number;
  nextCursor: string | null;
  query: string | null;
  scanned?: number;
  sessionId: string | null;
  total: number | null;
};

export type FileTreeNode = {
  name: string;
  path?: string;
  type: "folder" | "file";
  children?: FileTreeNode[];
};

export type RepositoryFileContent = {
  branch?: string;
  content?: string | null;
  htmlUrl?: string | null;
  message?: string | null;
  name?: string;
  path?: string;
  repository?: string;
  size?: number | null;
  status?: string;
};

export type EmptyStateProps = {
  icon?: ComponentType<LucideProps>;
  title: string;
  description: string;
  children?: ReactNode;
};

export type ProjectDetailData = {
  activities: ActivityItem[];
  community: ProjectCommunityStatus;
  files: FileTreeNode[];
  memory: ProjectMemoryStatus;
  overview: OverviewItem[];
  promptActivities: PromptActivityItem[];
  project: ProjectDetailProject;
  repositoryFileContent?: RepositoryFileContent | null;
  repositoryFileContentError?: string;
  repositoryFileContentLoading?: boolean;
  repositoryFileSelectedPath?: string | null;
  repositoryFiles: FileTreeNode[];
  repositoryFilesConnectUrl?: string;
  repositoryFilesLoading?: boolean;
  repositoryFilesMessage?: string;
  repositoryFilesRepository?: string;
  repositoryFilesStatus?: string;
  repositoryFilesTruncated?: boolean;
};

export type PromptFlowUpdatePayload = {
  context_summary?: string | null;
  notes?: string | null;
  status?: "archived" | "draft" | "published";
  summary?: string | null;
  tags?: string[];
  title?: string;
  visibility?: "private" | "public" | "unlisted";
};

export type PublishedFlowAsset = {
  alt_text?: string | null;
  byte_size: number;
  content_type: string;
  created_at: string | null;
  file_name: string;
  id: string;
  markdown: string;
  sha256: string;
  url: string;
};

export type PublishedFlowDetail = {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
  visibility: string;
  status: string;
  prompt_count: number;
  file_count: number;
  assets?: PublishedFlowAsset[];
};
