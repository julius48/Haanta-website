import { createHmac } from "node:crypto"

/** RFC 4648 base32 → bytes. */
export function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "")
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch)
    if (idx === -1) throw new Error(`invalid base32 character ${ch}`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** RFC 6238 TOTP: HMAC-SHA1, 30 s period, 6 digits. */
export function totp(secret: string, now = Date.now(), stepOffset = 0): string {
  const counter = Math.floor(now / 1000 / 30) + stepOffset
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest()
  const offset = h[h.length - 1]! & 0x0f
  const code = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(code).padStart(6, "0")
}
