import { expect, test } from "@playwright/test"
import { quietContext } from "./helpers"

test.beforeEach(async ({ context, baseURL }) => quietContext(context, baseURL))

test("register, sign out and sign in again", async ({ page }) => {
  const email = `e2e+${Date.now()}@example.com`
  const password = "Indigo-adire-weekend-2026"
  await page.goto("/account/register")

  // Too-short password is caught before it reaches the backend.
  await page.getByTestId("register-first-name").fill("Ada")
  await page.getByTestId("register-last-name").fill("Okafor")
  await page.getByTestId("register-email").fill(email)
  await page.getByTestId("register-password").fill("short")
  await page.getByTestId("register-submit").click()
  await expect(page.getByTestId("register-form")).toContainText(/12 characters/)

  await page.getByTestId("register-password").fill(password)
  await page.getByTestId("register-submit").click()
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByTestId("account-heading")).toContainText("Ada")

  await page.getByTestId("logout").click()
  await expect(page).toHaveURL(/\/$/)

  await page.goto("/account/login")
  await page.getByTestId("login-email").fill(email)
  await page.getByTestId("login-password").fill("wrong-password-123")
  await page.getByTestId("login-submit").click()
  await expect(page.getByTestId("login-form")).toContainText(/don.t match/i)
  await page.getByTestId("login-password").fill(password)
  await page.getByTestId("login-submit").click()
  await expect(page.getByTestId("account-heading")).toBeVisible()
})
