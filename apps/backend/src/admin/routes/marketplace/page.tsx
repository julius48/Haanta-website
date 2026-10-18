import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChartBar } from "@medusajs/icons"
import { Badge, Container, Heading, Select, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { haantaApi, usd } from "../../lib/api"
import { ErrorOrMfa } from "../../components/needs-mfa"

interface Dashboard {
  today: { sales_usd: number; orders: number; average_order_value_usd: number; conversion_rate: number; live_visitors: number }
  period: { days: number; sales_usd: number; orders: number; series: { date: string; sales_usd: number; orders: number }[] }
  funnel: { carts: number; with_items: number; with_email: number; with_shipping: number; at_payment: number; completed: number }
  abandoned_carts: { count: number; value_usd: number }
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Container className="flex flex-col gap-y-1 px-6 py-4">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Text size="xlarge" weight="plus">
        {value}
      </Text>
      {hint ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          {hint}
        </Text>
      ) : null}
    </Container>
  )
}

/** Haanta marketplace overview: today's trading, the sales trend, the checkout funnel and open work. */
const MarketplacePage = () => {
  const [days, setDays] = useState("30")
  const [data, setData] = useState<Dashboard | null>(null)
  const [queue, setQueue] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    setError(null)
    haantaApi<Dashboard>(`/dashboard?days=${days}`).then(setData, setError)
    haantaApi<{ count: number }>("/review-queue").then((r) => setQueue(r.count), () => setQueue(null))
  }, [days])

  if (error) return <ErrorOrMfa error={error} />
  if (!data) return <Container><Text className="text-ui-fg-subtle">Loading…</Text></Container>

  const max = Math.max(1, ...data.period.series.map((s) => s.sales_usd))
  const f = data.funnel
  const steps: [string, number][] = [
    ["Carts started", f.carts],
    ["Added items", f.with_items],
    ["Gave email", f.with_email],
    ["Chose shipping", f.with_shipping],
    ["Reached payment", f.at_payment],
    ["Ordered", f.completed],
  ]

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h1">Marketplace</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Sales in USD (CAD converted at the configured rate). Updated live.
          </Text>
        </div>
        <div className="flex items-center gap-3">
          {queue ? (
            <Link to="/review-queue">
              <Badge color="orange">{queue} listing{queue === 1 ? "" : "s"} waiting for review</Badge>
            </Link>
          ) : (
            <Badge color="green">Review queue clear</Badge>
          )}
          <div className="w-36">
            <Select value={days} onValueChange={setDays} size="small">
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="7">Last 7 days</Select.Item>
                <Select.Item value="30">Last 30 days</Select.Item>
                <Select.Item value="90">Last 90 days</Select.Item>
              </Select.Content>
            </Select>
          </div>
        </div>
      </Container>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Sales today" value={usd(data.today.sales_usd)} />
        <Kpi label="Orders today" value={String(data.today.orders)} />
        <Kpi label="Average order" value={usd(data.today.average_order_value_usd)} />
        <Kpi label="Conversion today" value={`${(data.today.conversion_rate * 100).toFixed(1)}%`} hint="Orders ÷ carts started" />
        <Kpi label="Shoppers right now" value={String(data.today.live_visitors)} hint="Active carts, last 5 minutes" />
      </div>

      <Container className="px-6 py-4">
        <div className="mb-4 flex items-baseline justify-between">
          <Heading level="h2">Sales, last {data.period.days} days</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {usd(data.period.sales_usd)} · {data.period.orders} orders
          </Text>
        </div>
        <div className="flex h-40 items-end gap-[2px]" role="img" aria-label={`Daily sales over the last ${data.period.days} days`}>
          {data.period.series.map((s) => (
            <div
              key={s.date}
              title={`${s.date}: ${usd(s.sales_usd)}, ${s.orders} orders`}
              className="bg-ui-fg-interactive flex-1 rounded-t-sm"
              style={{ height: `${Math.max(2, (s.sales_usd / max) * 100)}%`, opacity: s.sales_usd ? 1 : 0.2 }}
            />
          ))}
        </div>
      </Container>

      <div className="grid gap-3 lg:grid-cols-2">
        <Container className="px-6 py-4">
          <Heading level="h2" className="mb-3">
            Checkout funnel
          </Heading>
          <ul className="flex flex-col gap-y-2">
            {steps.map(([label, n]) => (
              <li key={label} className="flex items-center gap-3">
                <Text size="small" className="w-36 shrink-0">
                  {label}
                </Text>
                <div className="bg-ui-bg-subtle h-3 flex-1 rounded">
                  <div className="bg-ui-fg-interactive h-3 rounded" style={{ width: `${f.carts ? (n / f.carts) * 100 : 0}%` }} />
                </div>
                <Text size="small" className="w-10 text-right">
                  {n}
                </Text>
              </li>
            ))}
          </ul>
        </Container>
        <Container className="flex flex-col gap-y-2 px-6 py-4">
          <Heading level="h2">Abandoned carts</Heading>
          <Text size="xlarge" weight="plus">
            {data.abandoned_carts.count} · {usd(data.abandoned_carts.value_usd)}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Carts with an email and items, idle for more than an hour. Klaviyo sends the reminder flow when connected.
          </Text>
        </Container>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({ label: "Marketplace", icon: ChartBar })
export default MarketplacePage
