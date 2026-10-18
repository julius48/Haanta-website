import { expect, type BrowserContext, type Page } from "@playwright/test"

/** Dismiss the cookie banner and newsletter popup so they never overlap the flows under test. */
export async function quietContext(context: BrowserContext, baseURL = "http://localhost:3000") {
  await context.addCookies([{ name: "haanta_consent", value: "none", url: baseURL }])
  await context.addInitScript(() => {
    try {
      localStorage.setItem("haanta_popup_subscribed", "1")
    } catch {
      // ignore
    }
  })
}

export type Origin = "houston" | "lagos"

/**
 * Stable, well-stocked products from the seed (demo vendors, hidden from search and listings).
 * Prepare them before a run: pnpm --dir apps/backend exec medusa exec ./src/scripts/e2e-fixtures.ts
 */
export const FIXTURES = {
  houston: "/products/aso-oke-bomber-jacket-lekki-loom-demo",
  lagos: "/products/adire-wrap-dress-adire-atelier-demo",
  madeToOrder: "/products/indigo-two-piece-set-adire-atelier-demo",
} as const

/** Open the ready-to-wear fixture for a stock location and add it to the bag. Returns its title. */
export async function addFixtureProduct(page: Page, origin: Origin): Promise<string> {
  await page.goto(FIXTURES[origin])
  await expect(page.getByTestId("pdp-title")).toBeVisible()
  const title = (await page.getByTestId("pdp-title").textContent())?.trim() ?? ""
  await chooseFirstOptions(page)
  await page.getByTestId("add-to-cart").click()
  await expect(page.getByTestId("add-to-cart-status")).toContainText(/Added to your bag/i)
  return title
}

/**
 * Real-catalog flows: open product cards in order until one can be bought (stock is real, so the
 * first card may be sold out). Leaves the page on that product with its first options chosen.
 */
export async function openFirstPurchasable(page: Page, listingUrl: string, tries = 6) {
  for (let i = 0; i < tries; i++) {
    await page.goto(listingUrl)
    const cards = page.getByTestId("product-card")
    if ((await cards.count()) <= i) break
    await cards.nth(i).getByTestId("product-card-link").click()
    await expect(page.getByTestId("pdp-title")).toBeVisible()
    await chooseFirstOptions(page)
    if (await page.getByTestId("add-to-cart").isEnabled()) return
  }
  throw new Error(`No purchasable product found on ${listingUrl}`)
}

export async function chooseFirstOptions(page: Page) {
  const form = page.getByTestId("add-to-cart-form")
  const groups = form.locator("fieldset.s-options")
  const n = await groups.count()
  for (let i = 0; i < n; i++) {
    await groups.nth(i).locator("input:not([disabled]) + label").first().click()
  }
}

export interface TestAddress {
  country: "us" | "ca" | "mx"
  first: string
  last: string
  address1: string
  city: string
  province: string
  postal: string
  phone: string
}

export const ADDRESSES: Record<"TX" | "AK" | "CA" | "MX", TestAddress> = {
  TX: { country: "us", first: "Ada", last: "Okafor", address1: "1 Main St", city: "Austin", province: "TX", postal: "78701", phone: "+15125550100" },
  AK: { country: "us", first: "Ada", last: "Okafor", address1: "500 W 6th Ave", city: "Anchorage", province: "AK", postal: "99501", phone: "+19075550100" },
  CA: { country: "ca", first: "Ada", last: "Okafor", address1: "100 Queen St W", city: "Toronto", province: "ON", postal: "M5H 2N2", phone: "+14165550100" },
  MX: { country: "mx", first: "Ada", last: "Okafor", address1: "Av. Reforma 222", city: "Ciudad de México", province: "CMX", postal: "06600", phone: "+525555550100" },
}

/** Fill the checkout address step and return the shipping option codes shown. */
export async function fillAddress(page: Page, a: TestAddress, email = `buyer+${Date.now()}@example.com`): Promise<string[]> {
  await page.goto("/checkout")
  await page.getByTestId("checkout-email").fill(email)
  await page.getByTestId("checkout-country").selectOption(a.country)
  await page.getByTestId("checkout-first-name").fill(a.first)
  await page.getByTestId("checkout-last-name").fill(a.last)
  await page.getByTestId("checkout-address1").fill(a.address1)
  await page.getByTestId("checkout-city").fill(a.city)
  await page.getByTestId("checkout-province").fill(a.province)
  await page.getByTestId("checkout-postal").fill(a.postal)
  await page.getByTestId("checkout-phone").fill(a.phone)
  await page.getByTestId("address-submit").click()
  await expect(page.getByTestId("shipping-form").or(page.getByTestId("no-shipping-options"))).toBeVisible()
  return page.getByTestId("shipping-option").evaluateAll((els) => els.map((e) => e.getAttribute("data-code") ?? ""))
}

/** Choose a delivery option, pay with the mock test-payment panel and return the order number. */
export async function payWithTestCard(page: Page, code?: string, method = "pm_card_visa"): Promise<string> {
  if (code) await page.locator(`[data-testid="shipping-option"][data-code="${code}"]`).click()
  await page.getByTestId("shipping-submit").click()
  await expect(page.getByTestId("test-payment")).toBeVisible()
  await page.getByTestId("test-payment-method").selectOption(method)
  await page.getByTestId("test-payment-submit").click()
  await expect(page).toHaveURL(/\/order\/confirmed\//, { timeout: 60_000 })
  await expect(page.getByTestId("order-confirmed")).toBeVisible()
  return ((await page.getByTestId("order-number").textContent()) ?? "").replace("#", "").trim()
}
