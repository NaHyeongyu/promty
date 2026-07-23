import { expect, test, type Page, type TestInfo } from "@playwright/test";


const MOBILE_VIEWPORT = { height: 844, width: 390 };
const API_ORIGIN = "http://127.0.0.1:8011";

test.use({
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
  reducedMotion: "reduce",
  viewport: MOBILE_VIEWPORT,
});

type MobileRoute = {
  name: string;
  readyText?: string;
  url: string;
};

const publicRoutes: MobileRoute[] = [
  { name: "landing", url: "/" },
  { name: "about", url: "/about" },
  { name: "product", url: "/product" },
  { name: "privacy", url: "/privacy" },
  { name: "terms", url: "/terms" },
  { name: "acceptable-use", url: "/acceptable-use" },
  { name: "security", url: "/security" },
  { name: "collector-docs", url: "/docs/collector" },
  { name: "collector-docs-ai", url: "/docs/collector/ai" },
  { name: "cli-login", url: "/cli/login" },
  { name: "not-found", url: "/definitely-not-a-route" },
];

const workspaceRoutes: MobileRoute[] = [
  { name: "projects", readyText: "Add your first project", url: "/app" },
  { name: "saved", readyText: "No saved projects yet", url: "/app?view=pinned" },
  {
    name: "community",
    readyText: "Context Atlas",
    url: "/app?view=community&preview=community",
  },
  {
    name: "support",
    readyText: "Frequently asked questions",
    url: "/app?view=support",
  },
  {
    name: "settings",
    readyText: "Account & preferences",
    url: "/app?view=settings",
  },
  { name: "profile", readyText: "Connected Accounts", url: "/app?view=profile" },
];

async function waitForStablePage(page: Page) {
  await page.locator("#root").waitFor({ state: "visible" });
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    if ("fonts" in document) {
      await document.fonts.ready;
    }
  });
  await page.waitForTimeout(150);
}

async function expectMobileLayout(
  page: Page,
  routeName: string,
  testInfo: TestInfo,
) {
  const audit = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const rootOverflow = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ) - viewportWidth;

    const offenders = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const style = getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0
        ) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) {
          return false;
        }
        if (rect.left >= -1 && rect.right <= viewportWidth + 1) {
          return false;
        }

        let parent = element.parentElement;
        while (parent && parent !== document.body) {
          const parentOverflow = getComputedStyle(parent).overflowX;
          if (["auto", "clip", "hidden", "scroll"].includes(parentOverflow)) {
            return false;
          }
          parent = parent.parentElement;
        }
        return true;
      })
      .slice(0, 12)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          className: typeof element.className === "string" ? element.className : "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          tag: element.tagName.toLowerCase(),
          text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
        };
      });

    return { offenders, rootOverflow, viewportWidth };
  });

  if (process.env.PROMTY_CAPTURE_MOBILE === "1") {
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: testInfo.outputPath(`${routeName}.png`),
    });
  }

  expect(
    audit.rootOverflow,
    `${routeName} has horizontal page overflow: ${JSON.stringify(audit)}`,
  ).toBeLessThanOrEqual(1);
  expect(audit.offenders, `${routeName} has visible UI outside the viewport`).toEqual([]);
}

async function visitAndAudit(page: Page, route: MobileRoute, testInfo: TestInfo) {
  await page.goto(route.url);
  await page.locator("h1").first().waitFor({ state: "visible", timeout: 10_000 });
  if (route.readyText) {
    await page.getByText(route.readyText, { exact: true }).first().waitFor({
      state: "visible",
      timeout: 10_000,
    });
  }
  await waitForStablePage(page);
  await expectMobileLayout(page, route.name, testInfo);
}

async function authenticatePage(page: Page) {
  const accessCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "promty_session",
  );
  expect(accessCookie, "The mobile audit requires the E2E web session").toBeDefined();
  const authorization = `Bearer ${accessCookie!.value}`;
  await page.context().setExtraHTTPHeaders({ Authorization: authorization });
  return authorization;
}

