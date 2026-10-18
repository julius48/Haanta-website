import Link from "next/link"
import { Wordmark } from "@haanta/ui"
import { NewsletterForm } from "./NewsletterForm"
import { listShops } from "@/lib/content"
import { SOCIAL, TAGLINE } from "@/lib/site"

export async function Footer() {
  const shops = await listShops()
  const year = new Date().getFullYear()
  return (
    <footer className="s-footer">
      <div className="h-container">
        <div className="s-footer__top">
          <div className="s-footer__brand">
            <Wordmark tone="tan" />
            <p className="s-footer__tag">{TAGLINE}.</p>
            <h2 className="s-footer__heading" id="newsletter-heading">
              Join the Haanta list
            </h2>
            <p>New designers, restocks and stories from the studios. No spam.</p>
            <NewsletterForm source="footer" tone="dark" />
          </div>
          <nav aria-labelledby="footer-shops" className="s-footer__col">
            <h2 id="footer-shops" className="s-footer__heading">
              Shops
            </h2>
            <ul>
              {shops.map((s) => (
                <li key={s.slug}>
                  <Link href={`/shops/${s.slug}`}>{s.title}</Link>
                </li>
              ))}
              <li>
                <Link href="/brands">Designers A–Z</Link>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-help" className="s-footer__col">
            <h2 id="footer-help" className="s-footer__heading">
              Help
            </h2>
            <ul>
              <li>
                <Link href="/track">Track your order</Link>
              </li>
              <li>
                <Link href="/help/shipping">Shipping and delivery</Link>
              </li>
              <li>
                <Link href="/help/returns">Returns</Link>
              </li>
              <li>
                <Link href="/faq">FAQs</Link>
              </li>
              <li>
                <Link href="/account">Your account</Link>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-about" className="s-footer__col">
            <h2 id="footer-about" className="s-footer__heading">
              Haanta
            </h2>
            <ul>
              <li>
                <Link href="/about">About us</Link>
              </li>
              <li>
                <Link href="/journal">Journal</Link>
              </li>
              <li>
                <Link href="/help/returns#policies">Policies</Link>
              </li>
            </ul>
            <h2 className="s-footer__heading">Follow us</h2>
            <ul className="s-footer__social">
              {SOCIAL.map((s) => (
                <li key={s.name}>
                  <a href={s.href} rel="noopener noreferrer" target="_blank">
                    {s.name}
                    <span className="h-sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="s-footer__legal">
          © {year} Haanta. Prices include duties and taxes for the US and Canada.
        </p>
      </div>
    </footer>
  )
}
