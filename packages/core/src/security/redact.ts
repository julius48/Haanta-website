/**
 * Redaction for logs, analytics and error reports: never send passwords, tokens, card data or full
 * addresses; mask emails.
 */

const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie|api[_-]?key|otp|totp|recovery|card|cvc|cvv|pan|iban|account_number|session/i
const ADDRESS_KEYS = /^(address(_?\d)?|address_line_?\d|street|line[12]|postal_code|postcode|zip|phone)$/i

export function maskEmail(email: string): string {
  const at = email.indexOf("@")
  if (at < 1) return "***"
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  return `${local[0]}***@${domain}`
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
/** Long digit runs that look like card numbers (13–19 digits, optional spaces/dashes). */
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g

export function redactString(s: string): string {
  return s.replace(EMAIL_RE, (m) => maskEmail(m)).replace(CARD_RE, "[REDACTED_NUMBER]")
}

export function redact<T>(value: T, depth = 0): T {
  if (depth > 8) return "[TRUNCATED]" as T
  if (typeof value === "string") return redactString(value) as T
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as T
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.test(k)) out[k] = "[REDACTED]"
      else if (ADDRESS_KEYS.test(k)) out[k] = "[REDACTED_ADDRESS]"
      else out[k] = redact(v, depth + 1)
    }
    return out as T
  }
  return value
}