async function acceptCurrentPolicies(page: Page, authorization: string) {
  const response = await page.request.put(`${API_ORIGIN}/api/account/policy-acceptance`, {
    data: {
      accept_privacy_notice: true,
      accept_terms: true,
      confirm_age_and_business_use: true,
    },
    headers: { Authorization: authorization },
  });
  expect(
    response.ok(),
    `Policy acceptance failed with ${response.status()}: ${await response.text()}`,
  ).toBe(true);
}

async function mockRequiredPolicyAcceptance(
  page: Page,
  overviewGate: Promise<void> = Promise.resolve(),
) {
  await page.route("**/api/account/overview", async (route) => {
    await overviewGate;
    const response = await route.fetch();
    const account = await response.json();
    await route.fulfill({
      json: {
        ...account,
        policy_consents: {
          ...account.policy_consents,
          eligibility_confirmed: false,
          external_ai_allowed: false,
          external_ai_consented_at: null,
          policy_accepted: false,
          policy_accepted_at: null,
        },
      },
      response,
    });
  });
  await page.route("**/api/account/policy-acceptance", async (route) => {
    await route.fulfill({
      json: {
        current_policy_version: "2026-07-21",
        eligibility_confirmed: true,
        external_ai_allowed: false,
        external_ai_consented_at: null,
        external_ai_providers: ["openai"],
        policy_accepted: true,
        policy_accepted_at: "2026-07-23T00:00:00Z",
      },
      status: 200,
    });
  });
}

async function acceptRequiredPolicyDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Review before continuing" });
  const checkboxes = dialog.getByRole("checkbox");
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await dialog.getByRole("button", { name: "Save and continue" }).click();
  await expect(dialog).toBeHidden();
}

test("all public pages fit a mobile viewport", async ({ page }, testInfo) => {
  for (const route of publicRoutes) {
    await visitAndAudit(page, route, testInfo);
  }
});

test("required policy acceptance fits a mobile viewport", async ({ page }, testInfo) => {
  await authenticatePage(page);
  await mockRequiredPolicyAcceptance(page);
  await page.goto("/app");
  await waitForStablePage(page);
  await expect(page.getByRole("dialog", { name: "Review before continuing" })).toBeVisible();
  await expect(page.locator(".app-shell > main")).toHaveJSProperty("inert", true);
  await expectMobileLayout(page, "policy-acceptance", testInfo);
  await acceptRequiredPolicyDialog(page);
  await expect(page.locator(".app-shell > main")).toHaveJSProperty("inert", false);
});

test("policy acceptance restores a pre-existing inert state", async ({ page }) => {
  let releaseOverview: () => void = () => undefined;
  const overviewGate = new Promise<void>((resolve) => {
    releaseOverview = resolve;
  });
  await authenticatePage(page);
  await mockRequiredPolicyAcceptance(page, overviewGate);
  await page.goto("/app");
  const main = page.locator(".app-shell > main");
  await main.waitFor({ state: "visible" });
  await main.evaluate((element) => {
    element.inert = true;
  });
  releaseOverview();
  await expect(page.getByRole("dialog", { name: "Review before continuing" })).toBeVisible();
  await expect(main).toHaveJSProperty("inert", true);
  await acceptRequiredPolicyDialog(page);
  await expect(main).toHaveJSProperty("inert", true);
});

test("workspace pages fit a mobile viewport", async ({ page }, testInfo) => {
  const authorization = await authenticatePage(page);
  await acceptCurrentPolicies(page, authorization);
  for (const route of workspaceRoutes) {
    await visitAndAudit(page, route, testInfo);
  }
});

