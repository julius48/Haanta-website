import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { FORBIDDEN_REDIRECTS } from "@/lib/auth-flow"
import { BACKEND_URL, SESSION_COOKIE } from "@/lib/server/api"

/**
 * Payout statement download (GET only). Proxies the backend with the session token from the
 * HttpOnly cookie and streams the file back as an attachment. Only own payouts are returned by the
 * backend (other ids → 404).
 */
const PAYOUT_ID = /^[A-Za-z0-9_-]{3,64}$/
const TYPES = { pdf: "application/pdf", csv: "text/csv; charset=utf-8" } as const

export async function GET(request: NextRequest, { params }: { params: Promise<{ payoutId: string }> }) {
  const { payoutId } = await params
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "pdf"
  if (!PAYOUT_ID.test(payoutId)) return new NextResponse("Not found", { status: 404 })
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.redirect(new URL("/login?expired=1", request.url))

  let upstream: Response
  try {
    upstream = await fetch(`${BACKEND_URL}/vendor/earnings/statements/${encodeURIComponent(payoutId)}?format=${format}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    })
  } catch {
    return new NextResponse("Statement unavailable. Please try again shortly.", { status: 502 })
  }
  if (upstream.status === 401) return NextResponse.redirect(new URL("/login?expired=1", request.url))
  if (upstream.status === 403) {
    const body = (await upstream.json().catch(() => null)) as { code?: string } | null
    const target = (body?.code && FORBIDDEN_REDIRECTS[body.code]) || "/earnings"
    return NextResponse.redirect(new URL(target, request.url))
  }
  if (!upstream.ok || !upstream.body) return new NextResponse(upstream.status === 404 ? "Statement not found" : "Statement unavailable", { status: upstream.status === 404 ? 404 : 502 })

  const filename = `haanta-statement-${payoutId}.${format}`
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": TYPES[format],
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
