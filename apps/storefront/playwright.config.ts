import { defineConfig, devices } from "@playwright/test"

/**
 * E2E against a running storefront (:3000) and seeded backend (:9000). Uses the installed
 * Microsoft Edge (no browser downloads). Start the servers first, then `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    channel: "msedge",
    trace: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "desktop-edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "mobile-edge", use: { ...devices["Pixel 7"], channel: "msedge" }, grep: /@mobile/ },
  ],
})
