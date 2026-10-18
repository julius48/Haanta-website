import { expect, test, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { addFirstProduct, quietContext } from "./helpers"

test.beforeEach(async ({ context, baseURL }) => quietContext(context, baseURL))

async function scan(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)
  expect(summary, `${name}: serious/critical axe violations`).toEqual([])
}

test("home, listing and product have no serious or critical violations", async ({ page }) => {
  await page.goto("/")
  await scan(page, "home")
  await page.goto("/shop")
  await scan(page, "listing")
  await page.getByTestId("product-card").first().getByTestId("product-card-link").click()
  await expect(page.getByTestId("pdp-title")).toBeVisible()
  await scan(page, "product")
})

test("cart and checkout have no serious or critical violations", async ({ page }) => {
  await addFirstProduct(page, "houston")
  await page.goto("/cart")
  await expect(page.getByTestId("cart-line").first()).toBeVisible()
  await scan(page, "cart")
  await page.goto("/checkout")
  await expect(page.getByTestId("address-form")).toBeVisible()
  await scan(page, "checkout")
})

test("cookie banner is accessible before consent", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await page.goto("/")
  await expect(page.getByTestId("cookie-consent")).toBeVisible()
  await scan(page, "home with cookie banner")
  await page.getByTestId("consent-reject").click()
  await expect(page.getByTestId("cookie-consent")).toBeHidden()
  await context.close()
})
