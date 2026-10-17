import { expect, test } from "@playwright/test"
import { expectNoSeriousA11yViolations, hasSeededVendor, signInSeeded } from "./helpers"

/** Strings that must never appear on vendor order pages (buyer personal data). */
const BUYER_PII_MARKERS = [/@(?!haanta\.com)[a-z0-9-]+\.[a-z]{2,}/i, /first[_ ]name/i, /last[_ ]name/i, /billing address/i, /customer/i]

test("login page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/login")
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test("register page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/register")
  await expectNoSeriousA11yViolations(page)
})

test.describe("signed in", () => {
  test.skip(!hasSeededVendor, "Set E2E_VENDOR_EMAIL / E2E_VENDOR_PASSWORD / E2E_VENDOR_TOTP_SECRET for an active, verified vendor")

  test("dashboard and product form have no serious accessibility violations", async ({ page }) => {
    await signInSeeded(page)
    await expect(page.getByTestId("sales-chart")).toBeVisible()
    await expectNoSeriousA11yViolations(page)
    await page.goto("/products/new")
    await expect(page.getByTestId("product-form")).toBeVisible()
    await expectNoSeriousA11yViolations(page)
  })

  test("orders show the Haanta hub address and never buyer data", async ({ page }) => {
    await signInSeeded(page)
    await page.goto("/orders?status=all")
    const html = await page.content()
    for (const marker of BUYER_PII_MARKERS) expect(html).not.toMatch(marker)
    const first = page.getByTestId("order-list").getByRole("link").first()
    test.skip((await first.count()) === 0, "No orders for the seeded vendor yet")
    await first.click()
    await expect(page.getByTestId("ship-to")).toBeVisible()
    const detail = await page.locator("main").innerText()
    for (const marker of BUYER_PII_MARKERS) expect(detail).not.toMatch(marker)
  })

  test("mobile menu opens and navigates @mobile", async ({ page }) => {
    await signInSeeded(page)
    await page.getByRole("button", { name: "Menu" }).click()
    await page.getByTestId("nav-orders").click()
    await expect(page).toHaveURL(/\/orders/)
  })
})
