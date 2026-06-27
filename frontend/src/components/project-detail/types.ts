import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";

export type ProjectDetailTabId = "overview" | "ai-activity" | "knowledge" | "files";

export type ProjectDetailTab = {
  id: ProjectDetailTabId;
  label: string;
};

export type ProjectHeaderProps = {
  name: string;
  description: string;
  onConnectRepository?: () => void;
  repositoryStatus: string;
  repositoryUrl?: string;
};

export type ProjectDetailProject = ProjectHeaderProps;

export type OverviewItem = {
  title: string;
  value: string;
  description?: string;
  actions?: string[];
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

export type PromptActivityItem = {
  id: string;
  model: string;
  prompt: string;
  sequence: number;
  sessionId: string;
  submittedAt: string;
};

export type KnowledgeItem = {
  title: string;
  fileType: string;
  updatedAt: string;
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
  files: FileTreeNode[];
  knowledge: KnowledgeItem[];
  overview: OverviewItem[];
  promptActivities: PromptActivityItem[];
  project: ProjectDetailProject;
  repositoryFileContent?: RepositoryFileContent | null;
  repositoryFileContentError?: string;
  repositoryFileContentLoading?: boolean;
  repositoryFileSelectedPath?: string | null;
  repositoryFiles: FileTreeNode[];
  repositoryFilesConnectUrl?: string;
  repositoryFilesMessage?: string;
  repositoryFilesRepository?: string;
  repositoryFilesStatus?: string;
  repositoryFilesTruncated?: boolean;
};
