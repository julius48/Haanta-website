import { redirect } from "next/navigation"
import { nextStep } from "@/lib/auth-flow"
import { getMe } from "@/lib/server/session"

export default async function VendorHome() {
  const me = await getMe()
  redirect(me ? nextStep(me) : "/login")
}
