import type { ProjectDetailData } from "../components/project-detail";
import {
  formatCompactNumber,
  formatDate,
  formatLabelValue,
  formatRelativeTimestamp,
  formatTimestamp,
} from "../lib/formatters";
import { projectDetailUrl } from "./projectUrls";
import type { Project } from "./types";

export const MOCK_GITHUB_UNLINKED_PROJECT_ID = "mock-github-unlinked-project";

export function mockGithubUnlinkedProject(): Project {
  const timestamp = "2026-07-04T14:18:00Z";

  return {
    createdTimestamp: "2026-07-01T09:00:00Z",
    events: 42,
    filesChanged: 12,
    id: MOCK_GITHUB_UNLINKED_PROJECT_ID,
    isBookmarked: true,
    latestActivityLabel: formatRelativeTimestamp(timestamp) ?? formatTimestamp(timestamp),
    latestMemoryAt: undefined,
    latestTimestamp: timestamp,
    latestUpdatedAt: formatTimestamp(timestamp),
    memoryCount: 0,
    models: ["gpt-5", "claude-sonnet-4"],
    name: "Unlinked Repository Preview",
    prompts: 18,
    pendingMemoryCount: 0,
    sessions: 4,
    slug: "unlinked-repository-preview",
    tags: ["frontend", "preview"],
    trackedFiles: 12,
    visibility: "private",
  };
}

export function isMockGithubUnlinkedProject(projectId: string | null | undefined) {
  return projectId === MOCK_GITHUB_UNLINKED_PROJECT_ID;
}

export function mockGithubUnlinkedProjectDetail(project: Project): ProjectDetailData {
  return {
    activities: [
      {
        events: 18,
        filesChanged: 7,
        id: "mock-session-1",
        lastActivity: "Today 2:18 PM",
        model: "gpt-5",
        prompts: 8,
        responses: 8,
        startedAt: "Today 1:42 PM",
      },
      {
        events: 12,
        filesChanged: 3,
        id: "mock-session-2",
        lastActivity: "Yesterday 5:30 PM",
        model: "claude-sonnet-4",
        prompts: 5,
        responses: 5,
        startedAt: "Yesterday 5:04 PM",
      },
    ],
    community: {
      draftFlows: 0,
      latestFlowAt: null,
      publishedFlows: 0,
      recentFlows: [],
      totalFlows: 0,
    },
    files: [
      {
        children: [
          { name: "App.tsx", path: "frontend/src/App.tsx", type: "file" },
          {
            name: "project-detail.css",
            path: "frontend/src/components/project-detail/project-detail.css",
            type: "file",
          },
        ],
        name: "frontend",
        type: "folder",
      },
      {
        children: [
          { name: "projects.py", path: "backend/app/api/projects.py", type: "file" },
        ],
        name: "backend",
        type: "folder",
      },
    ],
    memory: {
      drafts: [],
      latestArtifactAt: null,
      pendingRanges: [],
      recentArtifacts: [],
      totalArtifacts: 0,
    },
    metricHistory: [],
    overview: [
      {
        description: "GitHub remote has not been added yet.",
        title: "Repository URL",
        value: "Not connected",
      },
      {
        description: "Promty project detail page",
        href: projectDetailUrl(project.slug ?? project.id),
        title: "Project URL",
        value: projectDetailUrl(project.slug ?? project.id),
      },
      {
        title: "Description",
        value: "Frontend preview data for the GitHub unlinked project state.",
      },
      {
        title: "Visibility",
        value: formatLabelValue(project.visibility, "Private"),
      },
      {
        title: "AI Models",
        value: project.models.join(", "),
      },
      {
        title: "Activities",
        value: formatCompactNumber(project.events),
      },
      {
        title: "Sessions",
        value: formatCompactNumber(project.sessions),
      },
      {
        title: "Sessions Added",
        value: "+1 since yesterday",
      },
      {
        title: "Prompts",
        value: formatCompactNumber(project.prompts),
      },
      {
        title: "Prompts Added",
        value: "+4 since yesterday",
      },
      {
        title: "Files Changed Added",
        value: "+2 since yesterday",
      },
      {
        description: formatRelativeTimestamp(project.createdTimestamp) ?? "Not available",
        title: "Created",
        value: formatDate(project.createdTimestamp),
      },
      {
        description: project.latestActivityLabel,
        title: "Last Activity",
        value: formatDate(project.latestTimestamp),
      },
      {
        description: "No repository",
        title: "Repository Connected",
        value: "Not connected",
      },
    ],
    project: {
      description: "Frontend preview data for the GitHub unlinked project state.",
      id: project.id,
      isBookmarked: project.isBookmarked,
      name: project.name,
      repositoryStatus: "Repository not connected",
      repositoryUrl: undefined,
      slug: project.slug,
      tags: project.tags,
      visibility: project.visibility,
    },
    promptActivities: [],
    repositoryFiles: [],
    repositoryFilesMessage: "This project does not have a GitHub repository remote.",
  };
}
