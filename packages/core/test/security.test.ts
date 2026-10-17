import { describe, expect, it, vi } from "vitest"
import {
  buildCsp,
  checkPasswordPolicy,
  createHibpChecker,
  createLocalBreachedChecker,
  createLockout,
  createMemoryCounterStore,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hitRateLimit,
  htmlToText,
  isAllowedOrigin,
  maskEmail,
  redact,
  sanitizePlainText,
  sanitizeRichText,
  securityHeaders,
  sniffImageType,
  totp,
  validateImageUpload,
  validatePassword,
  validateUploadRequest,
  verifyTotp,
  base32Encode,
} from "../src"
import { createHash } from "node:crypto"

describe("password policy", () => {
  it("requires 12–128 characters and rejects the email local part", () => {
    expect(checkPasswordPolicy("short")).toEqual(["too_short"])
    expect(checkPasswordPolicy("a".repeat(129))).toEqual(["too_long"])
    expect(checkPasswordPolicy("correct horse battery")).toEqual([])
    expect(checkPasswordPolicy("adaeze-is-great-2026", "adaeze@example.com")).toEqual(["contains_email"])
  })

  it("counts unicode characters, not bytes", () => {
    expect(checkPasswordPolicy("ààààààààààà")).toEqual(["too_short"]) // 11 chars
  })

  it("rejects breached passwords", async () => {
    const checker = createLocalBreachedChecker()
    expect(await validatePassword("password1234", undefined, checker)).toEqual(["breached"])
    expect(await validatePassword("violet-teapot-orbit", undefined, checker)).toEqual([])
  })

  it("HIBP checker sends only a 5-char hash prefix and matches the suffix", async () => {
    const hash = createHash("sha1").update("hunter2hunter2").digest("hex").toUpperCase()
    const fetch = vi.fn(async (_url: string) => new Response(`0000000000000000000000000000000000A:0\r\n${hash.slice(5)}:42\r\n`))
    const checker = createHibpChecker({ fetch })
    expect(await checker.isBreached("hunter2hunter2")).toBe(true)
    expect(fetch.mock.calls[0]![0]).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`)
    expect(fetch.mock.calls[0]![0]).not.toContain(hash.slice(5))
  })

  it("HIBP checker fails open when the API is unreachable", async () => {
    const checker = createHibpChecker({ fetch: async () => { throw new Error("down") } })
    expect(await checker.isBreached("anything-at-all")).toBe(false)
  })
})

describe("TOTP", () => {
  // RFC 6238 test secret "12345678901234567890"
  const secret = base32Encode(Buffer.from("12345678901234567890"))

  it("matches RFC 6238 test vectors (6-digit truncation)", () => {
    expect(totp(secret, 59_000)).toBe("287082")
    expect(totp(secret, 1_111_111_109_000)).toBe("081804")
    expect(totp(secret, 1_234_567_890_000)).toBe("005924")
  })

  it("accepts ±1 step and rejects reuse of the same counter", () => {
    const t = 1_700_000_000_000
    const code = totp(secret, t)
    const counter = verifyTotp(secret, code, { timeMs: t })
    expect(counter).not.toBeNull()
    expect(verifyTotp(secret, code, { timeMs: t + 30_000 })).toBe(counter)
    expect(verifyTotp(secret, code, { timeMs: t + 90_000 })).toBeNull()
    expect(verifyTotp(secret, code, { timeMs: t, lastUsedCounter: counter })).toBeNull()
    expect(verifyTotp(secret, "12345", { timeMs: t })).toBeNull()
    expect(verifyTotp(secret, "abcdef", { timeMs: t })).toBeNull()
  })

  it("generates 160-bit secrets", () => {
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/)
  })

  it("encrypts secrets at rest with AES-GCM and detects tampering", () => {
    const key = "a".repeat(64)
    const enc = encryptSecret("JBSWY3DPEHPK3PXP", key)
    expect(enc).not.toContain("JBSWY3DPEHPK3PXP")
    expect(decryptSecret(enc, key)).toBe("JBSWY3DPEHPK3PXP")
    const parts = enc.split(".")
    parts[3] = Buffer.from("tampered").toString("base64")
    expect(() => decryptSecret(parts.join("."), key)).toThrow()
    expect(() => decryptSecret(enc, "b".repeat(64))).toThrow()
    expect(() => encryptSecret("x", "short")).toThrow()
  })

  it("hashes recovery codes", () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    expect(hashRecoveryCode(codes[0]!, "pep")).toBe(hashRecoveryCode(` ${codes[0]!.toUpperCase()} `, "pep"))
    expect(hashRecoveryCode(codes[0]!, "pep")).not.toBe(hashRecoveryCode(codes[0]!, "other"))
  })
})

describe("sanitisers", () => {
  it("strips scripts, event handlers and dangerous URLs from rich text", () => {
    const dirty = `<p onclick="x()">Hi <script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><a href="https://haanta.com" target="_blank">ok</a></p><iframe src="https://evil"></iframe><style>body{}</style>`
    const clean = sanitizeRichText(dirty)
    expect(clean).not.toMatch(/script|onerror|onclick|javascript:|iframe|<img|style/i)
    expect(clean).toContain('<a href="https://haanta.com" target="_blank" rel="noopener noreferrer nofollow">ok</a>')
  })

  it("keeps Wix formatting and maps divs and h1s", () => {
    expect(sanitizeRichText("<div>Colour: yellow<br>Fabric: Mesh</div><h1>Care</h1><ul><li>Hand wash</li></ul>")).toBe(
      "<p>Colour: yellow<br />Fabric: Mesh</p><h2>Care</h2><ul><li>Hand wash</li></ul>",
    )
  })

  it("drops empty paragraphs and spans", () => {
    expect(sanitizeRichText("<p>&nbsp;</p><p>Text</p><span></span>")).toBe("<p>Text</p>")
  })

  it("plain text strips all markup and control characters", () => {
    expect(sanitizePlainText(`<b>Great</b> fit <script>x</script>\u0000 & "true to size"`)).toBe('Great fit & "true to size"')
    expect(sanitizePlainText("a".repeat(20), 5)).toBe("aaaaa")
  })

  it("htmlToText produces a clean snippet", () => {
    expect(htmlToText("<p>Colour: yellow<br>Fabric : Mesh</p><p>Hand wash</p>", 40)).toBe("Colour: yellow Fabric : Mesh Hand wash")
  })
})

describe("redaction", () => {
  it("masks emails and redacts secrets, cards and addresses", () => {
    expect(maskEmail("adaeze@example.com")).toBe("a***@example.com")
    const out = redact({
      email: "adaeze@example.com",
      password: "hunter2hunter2",
      nested: { access_token: "abc", note: "card 4242 4242 4242 4242 used by bob@x.io" },
      address_1: "12 Allen Avenue",
      city: "Houston",
    })
    expect(out).toEqual({
      email: "a***@example.com",
      password: "[REDACTED]",
      nested: { access_token: "[REDACTED]", note: "card [REDACTED_NUMBER]used by b***@x.io" },
      address_1: "[REDACTED_ADDRESS]",
      city: "Houston",
    })
  })
})

describe("rate limiting and lockout", () => {
  it("limits per subject within a window", async () => {
    let now = 0
    const store = createMemoryCounterStore(() => now)
    const rule = { name: "t", limit: 2, windowMs: 1000 }
    expect((await hitRateLimit(store, rule, "ip1")).allowed).toBe(true)
    expect((await hitRateLimit(store, rule, "ip1")).allowed).toBe(true)
    expect((await hitRateLimit(store, rule, "ip1")).allowed).toBe(false)
    expect((await hitRateLimit(store, rule, "ip2")).allowed).toBe(true)
    now = 1001
    expect((await hitRateLimit(store, rule, "ip1")).allowed).toBe(true)
  })

  it("locks an account after repeated failures, temporarily", async () => {
    let now = 0
    const lock = createLockout(createMemoryCounterStore(() => now), { maxFailures: 3, windowMs: 10_000, lockMs: 60_000 })
    await lock.recordFailure("A@x.com")
    await lock.recordFailure("a@x.com")
    expect(await lock.isLocked("a@x.com")).toBe(false)
    expect((await lock.recordFailure("a@x.com")).locked).toBe(true)
    expect(await lock.isLocked("A@X.COM")).toBe(true)
    now = 60_001
    expect(await lock.isLocked("a@x.com")).toBe(false)
  })

  it("success clears the failure count", async () => {
    const lock = createLockout(createMemoryCounterStore(), { maxFailures: 2, windowMs: 10_000, lockMs: 60_000 })
    await lock.recordFailure("u")
    await lock.recordSuccess("u")
    expect((await lock.recordFailure("u")).locked).toBe(false)
  })
})

describe("headers and CSRF", () => {
  it("CSP uses nonces, no unsafe-inline scripts, and denies framing", () => {
    const csp = buildCsp({ nonce: "abc", apiOrigin: "https://api.haanta.com" })
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("frame-src 'none'")
    expect(csp).toContain("object-src 'none'")
  })

  it("CSP allows Stripe frames only when enabled", () => {
    const csp = buildCsp({ nonce: "n", apiOrigin: "https://api.haanta.com", stripe: true })
    expect(csp).toContain("frame-src https://js.stripe.com https://hooks.stripe.com")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it("sets HSTS, nosniff, referrer and permissions policies", () => {
    const h = securityHeaders()
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=63072000/)
    expect(h["X-Content-Type-Options"]).toBe("nosniff")
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
    expect(h["Permissions-Policy"]).toContain("camera=()")
  })

  it("requires a matching Origin on state-changing requests", () => {
    const allowed = ["https://www.haanta.com"]
    expect(isAllowedOrigin("GET", {}, allowed)).toBe(true)
    expect(isAllowedOrigin("POST", { origin: "https://www.haanta.com" }, allowed)).toBe(true)
    expect(isAllowedOrigin("POST", { origin: "https://evil.com" }, allowed)).toBe(false)
    expect(isAllowedOrigin("POST", {}, allowed)).toBe(false)
    expect(isAllowedOrigin("DELETE", { referer: "https://www.haanta.com/account" }, allowed)).toBe(true)
    expect(isAllowedOrigin("POST", { referer: "not a url" }, allowed)).toBe(false)
  })
})

describe("image uploads", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])
  const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

  it("detects JPEG, PNG and WebP by magic bytes", () => {
    expect(sniffImageType(jpeg)).toBe("image/jpeg")
    expect(sniffImageType(png)).toBe("image/png")
    expect(sniffImageType(webp)).toBe("image/webp")
    expect(sniffImageType(svg)).toBeNull()
  })

  it("rejects SVG, mismatched types, empty and oversized files", () => {
    expect(validateImageUpload(svg, "image/svg+xml")).toEqual({ ok: false, problem: "unsupported_type" })
    expect(validateImageUpload(png, "image/jpeg")).toEqual({ ok: false, problem: "type_mismatch" })
    expect(validateImageUpload(new Uint8Array(), "image/png")).toEqual({ ok: false, problem: "empty" })
    expect(validateImageUpload(jpeg, "image/jpeg", 3)).toEqual({ ok: false, problem: "too_large" })
    expect(validateImageUpload(jpeg, "image/jpeg")).toEqual({ ok: true, type: "image/jpeg" })
  })

  it("validates signed upload requests before signing", () => {
    expect(validateUploadRequest({ contentType: "image/svg+xml", size: 10 })).toBe("unsupported_type")
    expect(validateUploadRequest({ contentType: "image/png", size: 0 })).toBe("empty")
    expect(validateUploadRequest({ contentType: "image/png", size: 20 * 1024 * 1024 })).toBe("too_large")
    expect(validateUploadRequest({ contentType: "image/webp", size: 1000 })).toBeNull()
  })
})
