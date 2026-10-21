"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, type ReactNode } from "react"

/** 24px line icons (1.4 stroke), drawn to match the storefront's icon set. */
const ICONS: Record<string, ReactNode> = {
  dashboard: <path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z" />,
  products: (
    <>
      <path d="M8 4l-4 3 2 4 2-1v10h8V10l2 1 2-4-4-3" />
      <path d="M8 4c.5 1.8 2 3 4 3s3.5-1.2 4-3" />
    </>
  ),
  orders: (
    <>
      <path d="M5 8h14l-1 12H6z" />
      <path d="M9 8V6a3 3 0 016 0v2" />
    </>
  ),
  earnings: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M14.5 9.5c-.4-.9-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2.1-.6-2.5-1.5M12 6.5V8M12 16v1.5" />
    </>
  ),
  store: (
    <>
      <path d="M4 10l1.5-5h13L20 10M4 10h16M4 10v10h16V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  "size-charts": (
    <>
      <path d="M3 9h18v6H3z" />
      <path d="M7 9v3M11 9v2M15 9v3M19 9v2" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.6-4 4.5-6 8-6s6.4 2 8 6" />
    </>
  ),
}

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/orders", label: "Orders" },
  { href: "/earnings", label: "Earnings" },
  { href: "/store", label: "Store page" },
  { href: "/size-charts", label: "Size charts" },
  { href: "/account", label: "Account" },
]

function NavIcon({ name }: { name: string }) {
  return (
    <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  )
}

/**
 * Portal frame: an espresso sidebar (brand, navigation, studio footer) on desktop; on phones a top bar
 * with the brand and a menu button that discloses the same navigation.
 */
export function PortalFrame({ brand, banner, footer, children }: { brand: ReactNode; banner?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  const pathname = usePathname()
  const [openAt, setOpenAt] = useState<string | null>(null)
  // The menu closes on navigation: it is "open" only for the path it was opened on.
  const open = openAt === pathname
  return (
    <div className="v-shell">
      <header className="v-topbar">
        <div className="v-topbar__inner">
          {brand}
          <button type="button" className="v-menu-toggle" aria-expanded={open} aria-controls="portal-nav" onClick={() => setOpenAt(open ? null : pathname)}>
            {open ? "Close menu" : "Menu"}
          </button>
        </div>
      </header>
      <nav id="portal-nav" className="v-sidenav" aria-label="Partner portal" data-open={open}>
        <div className="v-sidenav__brand">{brand}</div>
        <ul className="v-nav-list">
          {NAV.map((item) => {
            const key = item.href.slice(1)
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <li key={item.href}>
                <Link className="v-nav-link" href={item.href} aria-current={active ? "page" : undefined} data-testid={`nav-${key}`}>
                  <NavIcon name={key} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
        {footer ? <div className="v-sidenav__foot">{footer}</div> : null}
      </nav>
      <div className="v-body">
        {banner}
        <main id="main" className="v-main" tabIndex={-1}>
          <div className="v-container">{children}</div>
        </main>
      </div>
    </div>
  )
}
