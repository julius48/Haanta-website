import "server-only"
import { cookies } from "next/headers"

/**
 * Server-only client for the Medusa backend. The publishable key and the buyer's token are added
 * here; tokens live in HttpOnly cookies and never reach browser JavaScript.
 */
export const BACKEND_URL = process.env.MEDUSA_BACKEND_URL ?? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? process.env.MEDUSA_PUBLISHABLE_KEY ?? ""

export const COOKIE = {
  cart: "haanta_cart",
  session: "haanta_session",
  country: "haanta_country",
} as const

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { type?: string; code?: string; message?: string } | null,
  ) {
    super(body?.message ?? `Request failed (${status})`)
  }
}

interface Options {
  method?: "GET" | "POST" | "DELETE"
  body?: unknown
  auth?: boolean
  headers?: Record<string, string>
  /** Seconds to cache GET responses (Next data cache). Omit for no-store. */
  revalidate?: number
  tags?: string[]
}

export async function medusa<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-publishable-api-key": PUBLISHABLE_KEY, ...opts.headers }
  if (opts.auth) {
    const token = (await cookies()).get(COOKIE.session)?.value
    if (token) headers.authorization = `Bearer ${token}`
  }
  const cache = opts.revalidate !== undefined && !opts.auth && (opts.method ?? "GET") === "GET"
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    ...(cache ? { next: { revalidate: opts.revalidate, tags: opts.tags } } : { cache: "no-store" as const }),
  })
  const text = await res.text()
  const data = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) throw new ApiError(res.status, data as ApiError["body"])
  return data as T
}

/** Cookie options for anything security-relevant: HttpOnly, Secure in production, SameSite=Lax. */
export function secureCookie(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  }
}
