import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ProductEditor } from "@/components/product-form"
import { snapshotToForm } from "@/lib/listing"
import { pathForCategoryIds } from "@/lib/server/categories"
import { RESOURCE_ID } from "@/lib/server/forms"
import { getMe, vendorGet, vendorGetOrNull } from "@/lib/server/session"
import type { ProductDetail, SizeChart } from "@/lib/types"

export const metadata: Metadata = { title: "Edit product" }

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  if (!RESOURCE_ID.test(id)) notFound()
  const sp = await searchParams
  const [me, detail, charts] = await Promise.all([getMe(), vendorGetOrNull<ProductDetail>(`/vendor/products/${id}`), vendorGet<{ size_charts: SizeChart[] }>("/vendor/size-charts")])
  if (!detail) notFound()
  const snapshot = detail.snapshot
  const categoryPath = await pathForCategoryIds(snapshot?.category_ids)
  const status = me?.vendor.status
  return (
    <>
      <p>
        <Link href="/products">← All products</Link>
      </p>
      <h1>{detail.product.title || "Untitled product"}</h1>
      <ProductEditor
        key={detail.product.updated_at}
        productId={detail.product.id}
        initial={snapshotToForm(snapshot, categoryPath)}
        listing={detail.product}
        sizeCharts={charts.size_charts.map((c) => ({ id: c.id, name: c.name }))}
        canEdit={status !== "paused" && status !== "rejected"}
        canSubmit={status === "active"}
        savedDescriptionHtml={snapshot?.description || null}
        initialPrices={detail.prices}
        flash={sp.submitted ? "submitted" : sp.saved ? "saved" : null}
      />
    </>
  )
}
