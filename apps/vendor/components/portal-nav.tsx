"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, type ReactNode } from "react"

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/orders", label: "Orders" },
  { href: "/earnings", label: "Earnings" },
  { href: "/store", label: "Store page" },
  { href: "/size-charts", label: "Size charts" },
  { href: "/account", label: "Account" },
]

/**
 * Portal frame: top bar (brand slot + menu button on phones), navigation (disclosure on phones,
 * sidebar on desktop) and the page content.
 */
export function PortalFrame({ brand, banner, children }: { brand: ReactNode; banner?: ReactNode; children: ReactNode }) {
  const pathname = usePathname()
  const [openAt, setOpenAt] = useState<string | null>(null)
  // The menu closes on navigation: it is "open" only for the path it was opened on.
  const open = openAt === pathname
  return (
    <>
      <header className="v-topbar">
        <div className="h-container v-topbar__inner">
          {brand}
          <button type="button" className="v-menu-toggle" aria-expanded={open} aria-controls="portal-nav" onClick={() => setOpenAt(open ? null : pathname)}>
            {open ? "Close menu" : "Menu"}
          </button>
        </div>
      </header>
      {banner}
      <div className="v-layout">
        <nav id="portal-nav" className="v-sidenav" aria-label="Partner portal" data-open={open}>
          <ul className="v-nav-list">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <li key={item.href}>
                  <Link className="v-nav-link" href={item.href} aria-current={active ? "page" : undefined} data-testid={`nav-${item.href.slice(1)}`}>
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <main id="main" className="v-main" tabIndex={-1}>
          <div className="h-container">{children}</div>
        </main>
      </div>
    </>
  )
}
