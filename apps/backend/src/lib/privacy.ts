/**
 * Buyer data export and deletion (admin). Deletion anonymises the customer and their orders' personal
 * fields; order totals and line data are kept for accounting and the vendor ledger.
 */
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import type { ICustomerModuleService, IOrderModuleService, MedusaContainer } from "@medusajs/framework/types"
import { REVIEWS_MODULE, type ReviewsService } from "../modules/reviews"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

export async function exportCustomerData(container: MedusaContainer, customerId: string) {
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "first_name", "last_name", "phone", "created_at", "addresses.*"],
    filters: { id: customerId },
  })
  if (!customers.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Customer not found")
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "created_at", "email", "total", "currency_code", "items.product_title", "items.variant_title", "items.unit_price", "shipping_address.*"],
    filters: { customer_id: customerId },
  })
  const reviews = await container.resolve<ReviewsService>(REVIEWS_MODULE).listProductReviews({ customer_id: customerId })
  return { exported_at: new Date().toISOString(), customer: customers[0], orders, reviews }
}

export async function deleteCustomerData(container: MedusaContainer, customerId: string) {
  const customers = container.resolve<ICustomerModuleService>(Modules.CUSTOMER)
  const orders = container.resolve<IOrderModuleService>(Modules.ORDER)
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const customer = await customers.retrieveCustomer(customerId, { relations: ["addresses"] })
  const anonEmail = `deleted+${customerId.slice(-10)}@deleted.invalid`
  if (customer.addresses?.length) await customers.deleteCustomerAddresses(customer.addresses.map((a) => a.id))
  await customers.updateCustomers(customerId, { email: anonEmail, first_name: "Deleted", last_name: "Customer", phone: null, metadata: { anonymised_at: new Date().toISOString() } })
  const { data } = await query.graph({ entity: "order", fields: ["id", "shipping_address.id", "billing_address.id"], filters: { customer_id: customerId } })
  for (const o of data) {
    await orders.updateOrders(o.id as string, { email: anonEmail })
    const addressIds = [(o.shipping_address as { id?: string } | null)?.id, (o.billing_address as { id?: string } | null)?.id].filter((x): x is string => !!x)
    for (const id of addressIds) {
      await orders.updateOrderAddresses({ id, first_name: "Deleted", last_name: "Customer", address_1: "Deleted", address_2: null, phone: null, company: null })
    }
  }
  const reviews = container.resolve<ReviewsService>(REVIEWS_MODULE)
  const mine = await reviews.listProductReviews({ customer_id: customerId })
  for (const r of mine) await reviews.updateProductReviews({ id: r.id, display_name: "Former customer" })
  return { customer_id: customerId, orders_anonymised: data.length, reviews_anonymised: mine.length }
}
