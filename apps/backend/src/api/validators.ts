/** Request validation for every custom route (zod at the boundary). Unknown keys are rejected. */
import { z } from "@medusajs/framework/zod"
import { STAFF_ROLES } from "../modules/security"
import { isAllowedImageUrl, listingSnapshotSchema } from "../lib/listing-schema"

const id = z.string().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/)
const text = (max: number) => z.string().trim().max(max)
const imageUrl = z.string().max(500).refine(isAllowedImageUrl, "Upload images through Haanta")
const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
}

// ---------------------------------------------------------------- shared

export const MfaConfirmBody = z.object({ code: z.string().regex(/^\d{6}$/) }).strict()
export const MfaVerifyBody = z
  .object({ code: z.string().regex(/^\d{6}$/).optional(), recovery_code: z.string().regex(/^[a-z0-9]{5}-[a-z0-9]{5}$/i).optional() })
  .strict()
  .refine((b) => !!b.code !== !!b.recovery_code, "Enter either a code or a recovery code")
export const PaginationQuery = z.object(pagination)

// ---------------------------------------------------------------- vendor

export const VendorApplicationBody = z
  .object({
    business_name: text(120).min(2),
    contact_name: text(120).min(2),
    origin_country: z.string().length(2).toUpperCase().default("NG"),
    region: text(120).optional(),
    story: text(5000).optional(),
    /** Stored for Haanta's review only; never fetched by the server. */
    website: z.string().url().max(300).optional(),
    instagram: text(60).optional(),
  })
  .strict()

export const AcceptInviteBody = z.object({ token: z.string().min(20).max(200), name: text(120).min(2) }).strict()
export const VerifyEmailBody = z.object({ token: z.string().min(20).max(200) }).strict()

export const StorePageBody = z
  .object({
    logo_url: imageUrl.nullable().optional(),
    banner_url: imageUrl.nullable().optional(),
    story: text(10_000).nullable().optional(),
    policies: text(5000).nullable().optional(),
    size_notes: text(300).nullable().optional(),
    region: text(120).nullable().optional(),
  })
  .strict()

export const ListingBody = z.object({ snapshot: listingSnapshotSchema }).strict()

export const PricePreviewBody = z
  .object({
    category_ids: z.array(id).max(5).default([]),
    variants: z.array(z.object({ vendor_price_minor: z.number().int().positive().max(100_000_000), vendor_currency: z.enum(["USD", "NGN"]).default("USD") }).strict()).min(1).max(100),
  })
  .strict()

export const SizeChartBody = z
  .object({
    name: text(80).min(1),
    unit: z.enum(["in", "cm"]).default("in"),
    rows: z
      .array(
        z
          .object({
            label: text(30).min(1),
            us: text(10).optional(),
            uk: text(10).optional(),
            eu: text(10).optional(),
            measurements: z.record(z.string().max(30).regex(/^[a-z][a-z _-]*$/i), text(20)).default({}),
          })
          .strict(),
      )
      .min(1)
      .max(40),
    notes: text(500).nullable().optional(),
  })
  .strict()

export const VendorOrderStatusBody = z
  .object({
    status: z.enum(["accepted", "in_production", "shipped_to_hub"]),
    tracking_number: z.string().trim().regex(/^[A-Za-z0-9-]{6,40}$/).optional(),
    tracking_carrier: z.enum(["dhl", "fedex", "ups", "gig", "fez", "other"]).optional(),
  })
  .strict()
  .refine((b) => b.status !== "shipped_to_hub" || (!!b.tracking_number && !!b.tracking_carrier), "Tracking number and carrier are required when shipping to the hub")

export const UploadSignBody = z
  .object({
    purpose: z.enum(["product", "logo", "banner"]),
    content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
    size: z.number().int().positive().max(10 * 1024 * 1024),
  })
  .strict()

export const VendorListQuery = z.object({ ...pagination, status: z.string().max(40).optional() })
export const StatementQuery = z.object({ format: z.enum(["pdf", "csv"]).default("pdf") })

// ---------------------------------------------------------------- admin

