import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SizeChartEditor } from "@/components/size-chart-form"
import { emptySizeChart } from "@/lib/size-chart"
import { getMe } from "@/lib/server/session"

export const metadata: Metadata = { title: "New size chart" }

export default async function NewSizeChartPage() {
  const me = await getMe()
  if (me?.vendor.status === "paused" || me?.vendor.status === "rejected") redirect("/size-charts")
  return (
    <>
      <p>
        <Link href="/size-charts">← All size charts</Link>
      </p>
      <h1>New size chart</h1>
      <SizeChartEditor chartId={null} initial={emptySizeChart()} canEdit />
    </>
  )
}
