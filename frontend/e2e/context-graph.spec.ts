import { expect, test } from "@playwright/test";


const API_ORIGIN = "http://127.0.0.1:8011";

const contextGraphFixture = {
  edges: [
    {
      id: "edge-prompt-response",
      inferred: true,
      kind: "answered_by",
      source: "prompt:one",
      target: "response:one",
    },
    {
      id: "edge-prompt-file",
      inferred: false,
      kind: "changed",
      source: "prompt:one",
      target: "file:memory-panel",
    },
    {
      id: "edge-prompt-memory",
      inferred: false,
      kind: "captured_in",
      source: "prompt:one",
      target: "memory:project",
    },
    {
      id: "edge-memory-file",
      inferred: false,
      kind: "references",
      source: "memory:project",
      target: "file:context-graph",
    },
  ],
  facets: { file: 2, memory: 1, prompt: 1, response: 1 },
  nodes: [
    {
      agent_visible: false,
      id: "prompt:one",
      kind: "prompt",
      label: "Turn project activity into reusable context",
      metadata: { model: "gpt-5", tool: "codex" },
      occurred_at: "2026-07-22T01:01:00Z",
      sequence: 1,
      session_id: "4eea979c-c94b-44a4-ad1f-d9344bb62da5",
      summary: "Build a useful context graph for project work.",
    },
    {
      agent_visible: false,
      id: "response:one",
      kind: "response",
      label: "Implemented the context graph and evidence trail",
      metadata: { model: "gpt-5", tool: "codex" },
      occurred_at: "2026-07-22T01:02:00Z",
      sequence: 2,
      session_id: "4eea979c-c94b-44a4-ad1f-d9344bb62da5",
      summary: "Connected the originating request to the resulting work.",
    },
    {
      agent_visible: true,
      id: "file:memory-panel",
      kind: "file",
      label: "frontend/src/components/project-detail/MemoryPanel.tsx",
      metadata: { additions: 22, deletions: 4, status: "modified" },
      occurred_at: "2026-07-22T01:03:00Z",
      sequence: null,
      session_id: "4eea979c-c94b-44a4-ad1f-d9344bb62da5",
      summary: null,
    },
    {
      agent_visible: true,
      id: "file:context-graph",
      kind: "file",
      label: "frontend/src/components/project-detail/ContextGraphPanel.tsx",
      metadata: { additions: 84, deletions: 20, status: "modified" },
      occurred_at: "2026-07-22T01:04:00Z",
      sequence: null,
      session_id: "4eea979c-c94b-44a4-ad1f-d9344bb62da5",
      summary: null,
    },
    {
      agent_visible: true,
      id: "memory:project",
      kind: "memory",
      label: "Context graph product direction",
      metadata: {
        memory_scope: "project",
        review_state: "verified",
        tags: ["context", "graph"],
      },
      occurred_at: "2026-07-22T01:05:00Z",
      sequence: null,
      session_id: null,
      summary: "Keep provenance and user review attached to reusable project context.",
    },
  ],
  query: null,
  safety_notice: "Only reviewed Project Memory is available to AI agents.",
  truncated: false,
};

test("context graph stays node-based and usable from desktop to mobile", async ({ page }, testInfo) => {
  const accessCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "promty_session",
  );
  expect(accessCookie).toBeDefined();
  const authorization = `Bearer ${accessCookie!.value}`;
  await page.context().setExtraHTTPHeaders({ Authorization: authorization });

  const repositoryName = `context-graph-${Date.now()}`;
  const response = await page.request.post(`${API_ORIGIN}/api/projects`, {
    data: { github_url: `https://github.com/promty/${repositoryName}` },
    headers: { Authorization: authorization },
  });
  expect(
    response.ok(),
    `Project creation failed with ${response.status()}: ${await response.text()}`,
  ).toBe(true);
  const project = await response.json() as { id: string };

  await page.route(`**/api/projects/${project.id}/context-graph**`, (route) =>
    route.fulfill({ json: contextGraphFixture, status: 200 }),
  );

  try {
    await page.goto(`/app?project=${project.id}&tab=memory`);
    await expect(page.getByRole("heading", { name: repositoryName })).toBeVisible();
    await page.getByRole("tab", { name: "Context graph" }).click();

    const desktopGraph = page.getByTestId("context-graph-desktop");
    await expect(desktopGraph).toBeVisible();
    await expect(desktopGraph.locator(".context-graph-node")).toHaveCount(5);
    await expect(desktopGraph.locator(".context-graph-edge")).toHaveCount(4);
    await expect(desktopGraph.locator(".context-graph-node-port")).toHaveCount(10);
    await expect(page.locator(".context-graph-basis-legend")).toContainText("Recorded");
    await expect(page.locator(".context-graph-basis-legend")).toContainText("Inferred");

    if (process.env.PROMTY_CAPTURE_CONTEXT_GRAPH === "1") {
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: testInfo.outputPath("context-graph-desktop.png"),
      });
    }

    await page.setViewportSize({ height: 844, width: 390 });
    await expect(desktopGraph).toBeHidden();
    const mobileGraph = page.getByTestId("context-graph-mobile");
    await expect(mobileGraph).toBeVisible();
    await expect(mobileGraph.locator(".context-graph-mobile-anchor .context-graph-node")).toHaveCount(1);
    await expect(mobileGraph.locator(".context-graph-mobile-connections > li")).toHaveCount(2);

    const overflow = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    if (process.env.PROMTY_CAPTURE_CONTEXT_GRAPH === "1") {
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: testInfo.outputPath("context-graph-mobile.png"),
      });
    }
  } finally {
    await page.request.delete(`${API_ORIGIN}/api/projects/${project.id}`, {
      headers: { Authorization: authorization },
    });
  }
});
