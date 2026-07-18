import { expect, test } from "@playwright/test";


test("workspace initial load skips eager event history", async ({ page }) => {
  const eagerEventRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/events?limit=500")) {
      eagerEventRequests.push(request.url());
    }
  });
  const initialProjectsResponse = page.waitForResponse((response) =>
    response.request().method() === "GET" &&
    new URL(response.url()).pathname === "/api/projects",
  );

  await page.goto("/");
  await initialProjectsResponse;
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  expect(eagerEventRequests).toEqual([]);
});


test("admin loads only the section that is opened", async ({ page }) => {
  const adminRequests: string[] = [];
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      body: JSON.stringify({
        avatar_url: null,
        email: "admin@example.invalid",
        github_repository_access: true,
        id: "admin-on-demand",
        is_admin: true,
        preferred_locale: "en",
        username: "admin-on-demand",
      }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/admin/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    adminRequests.push(path);
    if (path === "/api/admin/users" || path === "/api/admin/projects") {
      return route.fulfill({
        body: JSON.stringify({ items: [], limit: 25, offset: 0, total: 0 }),
        contentType: "application/json",
        status: 200,
      });
    }
    return route.fulfill({
      body: JSON.stringify({ detail: `Unexpected eager request: ${path}` }),
      contentType: "application/json",
      status: 500,
    });
  });

  await page.goto("/admin?section=users");
  await expect(page.getByText("Identity inventory", { exact: true })).toBeVisible();
  expect(adminRequests).toEqual(["/api/admin/users"]);

  await page.getByRole("button", { name: /Projects.*Repository and activity inventory/ }).click();
  await expect(page.getByText("Project inventory", { exact: true })).toBeVisible();
  expect(adminRequests).toEqual(["/api/admin/users", "/api/admin/projects"]);
});
