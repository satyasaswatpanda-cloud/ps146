import { defineConfig, devices } from "@playwright/test";

// Requires the FastAPI backend on :8000 and `npm run build && npm run start`
// (or `npm run dev`) on :3000 -- see the `webServer` block below, which
// starts the Next.js app automatically. Start the backend separately:
//   uvicorn backend.main:app --port 8000
// Browser binaries must be installed once via `npx playwright install chromium`,
// which needs outbound internet access to Playwright's CDN (not available in
// every sandboxed/offline CI runner -- see docs/08_TESTING.md).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
