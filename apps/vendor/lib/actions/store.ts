"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { isHaantaImageUrl } from "../listing"
import { liteToHtml } from "../rich-text"
import { CARRIERS, NEXT_ORDER_STATUSES } from "../status"
import type { VendorOrderStatus } from "../types"
import { BACKEND_URL } from "../server/api"
import { fieldErrorsOf, RESOURCE_ID, str, type FormState } from "../server/forms"
import { mutate, type ActionResult } from "../server/session"

// ---------------------------------------------------------------- store page

const imageField = z.union([z.literal(""), z.string().max(500).refine((u) => isHaantaImageUrl(u, BACKEND_URL), "Upload images through Haanta")])

const storeSchema = z.object({
  logo_url: imageField,
  banner_url: imageField,
  story: z.string().max(8000, "Your story is too long"),
  policies: z.string().trim().max(5000, "Policies must be 5000 characters or fewer"),
  size_notes: z.string().trim().max(300, "Size notes must be 300 characters or fewer"),
  region: z.string().trim().max(120, "Region must be 120 characters or fewer"),
})

export async function saveStoreAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const raw = Object.fromEntries(["logo_url", "banner_url", "story", "policies", "size_notes", "region"].map((k) => [k, str(fd, k)]))
  const parsed = storeSchema.safeParse(raw)
  if (!parsed.success) return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error), values: raw }
  const d = parsed.data
  const story = liteToHtml(d.story)
  const r = await mutate("/vendor/store", {
    method: "POST",
    body: {
      logo_url: d.logo_url || null,
      banner_url: d.banner_url || null,
      story: story || null,
      policies: d.policies || null,
      size_notes: d.size_notes || null,
      region: d.region || null,
    },
  })
  if (!r.ok) return { error: r.error, values: raw }
  revalidatePath("/store")
  return { message: "Store page saved. The preview below shows the saved version." }
}

// ---------------------------------------------------------------- size charts

const chartSchema = z.object({
  name: z.string().trim().min(1, "Give the chart a name").max(80),
  unit: z.enum(["in", "cm"]),
  notes: z.string().trim().max(500, "Notes must be 500 characters or fewer"),
  columns: z.array(z.string().trim().max(30).regex(/^[a-z][a-z _-]*$/i, "Column names: letters, spaces, dashes")).max(12),
  rows: z
    .array(
      z.object({
        label: z.string().trim().min(1, "Every row needs a size label").max(30),
        us: z.string().trim().max(10, "US size: 10 characters max"),
        uk: z.string().trim().max(10, "UK size: 10 characters max"),
        eu: z.string().trim().max(10, "EU size: 10 characters max"),
        values: z.array(z.string().trim().max(20, "Measurements: 20 characters max")),
      }),
    )
    .min(1, "Add at least one size")
    .max(40, "Up to 40 sizes"),
})

export type SizeChartInput = z.infer<typeof chartSchema>

export async function saveSizeChartAction(id: string | null, input: SizeChartInput): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !RESOURCE_ID.test(id)) return { ok: false, error: "Unknown size chart" }
  const parsed = chartSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const i of parsed.error.issues) {
      const key = i.path[0] === "rows" && typeof i.path[1] === "number" ? `row-${i.path[1]}-${String(i.path[2] ?? "label")}` : String(i.path[0])
      fieldErrors[key] ??= i.message
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors }
  }
  const d = parsed.data
  const columns = d.columns.map((c) => c.toLowerCase())
  if (new Set(columns).size !== columns.length) return { ok: false, error: "Measurement columns must have different names", fieldErrors: { columns: "Measurement columns must have different names" } }
  const body = {
    name: d.name,
    unit: d.unit,
    notes: d.notes || null,
    rows: d.rows.map((r) => ({
      label: r.label,
      ...(r.us ? { us: r.us } : {}),
      ...(r.uk ? { uk: r.uk } : {}),
      ...(r.eu ? { eu: r.eu } : {}),
      measurements: Object.fromEntries(columns.map((c, i) => [c, r.values[i] ?? ""]).filter(([, v]) => v)),
    })),
  }
  const r = await mutate<{ size_chart: { id: string } }>(id ? `/vendor/size-charts/${id}` : "/vendor/size-charts", { method: "POST", body })
  if (!r.ok) return r
  revalidatePath("/size-charts")
  redirect("/size-charts?saved=1")
}

export async function deleteSizeChartAction(id: string): Promise<ActionResult> {
  if (!RESOURCE_ID.test(id)) return { ok: false, error: "Unknown size chart" }
  const r = await mutate(`/vendor/size-charts/${id}`, { method: "DELETE" })
  if (!r.ok) return r
  revalidatePath("/size-charts")
  redirect("/size-charts?deleted=1")
}

// ---------------------------------------------------------------- orders

const carrierValues = CARRIERS.map((c) => c.value) as [string, ...string[]]
const orderStatusSchema = z.discriminatedUnion("status", [
  z.object({ id: z.string().regex(RESOURCE_ID), from: z.string(), status: z.enum(["accepted", "in_production"]) }),
  z.object({
    id: z.string().regex(RESOURCE_ID),
    from: z.string(),
    status: z.literal("shipped_to_hub"),
    tracking_number: z.string().trim().regex(/^[A-Za-z0-9-]{6,40}$/, "Enter the tracking number (6–40 letters, numbers or dashes)"),
    tracking_carrier: z.enum(carrierValues, { error: "Choose the carrier" }),
  }),
])

export async function updateOrderStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = orderStatusSchema.safeParse({
    id: str(fd, "id"),
    from: str(fd, "from"),
    status: str(fd, "status"),
    tracking_number: str(fd, "tracking_number"),
    tracking_carrier: str(fd, "tracking_carrier"),
  })
  const values = { tracking_number: str(fd, "tracking_number"), tracking_carrier: str(fd, "tracking_carrier") }
  if (!parsed.success) return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error), values }
  const d = parsed.data
  const allowed = NEXT_ORDER_STATUSES[d.from as VendorOrderStatus] ?? []
  if (!allowed.includes(d.status)) return { error: "This order can't move to that status. Refresh the page to see its current status." }
  const r = await mutate(`/vendor/orders/${d.id}/status`, {
    method: "POST",
    body: d.status === "shipped_to_hub" ? { status: d.status, tracking_number: d.tracking_number, tracking_carrier: d.tracking_carrier } : { status: d.status },
  })
  if (!r.ok) return { error: r.error, values }
  revalidatePath("/orders")
  revalidatePath(`/orders/${d.id}`)
  return { message: d.status === "shipped_to_hub" ? "Marked as shipped to the Haanta hub. Thank you!" : "Order updated." }
}
