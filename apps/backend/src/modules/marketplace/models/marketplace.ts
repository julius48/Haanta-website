import { model } from "@medusajs/framework/utils"

export const VENDOR_STATUSES = ["pending", "active", "paused", "rejected"] as const
export const LISTING_STATUSES = ["draft", "in_review", "live", "changes_requested"] as const
export const FULFILMENT_TYPES = ["ready_to_wear", "made_to_order"] as const
export const VENDOR_ORDER_STATUSES = ["new", "accepted", "in_production", "shipped_to_hub", "received_at_hub", "cancelled"] as const
export const STOCK_LOCATIONS = ["lagos", "houston"] as const

export const Vendor = model
  .define("vendor", {
    id: model.id({ prefix: "ven" }).primaryKey(),
    name: model.text().searchable(),
    slug: model.text().unique(),
    logo_url: model.text().nullable(),
    banner_url: model.text().nullable(),
    /** Sanitised rich text. */
    story: model.text().nullable(),
    origin_country: model.text().default("NG"),
    region: model.text().nullable(),
    size_notes: model.text().nullable(),
    policies: model.text().nullable(),
    contact_email: model.text().nullable(),
    markup_bps: model.number().nullable(),
    markup_fixed_minor: model.number().nullable(),
    status: model.enum([...VENDOR_STATUSES]).default("pending"),
    approved_at: model.dateTime().nullable(),
    users: model.hasMany(() => VendorUser, { mappedBy: "vendor" }),
    size_charts: model.hasMany(() => SizeChart, { mappedBy: "vendor" }),
  })

export const VendorUser = model.define("vendor_user", {
  id: model.id({ prefix: "venu" }).primaryKey(),
  email: model.text().unique(),
  name: model.text(),
  role: model.enum(["owner", "staff"]).default("owner"),
  email_verified_at: model.dateTime().nullable(),
  vendor: model.belongsTo(() => Vendor, { mappedBy: "users" }),
})

/** Single-use tokens for vendor email verification and invites. Only hashes are stored. */
export const VerificationToken = model.define("verification_token", {
  id: model.id({ prefix: "vtok" }).primaryKey(),
  purpose: model.enum(["vendor_email", "vendor_invite"]),
  subject: model.text(),
  token_hash: model.text().unique(),
  expires_at: model.dateTime(),
  used_at: model.dateTime().nullable(),
})

export const SizeChart = model.define("size_chart", {
  id: model.id({ prefix: "szc" }).primaryKey(),
  name: model.text(),
  unit: model.enum(["in", "cm"]).default("in"),
  /** [{ label, us, uk, eu, measurements: { bust, waist, hip } }] */
  rows: model.json(),
  notes: model.text().nullable(),
  vendor: model.belongsTo(() => Vendor, { mappedBy: "size_charts" }),
})

/**
 * A vendor's product and its review state. The live Medusa product always holds the approved
 * version; edits wait in pending_snapshot until Haanta approves them.
 */
export const ProductListing = model
  .define("product_listing", {
    id: model.id({ prefix: "plst" }).primaryKey(),
    vendor_id: model.text(),
    product_id: model.text().nullable(),
    status: model.enum([...LISTING_STATUSES]).default("draft"),
    title: model.text().searchable(),
    pending_snapshot: model.json().nullable(),
    approved_snapshot: model.json().nullable(),
    review_note: model.text().nullable(),
    submitted_at: model.dateTime().nullable(),
    reviewed_at: model.dateTime().nullable(),
    reviewed_by: model.text().nullable(),
    weight_missing: model.boolean().default(false),
    size_chart_missing: model.boolean().default(false),
  })
  .indexes([{ on: ["vendor_id", "status"] }, { on: ["product_id"], unique: true, where: "product_id IS NOT NULL" }])

/** Haanta merchandising attributes for a published product (also mirrored to product metadata for the storefront). */
export const ProductAttributes = model
  .define("product_attributes", {
    id: model.id({ prefix: "pattr" }).primaryKey(),
    product_id: model.text().unique(),
    vendor_id: model.text(),
    fulfilment_type: model.enum([...FULFILMENT_TYPES]).default("ready_to_wear"),
    lead_time_days: model.number().nullable(),
    is_preorder: model.boolean().default(false),
    required_measurements: model.array(),
    size_chart_id: model.text().nullable(),
    fit_notes: model.text().nullable(),
    styles: model.array(),
    shops: model.array(),
    merch: model.array(),
    weight_missing: model.boolean().default(false),
    /** Product-level markup override (finance role only). */
    markup_bps: model.number().nullable(),
    markup_fixed_minor: model.number().nullable(),
  })
  .indexes([{ on: ["vendor_id"] }])

/** Category-level markup override (finance role only). */
export const CategoryMarkup = model.define("category_markup", {
  id: model.id({ prefix: "cmk" }).primaryKey(),
  category_id: model.text().unique(),
  markup_bps: model.number(),
  markup_fixed_minor: model.number().default(0),
})

/** Server-computed prices per variant. Source of truth for vendor price; retail is pushed to Medusa prices. */
export const VariantPricing = model
  .define("variant_pricing", {
    id: model.id({ prefix: "vpr" }).primaryKey(),
    variant_id: model.text().unique(),
    product_id: model.text(),
    vendor_id: model.text(),
    vendor_price_minor: model.number(),
    retail_usd_minor: model.number(),
    retail_cad_minor: model.number(),
    markup_bps: model.number(),
    markup_fixed_minor: model.number(),
    markup_source: model.text(),
    stock_location: model.enum([...STOCK_LOCATIONS]).default("lagos"),
    fulfilment_type: model.enum([...FULFILMENT_TYPES]).nullable(),
    weight_kg: model.number().nullable(),
  })
  .indexes([{ on: ["product_id"] }, { on: ["vendor_id"] }])

/** Vendor price and retail captured on each order line at purchase. Immutable. */
export const LinePriceSnapshot = model
  .define("line_price_snapshot", {
    id: model.id({ prefix: "lps" }).primaryKey(),
    order_id: model.text(),
    line_item_id: model.text().unique(),
    variant_id: model.text().nullable(),
    product_id: model.text().nullable(),
    vendor_id: model.text(),
    product_title: model.text().nullable(),
    variant_title: model.text().nullable(),
    fulfilment_type: model.text().nullable(),
    quantity: model.number(),
    vendor_price_minor: model.number(),
    retail_price_minor: model.number(),
    currency: model.text(),
    markup_bps: model.number(),
    markup_fixed_minor: model.number(),
    markup_source: model.text(),
    stock_location: model.text(),
  })
  .indexes([{ on: ["order_id"] }, { on: ["vendor_id"] }])

/** One per (order, vendor): the vendor's part of an order and its fulfilment progress. */
export const VendorOrder = model
  .define("vendor_order", {
    id: model.id({ prefix: "vord" }).primaryKey(),
    order_id: model.text(),
    display_id: model.text(),
    vendor_id: model.text(),
    status: model.enum([...VENDOR_ORDER_STATUSES]).default("new"),
    tracking_number: model.text().nullable(),
    tracking_carrier: model.text().nullable(),
    ship_by: model.dateTime().nullable(),
    accepted_at: model.dateTime().nullable(),
    shipped_at: model.dateTime().nullable(),
    received_at: model.dateTime().nullable(),
    is_preorder: model.boolean().default(false),
  })
  .indexes([{ on: ["order_id", "vendor_id"], unique: true }, { on: ["vendor_id", "status"] }])
