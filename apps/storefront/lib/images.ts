/**
 * next/image can only optimise hosts listed in next.config.ts remotePatterns. Anything else is
 * rendered unoptimised (still lazy-loaded with explicit sizes) instead of throwing at runtime.
 */
const BACKEND = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"

export function canOptimize(src: string | null | undefined): boolean {
  if (!src) return false
  if (src.startsWith("/")) return true
  try {
    const u = new URL(src)
    if (u.hostname === "res.cloudinary.com" || u.hostname === "cdn.sanity.io") return u.protocol === "https:"
    if (u.hostname === "static.wixstatic.com") return u.protocol === "https:" && u.pathname.startsWith("/media/")
    const b = new URL(BACKEND)
    return u.host === b.host && u.protocol === b.protocol && u.pathname.startsWith("/static/")
  } catch {
    return false
  }
}

/** Only http(s) or root-relative image URLs are rendered. */
export function safeImage(src: string | null | undefined): string | null {
  if (!src) return null
  if (src.startsWith("/") && !src.startsWith("//")) return src
  return /^https?:\/\//i.test(src) ? src : null
}
