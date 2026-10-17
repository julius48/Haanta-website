import { describe, expect, it } from "vitest"
import { nextStep, safeNext } from "../auth-flow"
import { categoryHandle, CATEGORIES, isKnownCategory } from "../categories"
import { formatMinor, minorToInput, parsePriceToMinor } from "../money"
import { htmlToLite, liteToHtml } from "../rich-text"
import { chartToDraft } from "../size-chart"
import { isOrderLate, NEXT_ORDER_STATUSES } from "../status"
import { isAllowedUploadTarget, localUploadUrl, MAX_UPLOAD_BYTES, validateUploadFile } from "../upload"

describe("price formatting and parsing", () => {
  it("formats minor units", () => {
    expect(formatMinor(6800, "USD")).toBe("$68")
    expect(formatMinor(6850, "USD")).toBe("$68.50")
    expect(formatMinor(9500, "CAD")).toBe("CA$95")
    expect(formatMinor(-1250, "USD")).toBe("-$12.50")
    expect(formatMinor(4500000, "NGN")).toMatch(/45,000/)
  })
  it("parses typed prices to minor units", () => {
    expect(parsePriceToMinor("68")).toBe(6800)
    expect(parsePriceToMinor("68.5")).toBe(6850)
    expect(parsePriceToMinor(" 45,000.00 ")).toBe(4500000)
    for (const bad of ["", "0", "-5", "1.234", "abc", "1e3"]) expect(parsePriceToMinor(bad)).toBeNull()
  })
  it("turns minor units back into input text", () => {
    expect(minorToInput(6800)).toBe("68")
    expect(minorToInput(6805)).toBe("68.05")
    expect(minorToInput(null)).toBe("")
  })
})

describe("upload file validation", () => {
  it("accepts JPEG, PNG and WebP up to 10 MB", () => {
    expect(validateUploadFile({ name: "a.jpg", type: "image/jpeg", size: 1000 })).toEqual({ ok: true, type: "image/jpeg" })
    expect(validateUploadFile({ name: "a.webp", type: "image/webp", size: MAX_UPLOAD_BYTES }).ok).toBe(true)
  })
  it("rejects other types, empty and oversized files", () => {
    expect(validateUploadFile({ name: "a.svg", type: "image/svg+xml", size: 10 }).ok).toBe(false)
    expect(validateUploadFile({ name: "a.gif", type: "image/gif", size: 10 }).ok).toBe(false)
    expect(validateUploadFile({ name: "a.png", type: "image/png", size: 0 }).ok).toBe(false)
    expect(validateUploadFile({ name: "a.png", type: "image/png", size: MAX_UPLOAD_BYTES + 1 }).ok).toBe(false)
  })
  it("builds the local upload URL from the signed fields", () => {
    const url = localUploadUrl({ upload_url: "http://localhost:9000/uploads/local", fields: { folder: "vendors/v1/product", signature: "a b" } })
    expect(url).toBe("http://localhost:9000/uploads/local?folder=vendors%2Fv1%2Fproduct&signature=a+b")
  })
  it("only uploads to Cloudinary or the backend's local target", () => {
    const backend = "http://localhost:9000"
    expect(isAllowedUploadTarget("https://api.cloudinary.com/v1_1/haanta/image/upload", backend)).toBe(true)
    expect(isAllowedUploadTarget("http://localhost:9000/uploads/local", backend)).toBe(true)
    expect(isAllowedUploadTarget("http://localhost:9000/admin", backend)).toBe(false)
    expect(isAllowedUploadTarget("https://evil.example.com/uploads/local", backend)).toBe(false)
  })
})

describe("rich text", () => {
  it("converts light marks to basic HTML and escapes HTML", () => {
    expect(liteToHtml("Hello **world** and _you_\nnext line\n\n- one\n- two\n\n1. a\n2. b")).toBe(
      "<p>Hello <strong>world</strong> and <em>you</em><br>next line</p><ul><li>one</li><li>two</li></ul><ol><li>a</li><li>b</li></ol>",
    )
    expect(liteToHtml("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")
    expect(liteToHtml("snake_case_name stays")).toBe("<p>snake_case_name stays</p>")
  })
  it("converts sanitised HTML back to light marks", () => {
    expect(htmlToLite("<p>Hello <strong>world</strong> &amp; <em>you</em></p><ul><li>one</li><li>two</li></ul>")).toBe("Hello **world** & _you_\n\n- one\n- two")
    expect(htmlToLite(null)).toBe("")
  })
})

describe("auth flow", () => {
  const me = (enrolled: boolean, verified: boolean, email: boolean) => ({ mfa: { enrolled, verified }, user: { id: "u", name: "A", email: "a@b.c", role: "owner", email_verified: email } })
  it("routes to MFA setup, MFA verify, email verification, then the destination", () => {
    expect(nextStep(me(false, false, false))).toBe("/mfa/setup")
    expect(nextStep(me(true, false, true))).toBe("/mfa/verify")
    expect(nextStep(me(true, true, false))).toBe("/verify-email")
    expect(nextStep(me(true, true, false), "/verify-email?token=abc")).toBe("/verify-email?token=abc")
    expect(nextStep(me(true, true, true))).toBe("/dashboard")
    expect(nextStep(me(true, true, true), "/orders/vo_1")).toBe("/orders/vo_1")
  })
  it("never redirects off-site", () => {
    expect(safeNext("//evil.com")).toBeNull()
    expect(safeNext("https://evil.com")).toBeNull()
    expect(safeNext("/\\evil.com")).toBeNull()
    expect(safeNext("/products")).toBe("/products")
  })
})

describe("categories, size charts and order status", () => {
  it("mirrors the catalog tree handles", () => {
    expect(categoryHandle("women/dresses")).toBe("women-dresses")
    expect(CATEGORIES).toHaveLength(27)
    expect(isKnownCategory("men/kaftans")).toBe(true)
    expect(isKnownCategory("women/../admin")).toBe(false)
  })
  it("turns a size chart into editor columns", () => {
    const d = chartToDraft({ id: "sc_1", name: "Dresses", unit: "in", notes: null, rows: [{ label: "S", us: "4", measurements: { bust: "34", waist: "27" } }, { label: "M", measurements: { bust: "36", hips: "40" } }] })
    expect(d.columns).toEqual(["bust", "waist", "hips"])
    expect(d.rows[1]).toEqual({ label: "M", us: "", uk: "", eu: "", values: ["36", "", "40"] })
  })
  it("follows the backend transition table and late rule", () => {
    expect(NEXT_ORDER_STATUSES.new).toEqual(["accepted"])
    expect(NEXT_ORDER_STATUSES.accepted).toEqual(["in_production", "shipped_to_hub"])
    expect(isOrderLate({ ship_by: "2020-01-01T00:00:00Z", status: "accepted" })).toBe(true)
    expect(isOrderLate({ ship_by: "2020-01-01T00:00:00Z", status: "shipped_to_hub" })).toBe(false)
    expect(isOrderLate({ ship_by: null, status: "new" })).toBe(false)
  })
})
