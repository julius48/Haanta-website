import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"
import { totp } from "./totp"

export const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:9000"

/**
 * A pre-seeded, approved (active) vendor with MFA enrolled and email verified, for flows that need
 * an active store (submitting for review, orders). Set in the environment:
 *   E2E_VENDOR_EMAIL, E2E_VENDOR_PASSWORD, E2E_VENDOR_TOTP_SECRET
 */
export const seededVendor = {
  email: process.env.E2E_VENDOR_EMAIL ?? "",
  password: process.env.E2E_VENDOR_PASSWORD ?? "",
  totpSecret: process.env.E2E_VENDOR_TOTP_SECRET ?? "",
}
export const hasSeededVendor = !!(seededVendor.email && seededVendor.password && seededVendor.totpSecret)

export function uniqueEmail(prefix = "e2e-vendor"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
}

/** A long passphrase that is not in breach lists. */
export const STRONG_PASSWORD = "Indigo-Adire-Lagos-Runway-2026!"

export async function fillLogin(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByTestId("login-email").fill(email)
  await page.getByTestId("login-password").fill(password)
  await page.getByTestId("login-submit").click()
}

/**
 * Enter a TOTP code. Codes are single-use per 30 s window on the backend, so wait for a fresh
 * window when the current one is almost over.
 */
export async function freshTotp(secret: string): Promise<string> {
  const msIntoWindow = Date.now() % 30_000
  if (msIntoWindow > 25_000) await new Promise((r) => setTimeout(r, 30_000 - msIntoWindow + 500))
  return totp(secret)
}

/** Sign in as the seeded vendor and pass the MFA step. */
export async function signInSeeded(page: Page) {
  await fillLogin(page, seededVendor.email, seededVendor.password)
  await expect(page).toHaveURL(/\/mfa\/verify/)
  await page.getByTestId("mfa-code").fill(await freshTotp(seededVendor.totpSecret))
  await page.getByTestId("mfa-verify").click()
  await expect(page).toHaveURL(/\/dashboard/)
}

/** axe scan: zero serious or critical WCAG 2.x A/AA violations. */
export async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([])
}

/**
 * The backend's mock messenger keeps emails in an in-memory outbox with no HTTP endpoint.
 * TODO: expose a local-only outbox route on the backend (e.g. GET /dev/outbox) and set
 * E2E_OUTBOX_URL so the test can read the "Vendor Verify Email" verify_url.
 */
export async function latestVerifyUrl(email: string): Promise<string | null> {
  const url = process.env.E2E_OUTBOX_URL
  if (!url) return null
  const res = await fetch(url)
  if (!res.ok) return null
  const messages = (await res.json()) as { event: string; to: { email?: string }; properties: { verify_url?: string } }[]
  const hit = messages.filter((m) => m.event === "Vendor Verify Email" && m.to.email === email).pop()
  return hit?.properties.verify_url ?? null
}
