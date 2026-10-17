/** Money helpers. Haanta `*_minor` amounts are integer minor units (cents / kobo). */

export type VendorCurrency = "USD" | "NGN"

export function formatMinor(amountMinor: number, currency: string, locale = "en-US"): string {
  const c = currency.toUpperCase()
  const fractionDigits = Math.abs(amountMinor) % 100 === 0 ? 0 : 2
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: c, minimumFractionDigits: fractionDigits, maximumFractionDigits: 2 }).format(amountMinor / 100)
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${c}`
  }
}

/**
 * Parse a price typed by a vendor ("68", "68.5", "45,000.00") into minor units.
 * Returns null for anything that is not a positive amount with at most two decimals.
 */
export function parsePriceToMinor(input: string): number | null {
  const s = input.trim().replace(/,/g, "")
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [whole, frac = ""] = s.split(".")
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"))
  if (!Number.isSafeInteger(minor) || minor <= 0) return null
  return minor
}

/** Minor units back to an editable string ("6850" → "68.50", "6800" → "68"). */
export function minorToInput(minor: number | null | undefined): string {
  if (minor == null) return ""
  const whole = Math.trunc(minor / 100)
  const frac = Math.abs(minor % 100)
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0")}`
}
