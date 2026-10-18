import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { LoginForm, RegisterForm } from "@/components/account/AuthForms"
import { AccountNav } from "@/components/account/AccountNav"
import { getCustomer, listOrders } from "@/lib/server/customer"
import { formatMajor } from "@/lib/money"

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } }

export default async function AccountPage() {
  await connection()
  const customer = await getCustomer()
  if (!customer) {
    return (
      <main id="main" className="h-container s-page">
        <h1>Your account</h1>
        <div className="s-auth-grid">
          <section aria-labelledby="signin-title">
            <h2 id="signin-title">Sign in</h2>
            <LoginForm />
          </section>
          <section aria-labelledby="register-title">
            <h2 id="register-title">New to Haanta?</h2>
            <p>Create an account to track orders, save addresses and keep a wishlist.</p>
            <RegisterForm />
          </section>
        </div>
      </main>
    )
  }
  const orders = await listOrders()
  return (
    <main id="main" className="h-container s-page">
      <h1 data-testid="account-heading">Hello, {customer.first_name ?? "there"}</h1>
      <AccountNav current="/account" />
      <section aria-labelledby="orders-title" className="s-section">
        <h2 id="orders-title">Order history</h2>
        {orders.length ? (
          <div className="s-table-wrap">
            <table className="s-table" data-testid="orders-table">
              <caption className="h-sr-only">Your orders, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Placed</th>
                  <th scope="col">Status</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <th scope="row">
                      <Link href={`/account/orders/${o.id}`}>#{o.display_id}</Link>
                    </th>
                    <td>{new Date(o.created_at).toLocaleDateString("en-US", { timeZone: "UTC" })}</td>
                    <td>{(o.fulfillment_status ?? o.status).replace(/_/g, " ")}</td>
                    <td>{formatMajor(o.total, o.currency_code)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>
            No orders yet. <Link href="/shop">Find something you love.</Link>
          </p>
        )}
      </section>
      <section aria-labelledby="details-title" className="s-section">
        <h2 id="details-title">Your details</h2>
        <p>
          {customer.first_name} {customer.last_name}
          <br />
          {customer.email}
        </p>
      </section>
    </main>
  )
}
