import { expect, test } from "@playwright/test";


test("project CRUD works through the authenticated browser workspace", async ({ page }) => {
  const repositoryName = `e2e-crud-${Date.now()}`;
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

  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  const editor = page.getByRole("dialog", { name: "Edit project" });
  await editor.getByLabel("Project URL").fill("https://example.com/e2e-project");
  await editor.getByLabel("Tags").fill("e2e, crud");
  await editor.getByRole("radio", { name: "Public in Explore" }).click();
  await editor.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByRole("link", { name: "https://example.com/e2e-project" })).toBeVisible();
  await expect(page.getByText("e2e", { exact: true })).toBeVisible();
  await expect(page.getByText("crud", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("dialog", { name: "Edit project" })
    .getByRole("button", { name: "Delete project" })
    .click();

  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("button", { name: `Open ${repositoryName}` })).toHaveCount(0);
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
