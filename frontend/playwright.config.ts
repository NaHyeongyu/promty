import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  outputDir: ".playwright/test-results",
  reporter: "list",
  retries: 0,
  timeout: 30_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5173",
    screenshot: "only-on-failure",
    storageState: ".playwright/e2e-auth.json",
    trace: "retain-on-failure",
  },
});