test("admin inventory fits a mobile viewport", async ({ page }, testInfo) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      body: JSON.stringify({
        avatar_url: null,
        email: "mobile-admin@example.invalid",
        github_repository_access: true,
        id: "mobile-admin",
        is_admin: true,
        preferred_locale: "en",
        username: "mobile-admin",
      }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/admin/users**", (route) =>
    route.fulfill({
      body: JSON.stringify({ items: [], limit: 25, offset: 0, total: 0 }),
      contentType: "application/json",
      status: 200,
    }),
  );

  await visitAndAudit(
    page,
    { name: "admin-users", url: "/admin?section=users" },
    testInfo,
  );
});

test("every project detail tab fits a mobile viewport", async ({ page }, testInfo) => {
  const authorization = await authenticatePage(page);
  await acceptCurrentPolicies(page, authorization);
  const repositoryName = `mobile-layout-${Date.now()}`;
  const response = await page.request.post(`${API_ORIGIN}/api/projects`, {
    data: { github_url: `https://github.com/promty/${repositoryName}` },
    headers: { Authorization: authorization },
  });
  expect(response.ok()).toBe(true);
  const project = await response.json() as { id: string };
  const projectRoutes: MobileRoute[] = [
    { name: "project-overview", url: `/app?project=${project.id}&tab=overview` },
    { name: "project-memory", url: `/app?project=${project.id}&tab=memory` },
    {
      name: "project-ai-prompts",
      url: `/app?project=${project.id}&tab=ai-activity&activity=prompts`,
    },
    {
      name: "project-ai-sessions",
      url: `/app?project=${project.id}&tab=ai-activity&activity=sessions`,
    },
    { name: "project-files", url: `/app?project=${project.id}&tab=files` },
  ];

  try {
    for (const route of projectRoutes) {
      await page.goto(route.url);
      await expect(page.getByRole("heading", { name: repositoryName })).toBeVisible({
        timeout: 10_000,
      });
      await waitForStablePage(page);
      await expectMobileLayout(page, route.name, testInfo);
    }
  } finally {
    await page.request.delete(`${API_ORIGIN}/api/projects/${project.id}`, {
      headers: { Authorization: authorization },
    });
  }
});

