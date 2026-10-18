import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { cookies, headers } from "next/headers"
import { palette } from "@haanta/ui"
import "@haanta/ui/tokens.css"
import "@haanta/ui/base.css"
import "./globals.css"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { CookieConsent } from "@/components/layout/CookieConsent"
import { NewsletterPopup } from "@/components/layout/NewsletterPopup"
import { AnalyticsLoader } from "@/components/layout/AnalyticsLoader"
import { CardActions } from "@/components/product/CardActions"
import { JsonLd } from "@/components/ui/JsonLd"
import { organizationJsonLd, websiteJsonLd } from "@/lib/jsonld"
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent"
import { getSettings } from "@/lib/server/catalog"
import { SITE_URL } from "@/lib/site"

/** Avenir is the brand font (licence pending); Figtree is the free fallback. Cinzel is for marketing headlines only. */
// Self-hosted (SIL OFL), so builds are offline-safe and no requests go to Google.
const sans = localFont({ src: "./fonts/figtree-latin-wght-normal.woff2", variable: "--font-sans-fallback", display: "swap", weight: "300 900" })
const display = localFont({ src: "./fonts/cinzel-latin-wght-normal.woff2", variable: "--font-display", display: "swap", weight: "400 900", preload: false })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Haanta | Curated African fashion", template: "%s | Haanta" },
  description: "Haanta is where Africa meets the world: curated African fashion brands, shipped to the US and Canada.",
  openGraph: { siteName: "Haanta", type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = { themeColor: palette.brown, width: "device-width", initialScale: 1 }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers makes every page dynamic, which the per-request CSP nonce requires.
  await headers()
  const jar = await cookies()
  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value)
  const settings = await getSettings()
  const analyticsKeys = !!(process.env.NEXT_PUBLIC_GA4_ID || process.env.NEXT_PUBLIC_POSTHOG_KEY)
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <a className="h-sr-only h-skip-link" href="#main">
          Skip to content
        </a>
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        <Header />
        {children}
        <Footer />
        <CookieConsent hasChoice={consent !== null} />
        <NewsletterPopup config={settings.newsletter_popup} blocked={consent === null} />
        <CardActions />
        <AnalyticsLoader enabled={analyticsKeys && consent?.analytics === true} />
      </body>
    </html>
  )
}