export const ReviewNoteBody = z.object({ note: text(1000).optional() }).strict()
export const RequestChangesBody = z.object({ note: text(1000).min(3) }).strict()
export const AdminEditListingBody = z.object({ snapshot: listingSnapshotSchema, note: text(1000).optional() }).strict()
export const VendorMarkupBody = z
  .object({ markup_bps: z.number().int().min(0).max(100_000).nullable(), markup_fixed_minor: z.number().int().min(0).max(10_000_000).nullable() })
  .strict()
export const CategoryMarkupBody = z
  .object({ category_id: id, markup_bps: z.number().int().min(0).max(100_000).nullable(), markup_fixed_minor: z.number().int().min(0).max(10_000_000).default(0) })
  .strict()
export const ProductMarkupBody = z
  .object({ product_id: id, markup_bps: z.number().int().min(0).max(100_000).nullable(), markup_fixed_minor: z.number().int().min(0).max(10_000_000).nullable() })
  .strict()
export const VendorInviteBody = z.object({ email: z.string().email().max(254).toLowerCase() }).strict()
export const RecordPayoutBody = z
  .object({
    vendor_id: id,
    amount_minor: z.number().int().positive().max(1_000_000_000),
    paid_at: z.coerce.date(),
    bank_reference: text(100).min(3),
    entry_ids: z.array(id).max(5000).optional(),
    note: text(500).optional(),
  })
  .strict()
export const DeliveredBody = z.object({ vendor_id: id.optional(), delivered_at: z.coerce.date().optional() }).strict()
export const RefundLinesBody = z
  .object({
    lines: z.array(z.object({ line_item_id: id, quantity: z.number().int().positive().max(1000) }).strict()).min(1).max(100),
    reason: z.enum(["refund", "return", "cancellation"]),
    note: text(500).optional(),
  })
  .strict()
export const StaffRoleBody = z.object({ user_id: id, role: z.enum(STAFF_ROLES) }).strict()
export const AuditQuery = z.object({ ...pagination, entity_type: text(60).optional(), entity_id: text(200).optional(), actor_id: text(64).optional(), action: text(100).optional() })
export const ModerateReviewBody = z.object({ status: z.enum(["approved", "rejected"]) }).strict()
export const PrivacyDeleteBody = z.object({ confirm: z.literal("DELETE") }).strict()
export const DashboardQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })
export const AdminOrdersQuery = z.object({ ...pagination, origin: z.enum(["us", "ng", "mixed"]).optional(), risk: z.enum(["review"]).optional() })

// ---------------------------------------------------------------- store

export const SearchQuery = z.object({
  q: text(100).optional(),
  category: text(80).optional(),
  brand: z.union([text(80), z.array(text(80)).max(20)]).optional(),
  style: z.union([text(40), z.array(text(40)).max(20)]).optional(),
  region: z.union([text(80), z.array(text(80)).max(20)]).optional(),
  size: z.union([text(30), z.array(text(30)).max(30)]).optional(),
  color: z.union([text(30), z.array(text(30)).max(30)]).optional(),
  ships_from: z.enum(["lagos", "houston"]).optional(),
  fulfilment: z.enum(["ready_to_wear", "made_to_order", "preorder"]).optional(),
  shop: text(60).optional(),
  price_min: z.coerce.number().min(0).max(100_000).optional(),
  price_max: z.coerce.number().min(0).max(100_000).optional(),
  currency: z.enum(["usd", "cad", "USD", "CAD"]).default("usd"),
  on_sale: z.coerce.boolean().optional(),
  sort: z.enum(["relevance", "newest", "price_asc", "price_desc", "best_selling"]).default("relevance"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
})

export const ReviewCreateBody = z
  .object({
    rating: z.number().int().min(1).max(5),
    title: text(120).optional(),
    body: text(3000).min(10),
    fit: z.enum(["runs_small", "true_to_size", "runs_large"]).optional(),
    photos: z.array(imageUrl).max(4).default([]),
  })
  .strict()

export const NewsletterBody = z.object({ email: z.string().email().max(254).toLowerCase(), source: z.enum(["popup", "footer", "checkout"]).default("footer") }).strict()
export const TrackingLookupBody = z.object({ order_number: z.coerce.number().int().positive().max(1e9), email: z.string().email().max(254).toLowerCase() }).strict()
export const ShippingQuoteBody = z.object({}).strict()
