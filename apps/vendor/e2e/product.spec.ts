import path from "node:path"
import { writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { expect, test } from "@playwright/test"
import { hasSeededVendor, signInSeeded } from "./helpers"

/** 1×1 PNG so the local upload provider accepts a real image. */
function tinyPng(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "haanta-e2e-"))
  const file = path.join(dir, "photo.png")
  writeFileSync(file, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"))
  return file
}

test.describe("products", () => {
  test.skip(!hasSeededVendor, "Set E2E_VENDOR_EMAIL / E2E_VENDOR_PASSWORD / E2E_VENDOR_TOTP_SECRET for an active, verified vendor")

  test("create a product with live price preview, then submit for review", async ({ page }) => {
    await signInSeeded(page)
    await page.goto("/products/new")
    await page.getByTestId("product-title").fill(`E2E Adire midi dress ${Date.now()}`)
    await page.getByTestId("product-category").selectOption("women/dresses")
    await page.getByTestId("product-description").fill("Hand-dyed **adire** cotton.\n\n- Midi length\n- Side pockets")
    await page.getByTestId("option-0-values").fill("S, M")

    await page.getByTestId("images-input").setInputFiles(tinyPng())
    await expect(page.getByRole("img", { name: /Product photos 1/ })).toBeVisible()

    await page.getByTestId("variant-0-price").fill("68")
    await page.getByTestId("variant-1-price").fill("72.50")
    // Debounced server-side preview shows storefront prices in USD and CAD before submitting.
    await expect(page.getByTestId("variant-0-storefront-price")).toContainText("Storefront price: $")
    await expect(page.getByTestId("variant-0-storefront-price")).toContainText("CA$")

    await page.getByTestId("save-product").click()
    await expect(page).toHaveURL(/\/products\/[^/]+\?saved=1/)
    await expect(page.getByTestId("listing-status")).toContainText("Draft")

    await page.getByTestId("submit-product").click()
    await expect(page).toHaveURL(/submitted=1/)
    await expect(page.getByTestId("listing-status")).toContainText("In review")
  })
})
