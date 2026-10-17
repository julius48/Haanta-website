import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { SizeChartEditor } from "@/components/size-chart-form"
import { chartToDraft } from "@/lib/size-chart"
import { RESOURCE_ID } from "@/lib/server/forms"
import { getMe, vendorGetOrNull } from "@/lib/server/session"
import type { SizeChart } from "@/lib/types"

export const metadata: Metadata = { title: "Edit size chart" }

export default async function EditSizeChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!RESOURCE_ID.test(id)) notFound()
  const [me, data] = await Promise.all([getMe(), vendorGetOrNull<{ size_chart: SizeChart }>(`/vendor/size-charts/${id}`)])
  if (!data) notFound()
  return (
    <>
      <p>
        <Link href="/size-charts">← All size charts</Link>
      </p>
      <h1>{data.size_chart.name}</h1>
      <SizeChartEditor chartId={data.size_chart.id} initial={chartToDraft(data.size_chart)} canEdit={me?.vendor.status !== "paused" && me?.vendor.status !== "rejected"} />
    </>
  )
}
