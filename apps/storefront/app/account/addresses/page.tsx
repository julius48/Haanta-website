import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { AccountNav } from "@/components/account/AccountNav"
import { AddressForm } from "@/components/account/AddressForm"
import { getCustomer } from "@/lib/server/customer"
import { deleteAddressAction } from "@/app/actions/account"

export const metadata: Metadata = { title: "Saved addresses", robots: { index: false, follow: false } }

export default async function AddressesPage() {
  await connection()
  const customer = await getCustomer()
  if (!customer) redirect("/account/login?next=/account/addresses")
  const addresses = customer.addresses ?? []
  return (
    <main id="main" className="h-container s-page">
      <h1>Saved addresses</h1>
      <AccountNav current="/account/addresses" />
      {addresses.length ? (
        <ul className="s-address-list">
          {addresses.map((a) => (
            <li key={a.id} className="s-address">
              <address>
                {a.first_name} {a.last_name}
                <br />
                {a.address_1}
                {a.address_2 ? `, ${a.address_2}` : ""}
                <br />
                {a.city}, {a.province} {a.postal_code}
                <br />
                {a.country_code?.toUpperCase()}
              </address>
              <form action={deleteAddressAction}>
                <input type="hidden" name="address_id" value={a.id} />
                <button type="submit" className="s-link-btn">
                  Remove<span className="h-sr-only"> address {a.address_1}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p>No saved addresses yet.</p>
      )}
      <section aria-labelledby="add-address" className="s-section">
        <h2 id="add-address">Add an address</h2>
        <AddressForm />
      </section>
    </main>
  )
}
