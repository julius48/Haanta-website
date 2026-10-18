/**
 * Made-to-order measurements (inches). Mirrors the backend allow-list and ranges
 * (apps/backend/src/api/middlewares/cart.ts). Used for client hints and server-side validation.
 */
import type { RequiredMeasurement } from "./types"

export const MEASUREMENT_FIELDS = {
  bust: { label: "Bust", min: 20, max: 80 },
  waist: { label: "Waist", min: 18, max: 70 },
  hips: { label: "Hips", min: 20, max: 80 },
  height: { label: "Height", min: 40, max: 90 },
  shoulder: { label: "Shoulder width", min: 10, max: 30 },
  arm_length: { label: "Arm length", min: 15, max: 40 },
  inseam: { label: "Inseam", min: 15, max: 45 },
  dress_length: { label: "Dress length", min: 15, max: 70 },
} as const

export type MeasurementKey = keyof typeof MEASUREMENT_FIELDS

export function isMeasurementKey(k: string): k is MeasurementKey {
  return Object.prototype.hasOwnProperty.call(MEASUREMENT_FIELDS, k)
}

export type MeasurementValues = Partial<Record<MeasurementKey, number>> & { notes?: string }

export type MeasurementResult = { ok: true; value: MeasurementValues } | { ok: false; errors: Record<string, string> }

/**
 * Validate the measurements a product requires. Unknown keys are ignored, every required key must
 * be a number within the backend's range, and notes are trimmed to 300 characters.
 */
export function validateMeasurements(required: RequiredMeasurement[], input: Record<string, string | number | undefined | null>): MeasurementResult {
  const errors: Record<string, string> = {}
  const value: MeasurementValues = {}
  for (const r of required) {
    if (!isMeasurementKey(r.key)) continue
    const field = MEASUREMENT_FIELDS[r.key]
    const min = Math.max(field.min, r.min ?? field.min)
    const max = Math.min(field.max, r.max ?? field.max)
    const raw = input[r.key]
    const s = raw == null ? "" : String(raw).trim()
    if (s === "") {
      errors[r.key] = `Enter your ${field.label.toLowerCase()} in inches`
      continue
    }
    const n = Number(s)
    if (!Number.isFinite(n)) {
      errors[r.key] = `${field.label} must be a number`
      continue
    }
    if (n < min || n > max) {
      errors[r.key] = `${field.label} must be between ${min} and ${max} inches`
      continue
    }
    value[r.key] = Math.round(n * 10) / 10
  }
  const notes = input.notes == null ? "" : String(input.notes).trim()
  if (notes.length > 300) errors.notes = "Notes must be 300 characters or fewer"
  else if (notes) value.notes = notes
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value }
}

/**
 * Optional custom sizing (any product): only the fields the shopper filled in are checked, each
 * against the backend range. An empty form is valid and returns just the notes, if any.
 */
export function validateOptionalMeasurements(input: Record<string, string | number | undefined | null>): MeasurementResult {
  const filled = (Object.keys(MEASUREMENT_FIELDS) as MeasurementKey[]).filter((k) => input[k] != null && String(input[k]).trim() !== "")
  return validateMeasurements(
    filled.map((k) => ({ key: k, label: MEASUREMENT_FIELDS[k].label, min: MEASUREMENT_FIELDS[k].min, max: MEASUREMENT_FIELDS[k].max, unit: "in" })),
    input,
  )
}

export function formatMeasurements(m: Record<string, number | string> | undefined | null): { label: string; value: string }[] {
  if (!m) return []
  return Object.entries(m).map(([k, v]) => ({
    label: isMeasurementKey(k) ? MEASUREMENT_FIELDS[k].label : k === "notes" ? "Notes" : k,
    value: typeof v === "number" ? `${v} in` : String(v),
  }))
}