test("Project Memory consent and review dialogs fit a mobile viewport", async (
  { page },
  testInfo,
) => {
  const authorization = await authenticatePage(page);
  await acceptCurrentPolicies(page, authorization);
  const disableConsentResponse = await page.request.put(
    `${API_ORIGIN}/api/account/external-ai-consent`,
    {
      data: { allow_external_ai: false },
      headers: { Authorization: authorization },
    },
  );
  expect(disableConsentResponse.ok()).toBe(true);

  const repositoryName = `mobile-dialogs-${Date.now()}`;
  const response = await page.request.post(`${API_ORIGIN}/api/projects`, {
    data: { github_url: `https://github.com/promty/${repositoryName}` },
    headers: { Authorization: authorization },
  });
  expect(response.ok()).toBe(true);
  const project = await response.json() as { id: string };
  const sessionId = "30ea7f29-7f8d-4cf1-98ea-f91eb55e164a";
  const reviewPrompts = [
    {
      created_at: "2026-07-21T09:12:00Z",
      event_id: "29278871-876e-4c21-94b9-af46feee6105",
      prompt_truncated: false,
      response_preview: "Updated the consent model and added an input review step.",
      response_truncated: false,
      sequence: 2,
      session_id: sessionId,
      text: "Separate required Terms acceptance from optional external AI processing, then review every captured prompt and session before anything is sent. ".repeat(4),
      tool: "codex",
    },
    {
      created_at: "2026-07-21T09:15:00Z",
      event_id: "e040d36b-637c-4bb9-9f19-4b8147d15c71",
      prompt_truncated: false,
      response_preview: null,
      response_truncated: false,
      sequence: 5,
      session_id: sessionId,
      text: "Verify the mobile review layout before generating memory.",
      tool: "codex",
    },
  ];

  await page.route(`**/api/projects/${project.id}/memory/pending**`, (route) =>
    route.fulfill({
      body: JSON.stringify([
        {
          can_checkpoint: true,
          changed_file_count: 12,
          draft_id: "037f6b80-6dda-4815-86dc-42193cda9a30",
          end_sequence: 8,
          event_count: 8,
          file_change_event_count: 2,
          first_event_at: "2026-07-21T09:10:00Z",
          last_event_at: "2026-07-21T09:18:00Z",
          prompt_count: 2,
          response_count: 2,
          session_id: sessionId,
          start_sequence: 1,
          tool: "codex",
        },
      ]),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route(`**/api/projects/${project.id}/memory/generation-review`, (route) =>
    route.fulfill({
      body: JSON.stringify({
        changed_file_count: 12,
        commit_count: 4,
        draft_count: 1,
        prompt_count: reviewPrompts.length,
        prompts: reviewPrompts,
        providers: ["openai"],
        response_count: reviewPrompts.length,
        review_token: "mobile-layout-review-token",
        source_code_included: false,
      }),
      contentType: "application/json",
      status: 200,
    }),
  );
  try {
    await page.goto(`/app?project=${project.id}&tab=memory`);
    await expect(page.getByRole("heading", { name: repositoryName })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Create project memory" }).click();

    const consentDialog = page.getByRole("dialog", {
      name: "Allow AI processing for Project Memory?",
    });
    await expect(consentDialog).toBeVisible();
    await expect(consentDialog.locator(".bh-memory-review-scroll")).toHaveCSS(
      "overflow-y",
      "auto",
    );
    const consentOption = consentDialog.locator(".bh-memory-consent-option");
    const consentOptionLayout = await consentOption.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(consentOptionLayout.scrollHeight).toBeLessThanOrEqual(
      consentOptionLayout.clientHeight + 1,
    );
    await expectMobileLayout(page, "project-memory-ai-consent", testInfo);

    await consentDialog.locator('input[type="checkbox"]').check();
    await consentDialog.getByRole("button", { name: "Agree and review AI input" }).click();
    await page.setViewportSize({ height: 560, width: MOBILE_VIEWPORT.width });

    const reviewDialog = page.getByRole("dialog", { name: "Review what will be sent" });
    await expect(reviewDialog).toBeVisible();
    await expect(reviewDialog.getByRole("tab", { name: /By prompt/ })).toBeVisible();
    await expect(reviewDialog.getByRole("tab", { name: /By session/ })).toBeVisible();
    await expect(
      reviewDialog.getByRole("searchbox", { name: "Search prompts or sessions" }),
    ).toBeVisible();
    await expect(reviewDialog.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(reviewDialog.getByRole("button", { name: "Delete session" })).toBeVisible();
    await expect(reviewDialog.getByRole("button", { name: "Delete prompt" })).toHaveCount(2);
    await reviewDialog.getByRole("button", { name: "Collapse session 30ea7f29" }).click();
    await expect(reviewDialog.getByRole("button", { name: "Delete prompt" })).toHaveCount(0);
    await reviewDialog.getByRole("button", { name: "Expand session 30ea7f29" }).click();
    await expect(reviewDialog.getByRole("button", { name: "Delete prompt" })).toHaveCount(2);
    await reviewDialog.getByRole("button", { name: "Show more" }).click();
    await expect(reviewDialog.getByRole("button", { name: "Show less" })).toBeVisible();
    await expectMobileLayout(page, "project-memory-ai-review", testInfo);
    const reviewScroll = reviewDialog.locator(".bh-memory-review-scroll");
    const reviewScrollMetrics = await reviewScroll.evaluate((element) => ({
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
    }));
    expect(reviewScrollMetrics.overflowY).toBe("auto");
    expect(reviewScrollMetrics.scrollHeight).toBeGreaterThan(reviewScrollMetrics.clientHeight);
    await reviewScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await reviewScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(
      reviewDialog.getByRole("button", { name: "Generate Project Memory" }),
    ).toBeVisible();
    await expectMobileLayout(page, "project-memory-ai-review-actions", testInfo);

    await reviewDialog.getByRole("button", { name: "Delete prompt" }).last().click();
    await expect(
      reviewDialog.getByText("Delete this prompt activity?"),
    ).toBeVisible();
    await expect(
      reviewDialog.getByRole("button", { name: "Delete permanently" }),
    ).toBeVisible();
    await reviewDialog.getByRole("alert").getByRole("button", { name: "Cancel" }).click();
    await expect(reviewDialog.getByText("Delete this prompt activity?")).toHaveCount(0);

    await page.setViewportSize({ height: 900, width: 1440 });
    const desktopDrawer = await reviewDialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
      };
    });
    expect(desktopDrawer.top).toBe(0);
    expect(desktopDrawer.right).toBe(1440);
    expect(desktopDrawer.bottom).toBe(900);
    expect(desktopDrawer.width).toBeGreaterThanOrEqual(520);
    expect(desktopDrawer.width).toBeLessThanOrEqual(720);
  } finally {
    await page.request.delete(`${API_ORIGIN}/api/projects/${project.id}`, {
      headers: { Authorization: authorization },
    });
  }
});

test("activity deletion confirmation fits a mobile viewport", async ({ page }, testInfo) => {
  const authorization = await authenticatePage(page);
  await acceptCurrentPolicies(page, authorization);
  const repositoryName = `mobile-delete-${Date.now()}`;
  const response = await page.request.post(`${API_ORIGIN}/api/projects`, {
    data: { github_url: `https://github.com/promty/${repositoryName}` },
    headers: { Authorization: authorization },
  });
  expect(response.ok()).toBe(true);
  const project = await response.json() as { id: string };
  const sessionId = "65df8ebf-0579-449a-968c-675348f5aa6d";
  const promptId = "618248ee-20f7-4867-951c-9ff29046c6d2";
  const prompt = {
    file_changes: [],
    files_changed: 0,
    id: promptId,
    model: "gpt-5",
    prompt: "Mobile deletion confirmation prompt",
    response: "Review the permanent deletion scope.",
    response_received_at: "2026-07-22T01:02:30Z",
    sequence: 1,
    session_id: sessionId,
    submitted_at: "2026-07-22T01:02:00Z",
  };

  await page.route(`**/api/projects/${project.id}/detail`, async (route) => {
    const backendResponse = await route.fetch();
    const detail = await backendResponse.json();
    await route.fulfill({
      json: {
        ...detail,
        activities: [{
          events: 2,
          files_changed: 0,
          id: sessionId,
          last_activity_at: "2026-07-22T01:03:00Z",
          model: "gpt-5",
          prompts: 1,
          responses: 1,
          started_at: "2026-07-22T01:00:00Z",
        }],
        prompt_activities: [prompt],
      },
      response: backendResponse,
    });
  });
  await page.route(`**/api/projects/${project.id}/prompt-activities**`, (route) =>
    route.fulfill({
      json: {
        cursor: null,
        has_more: false,
        items: [prompt],
        limit: 50,
        next_cursor: null,
        query: null,
        session_id: null,
        total: 1,
      },
      status: 200,
    }),
  );

  try {
    await page.goto(`/app?project=${project.id}&tab=ai-activity&activity=prompts`);
    await expect(page.getByText("Mobile deletion confirmation prompt").first()).toBeVisible();
    await page.getByRole("button", { name: "Delete prompt" }).click();
    await expect(page.getByRole("alertdialog", {
      name: "Delete this prompt activity?",
    })).toBeVisible();
    await expectMobileLayout(page, "activity-delete-confirmation", testInfo);
  } finally {
    await page.request.delete(`${API_ORIGIN}/api/projects/${project.id}`, {
      headers: { Authorization: authorization },
    });
  }
});
