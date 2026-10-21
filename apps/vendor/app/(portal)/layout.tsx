import Link from "next/link"
import { Wordmark } from "@haanta/ui"
import { PortalFrame } from "@/components/portal-nav"
import { requireVendor } from "@/lib/server/session"
import type { VendorStatus } from "@/lib/types"

function StatusBanner({ status }: { status: VendorStatus }) {
  if (status === "active") return null
  const text: Record<Exclude<VendorStatus, "active">, { title: string; body: string }> = {
    pending: {
      title: "Your store is awaiting Haanta approval.",
      body: "You can set up your store page, size charts and product drafts now. You'll be able to submit products for review once we approve your store.",
    },
    paused: { title: "Your store is paused.", body: "Your store is read-only except for orders. Contact Haanta to reactivate it." },
    rejected: { title: "Your application was not approved.", body: "Contact Haanta if you have questions." },
  }
  const t = text[status]
  return (
    <div className={`v-banner v-banner--${status}`} role="status" data-testid="status-banner">
      <div className="h-container">
        <strong>{t.title}</strong> {t.body}
      </div>
    </div>
  )
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireVendor()
  return (
    <PortalFrame
      brand={
        <Link href="/dashboard" className="v-brand">
          <Wordmark tone="brown" />
          <span className="v-brand__label">Partner Portal</span>
          <span className="h-sr-only">, {me.vendor.name}</span>
        </Link>
      }
      banner={<StatusBanner status={me.vendor.status} />}
    >
      {children}
    </PortalFrame>
  )
}
