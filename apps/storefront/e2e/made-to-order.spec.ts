import { expect, test } from "@playwright/test"
import { FIXTURES, chooseFirstOptions, quietContext } from "./helpers"

test.beforeEach(async ({ context, baseURL }) => quietContext(context, baseURL))

test("made-to-order items require measurements before adding to the bag", async ({ page }) => {
  await page.goto(FIXTURES.madeToOrder)
  await expect(page.getByTestId("measurements")).toBeVisible()
  await chooseFirstOptions(page)

  // Empty measurements are refused on the client.
  await page.getByTestId("add-to-cart").click()
  await expect(page.getByTestId("add-to-cart-status")).toContainText(/measurements/i)
  const inputs = page.getByTestId("measurements").locator('input[type="number"]')
  const n = await inputs.count()
  expect(n).toBeGreaterThan(0)
  await expect(inputs.first()).toHaveAttribute("aria-invalid", "true")

  // Out of range is refused too.
  await inputs.first().fill("500")
  await page.getByTestId("add-to-cart").click()
  await expect(page.getByTestId("measurements")).toContainText(/between/i)

  // Valid measurements (mid-range for each field) succeed and appear in the bag.
  for (let i = 0; i < n; i++) {
    const input = inputs.nth(i)
    const min = Number(await input.getAttribute("min"))
    const max = Number(await input.getAttribute("max"))
    await input.fill(String(Math.round((min + max) / 2)))
  }
  await page.getByTestId("add-to-cart").click()
  await expect(page.getByTestId("add-to-cart-status")).toContainText(/Added to your bag/i)
  await page.goto("/cart")
  await expect(page.getByTestId("line-measurements")).toContainText(/\d+ in/)
})
