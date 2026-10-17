import { expect, test } from "@playwright/test"
import { fillLogin, freshTotp, latestVerifyUrl, STRONG_PASSWORD, uniqueEmail } from "./helpers"

test.describe("vendor signup", () => {
  test("register → MFA setup → email verification → pending dashboard", async ({ page }) => {
    const email = uniqueEmail()
    await page.goto("/register")
    await page.getByTestId("register-contact-name").fill("Ada Okafor")
    await page.getByTestId("register-email").fill(email)
    await page.getByTestId("register-password").fill(STRONG_PASSWORD)
    await page.getByTestId("register-business-name").fill(`E2E Studio ${Date.now()}`)
    await page.getByTestId("register-submit").click()

    // Registration signs in and goes to MFA setup (or asks to sign in again with real Turnstile).
    await page.waitForURL(/\/(mfa\/setup|login)/)
    if (page.url().includes("/login")) await fillLogin(page, email, STRONG_PASSWORD)
    await expect(page).toHaveURL(/\/mfa\/setup/)

    await page.getByTestId("mfa-start").click()
    const secret = (await page.getByTestId("mfa-secret").textContent())?.trim() ?? ""
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/)
    await expect(page.getByTestId("mfa-qr")).toBeVisible()
    await expect(page.getByTestId("mfa-recovery-codes").locator("li")).toHaveCount(10)

    // The code is refused until the vendor confirms they saved the recovery codes.
    await page.getByTestId("mfa-code").fill(await freshTotp(secret))
    await page.getByTestId("mfa-confirm").click()
    await expect(page.getByText("Confirm that you've saved your recovery codes")).toBeVisible()

    await page.getByTestId("mfa-saved").check()
    await page.getByTestId("mfa-code").fill(await freshTotp(secret))
    await page.getByTestId("mfa-confirm").click()
    await expect(page).toHaveURL(/\/verify-email/)
    await expect(page.getByTestId("resend-verification")).toBeVisible()

    const verifyUrl = await latestVerifyUrl(email)
    test.skip(!verifyUrl, "TODO: no outbox endpoint on the backend (set E2E_OUTBOX_URL) — email verification link not reachable")
    await page.goto(verifyUrl!)
    await page.getByTestId("verify-email-confirm").click()
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByTestId("status-banner")).toContainText("awaiting Haanta approval")
  })
})
