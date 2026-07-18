import { expect, test } from "@playwright/test";


test("project CRUD works through the authenticated browser workspace", async ({ page }) => {
  const repositoryName = `e2e-crud-${Date.now()}`;
  const renamedProjectName = `${repositoryName}-renamed`;
  const repositoryUrl = `https://github.com/promty/${repositoryName}`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

  const created = await page.evaluate(async ({ repositoryUrl }) => {
    const response = await fetch("http://127.0.0.1:8011/api/projects", {
      body: JSON.stringify({ github_url: repositoryUrl }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) throw new Error(`Project creation failed: ${response.status}`);
    return response.json() as Promise<{ id: string; name: string }>;
  }, { repositoryUrl });
  expect(created.name).toBe(repositoryName);

  await page.reload();
  await page.getByRole("button", { name: `Open ${repositoryName}` }).click();
  await expect(page.getByRole("heading", { name: repositoryName })).toBeVisible();

  await page.getByRole("tab", { name: "Prompts" }).click();
  await page.getByRole("button", { name: "Edit project" }).click();
  await page.getByLabel("Project name").fill(renamedProjectName);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: renamedProjectName })).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();

  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  const editor = page.getByRole("dialog", { name: "Edit project" });
  await editor.getByLabel("Project URL").fill("https://example.com/e2e-project");
  await editor.getByLabel("Tags").fill("e2e, crud");
  await editor.getByRole("radio", { name: "Chronological" }).click();
  await editor.getByRole("radio", { name: "Public in Community" }).click();
  await editor.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByRole("link", { name: "https://example.com/e2e-project" })).toBeVisible();
  await expect(page.getByText("e2e", { exact: true })).toBeVisible();
  await expect(page.getByText("crud", { exact: true })).toBeVisible();
  await expect(page.locator(".bh-project-memory-grouping-summary")).toContainText(
    "Chronological",
  );

  await page.getByRole("link", { name: "View public listing" }).click();
  await expect(page.getByRole("heading", { name: renamedProjectName })).toBeVisible();
  await page.getByRole("button", { name: /^View .+'s profile$/ }).click();
  await expect(page).toHaveURL(/\?view=community&profile=/);
  const publicProfileUrl = page.url();
  await expect(page.getByText("Community profile", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(renamedProjectName) }).click();
  await expect(page).toHaveURL(new RegExp(`public_project=${created.id}`));
  await expect(page.getByRole("heading", { name: renamedProjectName })).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  const privacyEditor = page.getByRole("dialog", { name: "Edit project" });
  await expect(
    privacyEditor.getByRole("radio", { name: "Chronological" }),
  ).toHaveAttribute("aria-checked", "true");
  await privacyEditor.getByRole("radio", { name: "Private" }).click();
  await privacyEditor.getByRole("button", { name: "Save", exact: true }).click();

  await page.goto(publicProfileUrl);
  await expect(page.getByRole("heading", { name: "No public projects" })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(renamedProjectName) })).toHaveCount(0);

  await page.goto(`/?project=${created.id}&tab=overview`);
  await expect(page.getByRole("heading", { name: renamedProjectName })).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("dialog", { name: "Edit project" })
    .getByRole("button", { name: "Delete project" })
    .click();

  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("button", { name: `Open ${renamedProjectName}` })).toHaveCount(0);
});


test("workspace exposes loading, request-error, and not-found states", async ({ page }) => {
  await page.goto("/?preview=project-loading");
  await expect(page.getByRole("status", { name: "Loading projects" })).toBeVisible();

  await page.route("**/api/projects", (route) =>
    route.fulfill({
      body: JSON.stringify({ detail: "Synthetic E2E failure" }),
      contentType: "application/json",
      status: 500,
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects could not be loaded" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  await page.goto("/definitely-not-a-route");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});


test("legacy Explore links open the unified Community projects tab", async ({ page }) => {
  await page.goto("/?view=explore");

  await expect(page.getByRole("heading", { name: "Community" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: /Search public projects/ })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Explore", exact: true }))
    .toHaveCount(0);
  await expect(page).toHaveURL(/\?view=community(?:&|$)/);
});


test("Community preview shows project rows, details, and public profiles", async ({ page }) => {
  await page.goto("/?view=community&preview=community");

  await expect(page.getByRole("heading", { name: "Community" })).toBeVisible();
  await expect(page.getByText("Preview data", { exact: true })).toHaveCount(0);
  const projectCard = page.getByRole("article", { name: "Context Atlas" });
  const projectRow = projectCard.getByRole("button", { name: /Context Atlas/ });
  await expect(projectCard).toBeVisible();
  await expect(projectCard.getByText("mina.park", { exact: true })).toBeVisible();
  await expect(projectCard.getByText("context", { exact: true })).toBeVisible();
  await expect(projectCard.getByText("gpt-5", { exact: true })).toBeVisible();
  await expect(projectCard.getByText("sonnet-4", { exact: true })).toBeVisible();
  await expect(projectCard.getByLabel("Project views: 1284")).toBeVisible();
  await expect(projectCard.getByRole("link", { name: /example.com\/context-atlas/ })).toBeVisible();

  await projectRow.click();
  await expect(page.getByRole("heading", { name: "Context Atlas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Community" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to public projects" })).toBeVisible();
  const viewAnalytics = page.getByLabel("Project view analytics");
  await expect(page.getByLabel("Project view analytics")).toBeVisible();
  await expect(viewAnalytics.locator("dd").first()).toContainText("1.3K");
  await expect(viewAnalytics.getByText("Last 7 days", { exact: true })).toBeVisible();
  await expect(viewAnalytics.getByText("Unique viewers", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByRole("button", { name: "Remove saved project" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View public listing" })).toHaveCount(0);
  await expect(page.locator(".bh-overview-stat-card dd").first()).not.toHaveText("0");
  await page.getByRole("tab", { name: "Memory" }).click();
  await expect(page.getByText("Latest project memory", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Prompts" }).click();
  await expect(page.getByText("This view contains only prompts and responses reviewed and published by the project owner.")).toBeVisible();
  await expect(page.getByRole("button", { name: "By prompt" })).toBeVisible();
  await expect(page.getByRole("button", { name: "By session" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search activity by text, model, or date" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prompt detail" })).toBeVisible();
  await expect(page.getByText("Simplify the review surface", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "By session" }).click();
  await expect(page.getByRole("button", { name: "Focused UI review loop session" })).toBeVisible();
  await page.getByRole("button", { name: "View mina.park's profile" }).click();

  await expect(page).toHaveURL(/preview=community.*profile=|profile=.*preview=community/);
  await expect(page.getByRole("heading", { name: "mina.park" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Context Atlas/ })).toBeVisible();
  await page.getByRole("button", { name: "Back to public projects" }).click();
  await expect(page.getByRole("heading", { name: "Context Atlas" })).toBeVisible();
  await page.getByRole("button", { name: "Back to public projects" }).click();
  await page.getByRole("button", { name: "Saved" }).click();
  await expect(page.getByRole("article", { name: "Context Atlas" })).toBeVisible();
  await expect(page.getByLabel("Saved project").first()).toBeVisible();
});
