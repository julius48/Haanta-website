import "server-only"
import { cookies } from "next/headers"

/**
 * Server-only client for the Haanta vendor API. The vendor's token lives in an HttpOnly cookie and
 * is attached here; browser JavaScript never sees it. All vendor scoping is enforced by the backend.
 */
export const BACKEND_URL = process.env.MEDUSA_BACKEND_URL ?? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"
export const SESSION_COOKIE = "haanta_vendor_session"

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { type?: string; code?: string; message?: string; problems?: string[] } | null,
  ) {
    super(body?.message ?? `Request failed (${status})`)
  }
}

interface Options {
  method?: "GET" | "POST" | "DELETE"
  body?: unknown
  /** Override the session token (e.g. the registration token right after sign-up). */
  token?: string | null
  headers?: Record<string, string>
}

export async function vendorApi<T>(path: string, opts: Options = {}): Promise<T> {
  const token = opts.token !== undefined ? opts.token : (await cookies()).get(SESSION_COOKIE)?.value
  const headers: Record<string, string> = { "content-type": "application/json", ...opts.headers }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  })
  const type = res.headers.get("content-type") ?? ""
  if (!type.includes("json")) {
    if (!res.ok) throw new ApiError(res.status, null)
    return (await res.arrayBuffer()) as unknown as T
  }
  const data = (await res.json()) as unknown
  if (!res.ok) throw new ApiError(res.status, data as ApiError["body"])
  return data as T
}

/** HttpOnly, Secure (production), SameSite=Lax; vendor sessions last 12 hours like the backend JWT. */
export function sessionCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 12 * 60 * 60 }
}
