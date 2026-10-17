import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { sanitizePlainText } from "@haanta/core"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../modules/marketplace"

/** Measurements a made-to-order item can ask for (inches). Vendors pick which are required per product. */
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
export type MeasurementField = keyof typeof MEASUREMENT_FIELDS

const measurementsSchema = z
  .object(
    Object.fromEntries(Object.keys(MEASUREMENT_FIELDS).map((k) => [k, z.coerce.number().positive().max(200).optional()])) as Record<MeasurementField, z.ZodOptional<z.ZodCoercedNumber>>,
  )
  .extend({ notes: z.string().max(300).optional() })
  .strict()

/**
 * Line item metadata is client supplied, so it is rebuilt from an allow-list: only validated
 * measurements survive. Anything else (prices, vendor ids, flags) is dropped. Made-to-order variants
 * must include every measurement the product requires.
 */
export async function guardLineItemMetadata(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const body = (req.body ?? {}) as { variant_id?: string; metadata?: Record<string, unknown> }
  const raw = body.metadata?.measurements
  let measurements: Record<string, number | string> | undefined
  if (raw !== undefined) {
    const parsed = measurementsSchema.safeParse(raw)
    if (!parsed.success) {
      res.status(400).json({ type: "invalid_data", code: "invalid_measurements", message: "Check your measurements" })
      return
    }
    measurements = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)) as Record<string, number | string>
    if (typeof measurements.notes === "string") measurements.notes = sanitizePlainText(measurements.notes, 300)
    for (const [k, v] of Object.entries(measurements)) {
      const f = MEASUREMENT_FIELDS[k as MeasurementField]
      if (f && typeof v === "number" && (v < f.min || v > f.max)) {
        res.status(400).json({ type: "invalid_data", code: "invalid_measurements", message: `${f.label} must be between ${f.min} and ${f.max} inches` })
        return
      }
    }
  }
  if (body.variant_id) {
    const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
    const [pricing] = await marketplace.listVariantPricings({ variant_id: body.variant_id })
    if (pricing) {
      const [attrs] = await marketplace.listProductAttributes({ product_id: pricing.product_id })
      const madeToOrder = (pricing.fulfilment_type ?? attrs?.fulfilment_type) === "made_to_order"
      const required = madeToOrder ? (attrs?.required_measurements ?? []) : []
      const missing = required.filter((k) => measurements?.[k] === undefined)
      if (missing.length) {
        res.status(400).json({
          type: "invalid_data",
          code: "measurements_required",
          message: `This piece is made to order. Please add: ${missing.map((k) => MEASUREMENT_FIELDS[k as MeasurementField]?.label ?? k).join(", ")}`,
          missing,
        })
        return
      }
    }
  }
  const metadata = measurements ? { measurements } : {}
  body.metadata = metadata
  req.body = body
  // Medusa's own validator may already have run; the handler reads validatedBody, so clean it too.
  const validated = (req as { validatedBody?: Record<string, unknown> }).validatedBody
  if (validated && typeof validated === "object") validated.metadata = metadata
  next()
}
