import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { getMessenger } from "../lib/adapters"

/**
 * Password reset emails. Medusa emits `auth.password_reset` (for any email, existing or not, so the
 * request endpoint never reveals whether an account exists). The link goes to the right app.
 */
const LINKS: Record<string, (token: string, email: string) => string> = {
  customer: (t, e) => `${process.env.STOREFRONT_URL || "http://localhost:3000"}/account/reset-password?token=${encodeURIComponent(t)}&email=${encodeURIComponent(e)}`,
  vendor: (t, e) => `${process.env.VENDOR_PORTAL_URL || "http://localhost:3001"}/reset-password/update?token=${encodeURIComponent(t)}&email=${encodeURIComponent(e)}`,
  user: (t, e) => `${process.env.ADMIN_URL || process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"}/app/reset-password?token=${encodeURIComponent(t)}&email=${encodeURIComponent(e)}`,
}

export default async function passwordReset({ event: { data } }: SubscriberArgs<{ entity_id: string; actor_type: string; token: string }>) {
  const link = LINKS[data.actor_type]
  if (!link || !data.entity_id?.includes("@")) return
  await getMessenger().send({
    event: "Password Reset Requested",
    audience: data.actor_type === "customer" ? "buyer" : data.actor_type === "vendor" ? "vendor" : "staff",
    to: { email: data.entity_id },
    properties: { reset_url: link(data.token, data.entity_id), expires_in_minutes: 15 },
  })
}

export const config: SubscriberConfig = { event: "auth.password_reset" }
