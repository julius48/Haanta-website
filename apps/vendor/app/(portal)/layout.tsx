import Link from "next/link"
import { Wordmark } from "@haanta/ui"
import { PortalFrame } from "@/components/portal-nav"
import { requireVendor } from "@/lib/server/session"
import type { VendorStatus } from "@/lib/types"

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "http://localhost:3000"

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
          <Wordmark tone="tan" />
          <span className="v-brand__label">Partner Portal</span>
          <span className="h-sr-only">, {me.vendor.name}</span>
        </Link>
      }
      banner={<StatusBanner status={me.vendor.status} />}
      footer={
        <div className="v-studio">
          <p className="v-studio__label">Your studio</p>
          <p className="v-studio__name">{me.vendor.name}</p>
          <a className="v-studio__link" href={`${STOREFRONT_URL}/brands/${me.vendor.slug}`} target="_blank" rel="noopener noreferrer">
            View your shop<span className="h-sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      }
    >
      {children}
    </PortalFrame>
  )
}
