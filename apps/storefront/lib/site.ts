/** Public site constants. Safe for client and server. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "")
export const SITE_NAME = "Haanta"
export const TAGLINE = "Haanta is where Africa meets the world"

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`
}

export const SOCIAL = [
  { name: "Instagram", href: "https://www.instagram.com/shophaanta" },
  { name: "TikTok", href: "https://www.tiktok.com/@shophaanta" },
  { name: "Pinterest", href: "https://www.pinterest.com/shophaanta" },
] as const

export const COUNTRIES = [
  { code: "us", name: "United States", currency: "usd" },
  { code: "ca", name: "Canada", currency: "cad" },
  { code: "mx", name: "Mexico", currency: "usd" },
] as const

export type Country = (typeof COUNTRIES)[number]["code"]

export function isCountryCode(v: unknown): v is Country {
  return v === "us" || v === "ca" || v === "mx"
}
