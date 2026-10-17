import { defineConfig, devices } from "@playwright/test"

/**
 * E2E against a running vendor portal (:3001) and a seeded backend (:9000).
 * Uses the installed Microsoft Edge (no browser downloads on the dev machine).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    channel: "msedge",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-edge", use: { ...devices["Desktop Edge"], channel: "msedge" }, grepInvert: /@mobile/ },
    { name: "mobile-edge", use: { ...devices["Pixel 7"], channel: "msedge" }, grep: /@mobile/ },
  ],
})
