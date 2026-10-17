/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30s) using node:crypto only, plus secret encryption at rest
 * (AES-256-GCM) and hashed single-use recovery codes.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function base32Encode(buf: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").replace(/\s/g, "").toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx === -1) throw new Error("Invalid base32")
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function hotp(secret: string, counter: number, digits = 6): string {
  const key = base32Decode(secret)
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac("sha1", key).update(msg).digest()
  const offset = h[h.length - 1]! & 0xf
  const code = ((h[offset]! & 0x7f) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!
  return String(code % 10 ** digits).padStart(digits, "0")
}

export function totp(secret: string, timeMs = Date.now(), stepS = 30): string {
  return hotp(secret, Math.floor(timeMs / 1000 / stepS))
}

/**
 * Verify a code within ±window steps. Returns the matched counter (so callers can reject reuse
 * of the same counter), or null.
 */
export function verifyTotp(
  secret: string,
  code: string,
  opts: { timeMs?: number; window?: number; lastUsedCounter?: number | null } = {},
): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const now = Math.floor((opts.timeMs ?? Date.now()) / 1000 / 30)
  const window = opts.window ?? 1
  for (let i = -window; i <= window; i++) {
    const counter = now + i
    if (opts.lastUsedCounter != null && counter <= opts.lastUsedCounter) continue
    const expected = Buffer.from(hotp(secret, counter))
    const given = Buffer.from(code)
    if (expected.length === given.length && timingSafeEqual(expected, given)) return counter
  }
  return null
}

export function otpauthUri(secret: string, account: string, issuer = "Haanta"): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

/** Key is 32 bytes, given as 64 hex chars or base64 (MFA_ENCRYPTION_KEY). */
function parseKey(key: string): Buffer {
  const buf = /^[0-9a-f]{64}$/i.test(key) ? Buffer.from(key, "hex") : Buffer.from(key, "base64")
  if (buf.length !== 32) throw new Error("MFA encryption key must be 32 bytes")
  return buf
}

export function encryptSecret(plain: string, key: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", parseKey(key), iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(".")
}

export function decryptSecret(payload: string, key: string): string {
  const [v, iv, tag, data] = payload.split(".")
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Invalid encrypted secret")
  const decipher = createDecipheriv("aes-256-gcm", parseKey(key), Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex")
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

/** Recovery codes are high-entropy, so a keyed SHA-256 is sufficient (no slow hash needed). */
export function hashRecoveryCode(code: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${code.trim().toLowerCase()}`).digest("hex")
}
