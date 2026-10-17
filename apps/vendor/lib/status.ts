/** Labels and transitions for listing and order statuses (mirrors the backend rules). */
import type { ListingStatus, VendorOrderStatus } from "./types"

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  live: "Live",
  changes_requested: "Changes requested",
}

export const LISTING_FILTERS: { value: ListingStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "in_review", label: "In review" },
  { value: "live", label: "Live" },
  { value: "changes_requested", label: "Changes requested" },
]

export const ORDER_STATUS_LABEL: Record<VendorOrderStatus, string> = {
  new: "New",
  accepted: "Accepted",
  in_production: "In production",
  shipped_to_hub: "Shipped to hub",
  received_at_hub: "Received at hub",
  cancelled: "Cancelled",
}

export const ORDER_TABS: { value: VendorOrderStatus | "all"; label: string }[] = [
  { value: "new", label: "New" },
  { value: "accepted", label: "Accepted" },
  { value: "in_production", label: "In production" },
  { value: "shipped_to_hub", label: "Shipped to hub" },
  { value: "all", label: "All" },
]

/** Same table as apps/backend/src/lib/vendor-orders.ts NEXT_STATUSES. */
export const NEXT_ORDER_STATUSES: Record<VendorOrderStatus, ("accepted" | "in_production" | "shipped_to_hub")[]> = {
  new: ["accepted"],
  accepted: ["in_production", "shipped_to_hub"],
  in_production: ["shipped_to_hub"],
  shipped_to_hub: [],
  received_at_hub: [],
  cancelled: [],
}

export const CARRIERS = [
  { value: "dhl", label: "DHL" },
  { value: "fedex", label: "FedEx" },
  { value: "ups", label: "UPS" },
  { value: "gig", label: "GIG Logistics" },
  { value: "fez", label: "Fez Delivery" },
  { value: "other", label: "Other" },
] as const
export type Carrier = (typeof CARRIERS)[number]["value"]

export function isOrderLate(o: { ship_by: string | null; status: string; is_late?: boolean }, now = Date.now()): boolean {
  if (typeof o.is_late === "boolean") return o.is_late
  if (!o.ship_by) return false
  if (!["new", "accepted", "in_production"].includes(o.status)) return false
  return new Date(o.ship_by).getTime() < now
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d)
}
