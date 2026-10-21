import Link from "next/link"
import { Wordmark } from "@haanta/ui"
import { NavMenu } from "./NavMenu"
import { CountrySwitcher } from "./CountrySwitcher"
import { SearchToggle } from "./SearchToggle"
import { CATEGORIES } from "@/lib/categories"
import { listShops, getBanners } from "@/lib/content"
import { getCartCount } from "@/lib/server/cart"
import { getRegion } from "@/lib/server/region"
import { isSignedIn, getWishlistIds } from "@/lib/server/customer"

function Icon({ name }: { name: "user" | "heart" | "bag" }) {
  const paths: Record<typeof name, React.ReactNode> = {
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.6-4 4.5-6 8-6s6.4 2 8 6" />
      </>
    ),
    heart: (
      <path d="M12 20.5s-7.5-4.6-9.4-9.1C1.3 8.2 3.3 4.8 6.6 4.8c2 0 3.4 1.1 4.4 2.5 1-1.4 2.4-2.5 4.4-2.5 3.3 0 5.3 3.4 4 6.6-1.9 4.5-9.4 9.1-9.4 9.1z" />
    ),
    bag: (
      <>
        <path d="M5.5 8h13l-1 12.5h-11L5.5 8z" />
        <path d="M9 8V6.5a3 3 0 016 0V8" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

export async function Header() {
  const [shops, banners, count, { country }, signedIn, wishlist] = await Promise.all([
    listShops(),
    getBanners(),
    getCartCount(),
    getRegion(),
    isSignedIn(),
    getWishlistIds(),
  ])
  const announcement = banners.find((b) => b.placement === "announcement")
  const navShops = shops.map((s) => ({ slug: s.slug, title: s.title }))
  return (
    <header className="s-header">
      {announcement ? (
        <div className="s-announce">
          <div className="h-container">
            {announcement.href ? (
              <Link href={announcement.href}>{announcement.message}</Link>
            ) : (
              <p>{announcement.message}</p>
            )}
          </div>
        </div>
      ) : null}
      {/* One row: menu (small screens) · wordmark · departments · search and icons. */}
      <div className="h-container s-header__main">
        <div className="s-header__left">
          <NavMenu categories={CATEGORIES} shops={navShops} country={country} part="drawer" />
          <Link href="/" className="s-logo">
            {/* The stylised wordmark is decorative; the link's name comes from the text below (WCAG 2.5.3). */}
            <span aria-hidden="true">
              <Wordmark />
            </span>
            <span className="h-sr-only">Haanta home</span>
          </Link>
        </div>
        <div className="s-header__nav">
          <NavMenu categories={CATEGORIES} shops={navShops} country={country} part="bar" />
        </div>
        <div className="s-header__actions">
          <SearchToggle />
          <CountrySwitcher country={country} />
          <ul className="s-header__icons">
            <li className="s-header__icon--account">
              <Link href="/account" className="s-icon-btn" aria-label={signedIn ? "Your account" : "Sign in"} data-testid="account-link">
                <Icon name="user" />
              </Link>
            </li>
            <li className="s-header__icon--wishlist">
              <Link href="/account/wishlist" className="s-icon-btn" aria-label={`Wishlist, ${wishlist.length} saved`}>
                <Icon name="heart" />
              </Link>
            </li>
            <li>
              <Link href="/cart" className="s-icon-btn s-cart-link" aria-label={`Bag, ${count} item${count === 1 ? "" : "s"}`} data-testid="cart-link">
                <Icon name="bag" />
                {count > 0 ? (
                  <span className="s-cart-count" aria-hidden="true" data-testid="cart-count">
                    {count}
                  </span>
                ) : null}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </header>
  )
}
