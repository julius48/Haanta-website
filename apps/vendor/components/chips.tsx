import { LISTING_STATUS_LABEL, ORDER_STATUS_LABEL } from "@/lib/status"
import type { ListingView, VendorOrderStatus } from "@/lib/types"

export function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`v-chip v-chip--${tone}`}>{children}</span>
}

/** Status chip for a listing, plus "Pending changes" when a live product has edits in review. */
export function ListingChips({ product }: { product: Pick<ListingView, "status" | "is_live" | "has_pending_changes"> }) {
  const showLive = product.is_live && product.status !== "live"
  return (
    <span className="v-row" data-testid="listing-status">
      {showLive ? <Chip tone="live">Live</Chip> : null}
      <Chip tone={product.status}>{product.has_pending_changes && product.status === "in_review" ? "Pending changes in review" : LISTING_STATUS_LABEL[product.status]}</Chip>
    </span>
  )
}

export function OrderChip({ status }: { status: VendorOrderStatus }) {
  return <Chip tone={status}>{ORDER_STATUS_LABEL[status] ?? status}</Chip>
}
