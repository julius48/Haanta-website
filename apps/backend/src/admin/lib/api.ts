/** Same-origin calls to the Haanta admin API (session cookie). Errors carry the API's message. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
  }
}

export async function haantaApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/admin/haanta${path}`, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; code?: string }
  if (!res.ok) throw new ApiError(body.message || `Request failed (${res.status})`, res.status, body.code)
  return body
}

export const usd = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
export const usdMinor = (minor: number) => usd(minor / 100)
