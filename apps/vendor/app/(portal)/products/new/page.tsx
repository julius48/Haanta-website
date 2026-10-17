import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ProductEditor } from "@/components/product-form"
import { emptyProductForm } from "@/lib/listing"
import { getMe, vendorGet } from "@/lib/server/session"
import type { SizeChart } from "@/lib/types"

export const metadata: Metadata = { title: "Add a product" }

export default async function NewProductPage() {
  const [me, charts] = await Promise.all([getMe(), vendorGet<{ size_charts: SizeChart[] }>("/vendor/size-charts")])
  if (me?.vendor.status === "paused" || me?.vendor.status === "rejected") redirect("/products")
  return (
    <>
      <p>
        <Link href="/products">← All products</Link>
      </p>
      <h1>Add a product</h1>
      <p className="v-muted">Save a draft any time. When it&apos;s ready, submit it and Haanta will review it before it goes live.</p>
      <ProductEditor
        productId={null}
        initial={emptyProductForm()}
        listing={null}
        sizeCharts={charts.size_charts.map((c) => ({ id: c.id, name: c.name }))}
        canEdit
        canSubmit={me?.vendor.status === "active"}
        savedDescriptionHtml={null}
        initialPrices={[]}
        flash={null}
      />
    </>
  )
}
