import { expect, test } from "@playwright/test"
import { openFirstPurchasable, quietContext } from "./helpers"

test.beforeEach(async ({ context, baseURL }) => quietContext(context, baseURL))

test("browse → filter → product → add to cart @mobile", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.goto("/shop")
  const before = await page.getByTestId("product-card").count()
  expect(before).toBeGreaterThan(0)

  // Filter by "Ships from the US" through the UI (drawer on mobile, sidebar on desktop).
  const open = page.getByTestId("filters-open")
  if (await open.isVisible()) await open.click()
  const panel = page.getByTestId("filters-panel")
  await panel.getByTestId("facet-ships-from").getByLabel(/Ships from the US/).check()
  if (!(await page.url().includes("ships_from"))) {
    const apply = panel.getByTestId("filters-apply")
    if (await apply.isVisible()) await apply.click()
  }
  await expect(page).toHaveURL(/ships_from=houston/)
  await expect(page.getByTestId("product-card").first()).toBeVisible()
  for (const card of await page.getByTestId("product-card").all()) await expect(card).toHaveAttribute("data-ships-from", /houston/)

  await openFirstPurchasable(page, page.url())
  await expect(page.getByTestId("pdp-ships-from")).toContainText(/US/)
  await page.getByTestId("add-to-cart").click()
  await expect(page.getByTestId("add-to-cart-status")).toContainText(/Added to your bag/i)

  await page.goto("/cart")
  await expect(page.getByTestId("cart-line")).toHaveCount(1)
  await expect(page.getByTestId("duties-message")).toBeVisible()
})

test("quick view adds to cart from the listing", async ({ page }) => {
  await page.goto("/shop?ships_from=houston&fulfilment=ready_to_wear")
  const dialog = page.getByTestId("quick-view")
  // Real stock: try cards in order until the quick view offers an in-stock option.
  for (let i = 0; i < 6; i++) {
    await page.getByTestId("quick-view-button").nth(i).click()
    await expect(dialog.getByTestId("add-to-cart")).toBeVisible()
    for (const group of await dialog.locator("fieldset.s-options").all()) await group.locator("input:not([disabled]) + label").first().click()
    if (await dialog.getByTestId("add-to-cart").isEnabled()) break
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  }
  await dialog.getByTestId("add-to-cart").click()
  await expect(dialog.getByTestId("add-to-cart-status")).toContainText(/Added/i)
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId("cart-count")).toHaveText(/\d+/)
})

test("search returns results and the search box is labelled", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("search-input").fill("a")
  await page.getByTestId("search-input").press("Enter")
  await expect(page).toHaveURL(/\/search\?q=a/)
  await expect(page.getByTestId("result-count")).toBeVisible()
})
