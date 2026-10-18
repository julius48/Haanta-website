import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { getSettings } from "@/lib/server/catalog"

export const metadata: Metadata = {
  title: "Shipping and delivery",
  description: "How Haanta ships to the US, Canada and Mexico: standard vs DHL Express, Houston and Nigeria origins, made-to-order and pre-order timing, duties included.",
  alternates: { canonical: "/help/shipping" },
}

export default async function ShippingHelpPage() {
  await connection()
  const s = await getSettings()
  return (
    <main id="main" className="h-container s-page s-narrow s-prose">
      <h1>Shipping and delivery</h1>
      <p className="s-lead">{s.duties_message}</p>

      <h2>Where your order ships from</h2>
      <p>
        Haanta pieces ship from one of two places, shown on every product as <strong>Ships from the US</strong> or <strong>Ships from Nigeria</strong>:
      </p>
      <ul>
        <li>
          <strong>Our Houston, Texas hub</strong>: stock that is already in the US. Ready-to-wear pieces leave within {s.ready_to_wear_dispatch} and arrive in 2-5 working days within the
          mainland US. <Link href="/shop?ships_from=houston">Shop pieces that ship from the US</Link>.
        </li>
        <li>
          <strong>Our designers&apos; studios in Nigeria</strong>: most of the collection. These are shipped to you internationally once ready.
        </li>
      </ul>

      <h2>Standard vs DHL Express</h2>
      <table className="s-table">
        <caption>Delivery options at checkout</caption>
        <thead>
          <tr>
            <th scope="col">Option</th>
            <th scope="col">From Nigeria</th>
            <th scope="col">From the US hub</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Standard</th>
            <td>10-21 days</td>
            <td>2-5 working days</td>
          </tr>
          <tr>
            <th scope="row">DHL Express</th>
            <td>2-3 days once dispatched</td>
            <td>Not needed</td>
          </tr>
        </tbody>
      </table>
      <p>
        Standard shipping is free on orders over US${s.free_shipping_threshold_usd}. Alaska, Hawaii, Oregon and Canada orders from our US hub ship with UPS at live rates. Mexico
        orders ship by DHL Express from Nigeria. Exact options and prices for your address are shown at checkout before you pay.
      </p>

      <h2>Made to order and pre-order</h2>
      <p>
        <strong>Made-to-order</strong> pieces are cut and sewn for you after you order, usually within 2-3 weeks (each product shows its own estimate). Delivery time is added after
        production.
      </p>
      <p>
        <strong>Pre-order</strong> pieces are reserved now and produced in the next run. The product page shows the expected dispatch date; we&apos;ll email you when it ships. If your
        order mixes ready-to-wear and pre-order pieces, items may arrive separately.
      </p>

      <h2>Tracking</h2>
      <p>
        You&apos;ll get tracking by email as soon as each part of your order ships. You can also <Link href="/track">track your order</Link> with your order number and email.
      </p>
    </main>
  )
}
