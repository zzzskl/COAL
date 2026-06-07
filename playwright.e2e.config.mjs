// Playwright config for REAL E2E tests (no mocks, real server)
import { defineConfig } from "@playwright/test";

const PORT = 3002;

export default defineConfig({
  testDir: "./test/browser",
  testMatch: "real-e2e.spec.js",
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 5000,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
  webServer: {
    command: `npx tsx ui/server.ts`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 10000,
    env: { PORT: String(PORT) },
  },
});
