import { expect, test } from "@playwright/test"
import { ADDRESSES, addFirstProduct, fillAddress, payWithTestCard, quietContext } from "./helpers"

/**
 * Shipping scenarios from the Haanta engine (packages/shipping, legacy Wix rules):
 *  - US stock to mainland US (TX): Standard (US) only
 *  - Nigeria stock to US (TX): Standard + DHL Expedited
 *  - US stock to Alaska: UPS live/fallback rates (UPS territory)
 *  - Nigeria stock to Canada: Standard + DHL Expedited; US stock to Canada: UPS
 *  - Nigeria stock to Mexico: DHL Expedited only
 */
test.beforeEach(async ({ context, baseURL }) => quietContext(context, baseURL))

test("US stock → Texas: standard US delivery, pays with test card", async ({ page }) => {
  await addFirstProduct(page, "houston")
  const codes = await fillAddress(page, ADDRESSES.TX)
  expect(codes).toEqual(["standard_rate"])
  await expect(page.getByTestId("shipping-option").first()).toContainText(/Shipping from US/i)
  const order = await payWithTestCard(page, "standard_rate")
  expect(order).toMatch(/^\d+$/)
})

test("Nigeria stock → Texas: standard and DHL expedited", async ({ page }) => {
  await addFirstProduct(page, "lagos")
  const codes = await fillAddress(page, ADDRESSES.TX)
  expect(codes).toEqual(["standard_rate", "expedited_rate"])
  await expect(page.locator('[data-code="expedited_rate"]')).toContainText(/DHL/)
  await payWithTestCard(page, "expedited_rate")
})

test("US stock → Alaska: UPS options", async ({ page }) => {
  await addFirstProduct(page, "houston")
  const codes = await fillAddress(page, ADDRESSES.AK)
  expect(codes.length).toBeGreaterThan(0)
  for (const c of codes) expect(c).toMatch(/^ups-/)
  await expect(page.getByTestId("shipping-option").first()).toContainText(/UPS/)
  await payWithTestCard(page, codes[0])
})

test("Nigeria stock → Canada: standard and DHL expedited, CAD prices", async ({ page }) => {
  await addFirstProduct(page, "lagos")
  const codes = await fillAddress(page, ADDRESSES.CA)
  expect(codes).toEqual(["standard_rate", "expedited_rate"])
  await expect(page.getByTestId("summary-total")).toContainText(/CA\$/)
  await payWithTestCard(page, "standard_rate")
})

test("US stock → Canada: UPS options", async ({ page }) => {
  await addFirstProduct(page, "houston")
  const codes = await fillAddress(page, ADDRESSES.CA)
  expect(codes.length).toBeGreaterThan(0)
  for (const c of codes) expect(c).toMatch(/^ups-/)
})

test("Nigeria stock → Mexico: DHL expedited only", async ({ page }) => {
  await addFirstProduct(page, "lagos")
  const codes = await fillAddress(page, ADDRESSES.MX)
  expect(codes).toEqual(["expedited_rate"])
  await payWithTestCard(page, "expedited_rate")
})

test("declined test card shows an error and keeps the bag", async ({ page }) => {
  await addFirstProduct(page, "houston")
  await fillAddress(page, ADDRESSES.TX)
  await page.getByTestId("shipping-submit").click()
  await page.getByTestId("test-payment-method").selectOption("pm_card_chargeDeclined")
  await page.getByTestId("test-payment-submit").click()
  await expect(page.getByTestId("checkout-message")).toContainText(/declined/i)
  await expect(page).toHaveURL(/\/checkout/)
})
