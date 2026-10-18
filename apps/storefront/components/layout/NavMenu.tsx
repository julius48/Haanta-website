"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Dialog } from "@/components/ui/Dialog"
import { setCountryAction } from "@/app/actions/cart"
import { COUNTRIES, type Country } from "@/lib/site"
import type { CategoryNode } from "@/lib/categories"

interface ShopLink {
  slug: string
  title: string
}

interface Panel {
  key: string
  label: string
  all: { href: string; label: string }
  links: { href: string; label: string }[]
  features: { href: string; label: string; image: string }[]
}

const EDITORIAL = {
  pink: "/images/editorial/editorial-womenswear-pink.webp",
  brown: "/images/editorial/hero-menswear-brown.webp",
  adire: "/images/editorial/editorial-adire-portrait.webp",
}

function buildPanels(categories: CategoryNode[], shops: ShopLink[]): Panel[] {
  const categoryPanels: Panel[] = categories.map((c) => ({
    key: c.handle,
    label: c.name,
    all: { href: `/shop/${c.handle}`, label: `Shop all ${c.name}` },
    links: c.children.map((ch) => ({ href: `/shop/${ch.handle}`, label: ch.name })),
    features: [
      { href: `/shop/${c.handle}?sort=newest`, label: "New in", image: c.handle === "men" ? EDITORIAL.brown : EDITORIAL.pink },
      { href: `/shop/${c.handle}?fulfilment=made_to_order`, label: "Made to order", image: EDITORIAL.adire },
    ],
  }))
  const shopsPanel: Panel = {
    key: "shops",
    label: "Curated shops",
    all: { href: "/shops", label: "All curated shops" },
    links: [...shops.map((s) => ({ href: `/shops/${s.slug}`, label: s.title })), { href: "/shop?ships_from=houston", label: "Ships from the US" }],
    features: [
      { href: "/shops/special-occasions", label: "Special occasions", image: EDITORIAL.pink },
      { href: "/brands", label: "Meet the designers", image: EDITORIAL.adire },
    ],
  }
  return [...categoryPanels, shopsPanel]
}

/**
 * Navigation in two parts so the header can place them independently:
 * "bar" is the centred desktop row with mega menus; "drawer" is the menu button + mobile drawer.
 */
export function NavMenu({ categories, shops, country, part }: { categories: CategoryNode[]; shops: ShopLink[]; country: Country; part: "bar" | "drawer" }) {
  const panels = buildPanels(categories, shops)
  return part === "bar" ? <NavBar panels={panels} /> : <NavDrawer panels={panels} country={country} />
}

function NavBar({ panels }: { panels: Panel[] }) {
  const [openPanel, setOpenPanel] = useState<string | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const pathname = usePathname()
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpenPanel(null)
  }

  useEffect(() => {
    if (!openPanel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const btn = navRef.current?.querySelector<HTMLButtonElement>(`[data-panel="${openPanel}"]`)
        setOpenPanel(null)
        btn?.focus()
      }
    }
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenPanel(null)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onClick)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onClick)
    }
  }, [openPanel])

  return (
    <nav aria-label="Main" className="s-nav" ref={navRef}>
      <ul className="s-nav__list">
        {panels.map((p) => (
          <li key={p.key} className="s-nav__item">
            {p.links.length ? (
              <>
                <button
                  type="button"
                  className="s-nav__trigger"
                  aria-expanded={openPanel === p.key}
                  aria-controls={`mega-${p.key}`}
                  data-panel={p.key}
                  onClick={() => setOpenPanel((cur) => (cur === p.key ? null : p.key))}
                >
                  {p.label}
                </button>
                <div id={`mega-${p.key}`} className="s-mega" hidden={openPanel !== p.key}>
                  <div className="h-container s-mega__inner">
                    <ul className="s-mega__links">
                      <li>
                        <Link href={p.all.href} className="s-link-strong">
                          {p.all.label}
                        </Link>
                      </li>
                      {p.links.map((l) => (
                        <li key={l.href}>
                          <Link href={l.href}>{l.label}</Link>
                        </li>
                      ))}
                    </ul>
                    <ul className="s-mega__feature">
                      {p.features.map((f) => (
                        <li key={f.href}>
                          <Link href={f.href} className="s-mega__card">
                            <Image src={f.image} alt="" fill sizes="(min-width: 1200px) 30vw, 1px" />
                            <span>{f.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            ) : (
              <Link href={p.all.href} className="s-nav__trigger">
                {p.label}
              </Link>
            )}
          </li>
        ))}
        <li className="s-nav__item">
          <Link href="/brands" className="s-nav__trigger">
            Designers
          </Link>
        </li>
        <li className="s-nav__item">
          <Link href="/journal" className="s-nav__trigger">
            Journal
          </Link>
        </li>
      </ul>
    </nav>
  )
}

function NavDrawer({ panels, country }: { panels: Panel[]; country: Country }) {
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
