import Link from "next/link"
import { ProductImage } from "@/components/ui/ProductImage"
import type { Country } from "@/lib/site"
import type { CategoryNode } from "@/lib/categories"
import { MegaMenuController } from "./MegaMenuController"
import { NavDrawer } from "./NavDrawer"

interface ShopLink {
  slug: string
  title: string
}

export interface Panel {
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
    label: "Edits",
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
 * "bar" is the centred desktop row with mega menus (server markup + a tiny behaviour controller);
 * "drawer" is the menu button + mobile drawer (client).
 */
export function NavMenu({ categories, shops, country, part }: { categories: CategoryNode[]; shops: ShopLink[]; country: Country; part: "bar" | "drawer" }) {
  const panels = buildPanels(categories, shops)
  return part === "bar" ? <NavBar panels={panels} /> : <NavDrawer panels={panels} country={country} />
}

function NavBar({ panels }: { panels: Panel[] }) {
  return (
    <nav aria-label="Main" className="s-nav" id="main-nav">
      <MegaMenuController navId="main-nav" />
      <ul className="s-nav__list">
        {panels.map((p) => (
          <li key={p.key} className="s-nav__item">
            {p.links.length ? (
              <>
                <button type="button" className="s-nav__trigger" aria-expanded="false" aria-controls={`mega-${p.key}`} data-panel={p.key}>
                  {p.label}
                </button>
                <div id={`mega-${p.key}`} className="s-mega" hidden>
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
                            <span className="s-mega__media">
                              <ProductImage src={f.image} alt="" sizes="(min-width: 1200px) 30vw, 1px" />
                            </span>
                            <span className="s-mega__caption">{f.label}</span>
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
      </ul>
    </nav>
  )
}
