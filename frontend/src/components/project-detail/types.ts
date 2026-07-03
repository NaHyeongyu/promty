import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";

export type ProjectDetailTabId = "overview" | "ai-activity" | "files";

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
  name: string;
  description: string;
  onOpenAllProjects?: () => void;
  onConnectRepository?: () => void;
  onProjectSelect?: (projectId: string) => void;
  projectOptions?: ProjectHeaderProjectOption[];
  repositoryStatus: string;
  repositoryUrl?: string;
  selectedProjectId?: string;
};

export type ProjectDetailProject = ProjectHeaderProps & {
  id: string;
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

export type ProjectMemoryArtifact = {
  changedFileCount: number;
  createdAt: string | null;
  generator: string | null;
  id: string;
  model: string | null;
  outcome: string | null;
  sessionId: string | null;
  summary: string | null;
  tags: string[];
  title: string;
  updatedAt: string | null;
};

export type ProjectMemoryStatus = {
  latestArtifactAt: string | null;
  recentArtifacts: ProjectMemoryArtifact[];
  totalArtifacts: number;
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

export type PromptFlowPublishPayload = {
  context_summary?: string | null;
  end_prompt_event_id?: string | null;
  notes?: string | null;
  prompt_event_ids?: string[];
  project_id: string;
  session_id?: string | null;
  start_prompt_event_id?: string | null;
  status: "draft" | "published";
  summary?: string | null;
  tags: string[];
  title?: string | null;
  visibility: "private" | "public" | "unlisted";
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
