// Playwright configuration for COAL browser tests
import { defineConfig } from "@playwright/test";

const PORT = 3001;

export default defineConfig({
  testDir: "./test/browser",
  timeout: 15000,
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
