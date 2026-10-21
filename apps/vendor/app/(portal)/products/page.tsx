import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ListingChips } from "@/components/chips"
import { Alert } from "@/components/fields"
import { getMe, vendorGet } from "@/lib/server/session"
import { formatDate, LISTING_FILTERS } from "@/lib/status"
import type { ListingStatus, ListingView } from "@/lib/types"

export const metadata: Metadata = { title: "Products" }

const STATUSES = new Set<string>(["draft", "in_review", "live", "changes_requested"])

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const status = typeof sp.status === "string" && STATUSES.has(sp.status) ? (sp.status as ListingStatus) : null
  const [me, data] = await Promise.all([getMe(), vendorGet<{ products: ListingView[]; count: number }>(`/vendor/products?limit=100${status ? `&status=${status}` : ""}`)])
  const canEdit = me?.vendor.status !== "paused" && me?.vendor.status !== "rejected"
  return (
    <>
      <div className="v-page-head">
        <div>
          <p className="v-eyebrow">Your collection</p>
          <h1>Products</h1>
        </div>
        {canEdit ? (
          <Link href="/products/new" className="h-btn h-btn--primary" data-testid="new-product">
            Add a product
          </Link>
        ) : null}
      </div>
      {sp.deleted ? <Alert tone="success" title="Draft deleted" /> : null}
      <nav aria-label="Filter products by status">
        <ul className="v-tabs">
          {LISTING_FILTERS.map((f) => {
            const active = (f.value === "all" && !status) || f.value === status
            return (
              <li key={f.value}>
                <Link className="v-tab" href={f.value === "all" ? "/products" : `/products?status=${f.value}`} aria-current={active ? "page" : undefined}>
                  {f.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      {data.products.length ? (
        <ul className="v-list v-card" data-testid="product-list">
          {data.products.map((p) => (
            <li key={p.id} className="v-row-item">
              <span className="v-row-item__thumb">
                {p.thumbnail ? <Image src={p.thumbnail} alt="" width={56} height={74} unoptimized /> : <span className="v-row-item__ph" aria-hidden="true" />}
              </span>
              <div className="v-row-item__body">
                <div className="v-item">
                  <Link className="v-item__title" href={`/products/${p.id}`}>
                    {p.title}
                  </Link>
                  <ListingChips product={p} />
                </div>
                <p className="v-small v-muted" style={{ margin: "var(--space-1) 0 0" }}>
                  Updated {formatDate(p.updated_at)}
                  {p.weight_missing ? " · Add weights so shipping can be quoted" : ""}
                  {p.size_chart_missing ? " · No size chart" : ""}
                </p>
                {p.review_note && (p.status === "changes_requested" || p.status === "draft") ? (
                  <p className="v-alert v-alert--warning v-small" style={{ margin: "var(--space-2) 0 0" }}>
                    <strong>Haanta&apos;s note:</strong> {p.review_note}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="v-card">
          <p>{status ? "No products with this status." : "You haven't added any products yet."}</p>
          {canEdit && !status ? (
            <Link href="/products/new" className="h-btn h-btn--primary">
              Add your first product
            </Link>
          ) : null}
        </div>
      )}
    </>
  )
}
