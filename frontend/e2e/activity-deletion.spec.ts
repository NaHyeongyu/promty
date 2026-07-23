import { expect, test } from "@playwright/test";


const API_ORIGIN = "http://127.0.0.1:8011";

test("prompt and session deletion use scoped confirmation and refresh the activity UI", async ({
  page,
}) => {
  const repositoryName = `activity-delete-${Date.now()}`;
  await page.goto("/app");
  const project = await page.evaluate(async ({ repositoryName }) => {
    const response = await fetch("http://127.0.0.1:8011/api/projects", {
      body: JSON.stringify({ github_url: `https://github.com/promty/${repositoryName}` }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) throw new Error(`Project creation failed: ${response.status}`);
    return response.json() as Promise<{ id: string }>;
  }, { repositoryName });

  const sessionId = "44b70e38-4216-48c0-9766-0d05aaf115e8";
  const firstPromptId = "e8a2bbcb-5169-4417-ad4f-8524ebada68a";
  const secondPromptId = "b5dd151f-7849-4274-b0fa-bdd74d029313";
  let promptDeleted = false;
  let sessionDeleted = false;
  const promptItems = () => sessionDeleted ? [] : [
    ...(promptDeleted ? [] : [{
      file_changes: [{
        additions: 4,
        binary: false,
        deletions: 1,
        old_path: null,
        patch: "@@ -1 +1 @@\n-old\n+new",
        patch_omitted_reason: null,
        patch_truncated: false,
        path: "frontend/src/App.tsx",
        status: "modified",
      }],
      files_changed: 1,
      id: firstPromptId,
      model: "gpt-5",
      prompt: "Delete only this private prompt activity",
      response: "This response is linked to the prompt.",
      response_received_at: "2026-07-22T01:02:30Z",
      sequence: 3,
      session_id: sessionId,
      submitted_at: "2026-07-22T01:02:00Z",
    }]),
    {
      file_changes: [],
      files_changed: 0,
      id: secondPromptId,
      model: "gpt-5",
      prompt: "Keep this prompt until the session is deleted",
      response: "This one remains after the first deletion.",
      response_received_at: "2026-07-22T01:01:30Z",
      sequence: 1,
      session_id: sessionId,
      submitted_at: "2026-07-22T01:01:00Z",
    },
  ];

  await page.route(`**/api/projects/${project.id}/detail`, async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    const items = promptItems();
    await route.fulfill({
      json: {
        ...detail,
        activities: sessionDeleted ? [] : [{
          events: items.length * 2,
          files_changed: promptDeleted ? 0 : 1,
          id: sessionId,
          last_activity_at: "2026-07-22T01:03:00Z",
          model: "gpt-5",
          prompts: items.length,
          responses: items.length,
          started_at: "2026-07-22T01:00:00Z",
        }],
        prompt_activities: items,
      },
      response,
    });
  });
  await page.route(`**/api/projects/${project.id}/prompt-activities**`, async (route) => {
    if (route.request().method() === "DELETE") {
      expect(route.request().url()).toContain(firstPromptId);
      promptDeleted = true;
      await route.fulfill({ status: 204 });
      return;
    }
    const items = promptItems();
    await route.fulfill({
      json: {
        cursor: null,
        has_more: false,
        items,
        limit: 50,
        next_cursor: null,
        query: null,
        session_id: new URL(route.request().url()).searchParams.get("session_id"),
        total: items.length,
      },
      status: 200,
    });
  });
  await page.route(`**/api/projects/${project.id}/sessions/${sessionId}`, async (route) => {
    expect(route.request().method()).toBe("DELETE");
    sessionDeleted = true;
    await route.fulfill({ status: 204 });
  });

  try {
    await page.goto(`/app?project=${project.id}&tab=ai-activity&activity=prompts`);
    await expect(
      page.getByText("Delete only this private prompt activity").first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Delete prompt" }).click();

    const promptDialog = page.getByRole("alertdialog", {
      name: "Delete this prompt activity?",
    });
    await expect(promptDialog).toBeVisible();
    await expect(promptDialog).toContainText("Published copies");
    await expect(promptDialog).toContainText("Memory already generated");
    await promptDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(promptDialog).toBeHidden();

    await page.getByRole("button", { name: "Delete prompt" }).click();
    await promptDialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByText("Delete only this private prompt activity")).toHaveCount(0);
    await expect(page.getByText("Keep this prompt until the session is deleted").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "By prompt" })).toBeFocused();

    await page.getByRole("button", { name: "By session" }).click();
    await page.getByRole("button", { name: "Delete session" }).click();
    const sessionDialog = page.getByRole("alertdialog", {
      name: "Delete this entire session?",
    });
    await expect(sessionDialog).toContainText("All activity in this session");
    await sessionDialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByText("No activity yet", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "By session" })).toBeFocused();
  } finally {
    await page.request.delete(`${API_ORIGIN}/api/projects/${project.id}`);
  }
});
