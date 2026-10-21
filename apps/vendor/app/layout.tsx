import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { palette } from "@haanta/ui"
import "@haanta/ui/tokens.css"
import "@haanta/ui/base.css"
import "./globals.css"

/** Avenir is the brand font (licence pending); Figtree is the free fallback. Cinzel is for marketing headlines only. */
// Self-hosted (SIL OFL), so builds are offline-safe and no requests go to Google.
const sans = localFont({ src: "./fonts/figtree-latin-wght-normal.woff2", variable: "--font-sans-fallback", display: "swap", weight: "300 900" })
const display = localFont({ src: "./fonts/cinzel-latin-wght-normal.woff2", variable: "--font-display", display: "swap", weight: "400 900" })

const SITE_URL = process.env.NEXT_PUBLIC_VENDOR_URL ?? "http://localhost:3001"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Haanta Partner Portal", template: "%s | Haanta Partner Portal" },
  description: "Manage your Haanta store, products, orders and earnings.",
  openGraph: { siteName: "Haanta", type: "website" },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: palette.ivory, width: "device-width", initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <a className="h-sr-only h-skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
