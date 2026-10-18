"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Dialog } from "@/components/ui/Dialog"
import { setCountryAction } from "@/app/actions/cart"
import { COUNTRIES, type Country } from "@/lib/site"
import type { Panel } from "./NavMenu"

/** Menu button + mobile drawer (accordions per department, ship-to country). */
export function NavDrawer({ panels, country }: { panels: Panel[]; country: Country }) {
  const [drawer, setDrawer] = useState(false)
  const pathname = usePathname()
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setDrawer(false)
  }
  return (
    <>
      <button type="button" className="s-menu-btn s-icon-btn" aria-haspopup="dialog" onClick={() => setDrawer(true)} data-testid="mobile-menu-button">
        <svg aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M3 7h18M3 12h18M3 17h12" />
        </svg>
        <span className="h-sr-only">Menu</span>
      </button>
      <Dialog open={drawer} onClose={() => setDrawer(false)} title="Menu" size="sm" testId="mobile-menu">
        <nav aria-label="Mobile">
          <ul className="s-drawer-nav">
            {panels.map((p) => (
              <li key={p.key}>
                {p.links.length ? (
                  <details>
                    <summary>{p.label}</summary>
                    <ul>
                      <li>
                        <Link href={p.all.href}>{p.all.label}</Link>
                      </li>
                      {p.links.map((l) => (
                        <li key={l.href}>
                          <Link href={l.href}>{l.label}</Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <Link href={p.all.href}>{p.label}</Link>
                )}
              </li>
            ))}
            <li>
              <Link href="/brands">Designers A–Z</Link>
            </li>
            <li>
              <Link href="/journal">Journal</Link>
            </li>
            <li>
              <Link href="/track">Track an order</Link>
            </li>
            <li>
              <Link href="/help/shipping">Shipping and returns</Link>
            </li>
          </ul>
          <form action={setCountryAction} className="s-drawer-country">
            <fieldset>
              <legend className="s-label">Ship to</legend>
              {COUNTRIES.map((c) => (
                <label key={c.code} className="s-check">
                  <input type="radio" name="country" value={c.code} defaultChecked={c.code === country} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
                  <span>
                    {c.name} ({c.currency.toUpperCase()})
                  </span>
                </label>
              ))}
            </fieldset>
          </form>
        </nav>
      </Dialog>
    </>
  )
}
