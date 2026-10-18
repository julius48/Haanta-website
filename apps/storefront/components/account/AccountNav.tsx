import Link from "next/link"
import { logoutAction } from "@/app/actions/account"

const LINKS = [
  { href: "/account", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/wishlist", label: "Wishlist" },
]

export function AccountNav({ current }: { current: string }) {
  return (
    <nav aria-label="Account" className="s-account-nav">
      <ul>
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={current === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          </li>
        ))}
        <li>
          <form action={logoutAction}>
            <button type="submit" className="s-link-btn" data-testid="logout">
              Sign out
            </button>
          </form>
        </li>
      </ul>
    </nav>
  )
}
