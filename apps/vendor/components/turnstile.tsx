import Script from "next/script"
import { headers } from "next/headers"

/**
 * Cloudflare Turnstile widget. It adds a hidden `cf-turnstile-response` input to the form.
 * Without NEXT_PUBLIC_TURNSTILE_SITE_KEY nothing renders and the server sends `local-dev`.
 */
export async function Turnstile() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  if (!siteKey) return null
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return (
    <div className="v-field">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} />
      <div className="cf-turnstile" data-sitekey={siteKey} data-theme="light" data-size="flexible" />
    </div>
  )
}
