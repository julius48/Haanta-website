import { expect, test } from "@playwright/test"
import { ADDRESSES, addFirstProduct, fillAddress, payWithTestCard, quietContext } from "./helpers"

test.beforeEach(async ({ context, baseURL }) => quietContext(context, baseURL))

test("unknown orders show a friendly not-found message", async ({ page }) => {
  await page.goto("/track")
  await page.getByTestId("track-order-number").fill("999999")
  await page.getByTestId("track-email").fill("nobody@example.com")
  await page.getByTestId("track-submit").click()
  await expect(page.getByTestId("track-form")).toContainText(/couldn.t find/i)
})

test("a placed order can be tracked by number and email", async ({ page }) => {
  const email = `track+${Date.now()}@example.com`
  await addFirstProduct(page, "houston")
  await fillAddress(page, ADDRESSES.TX, email)
  const orderNumber = await payWithTestCard(page)
  await page.goto("/track")
  await page.getByTestId("track-order-number").fill(orderNumber)
  await page.getByTestId("track-email").fill(email)
  await page.getByTestId("track-submit").click()
  await expect(page.getByTestId("track-result")).toContainText(`#${orderNumber}`)
  await expect(page.getByTestId("track-result")).toContainText(/Progress/)
})
