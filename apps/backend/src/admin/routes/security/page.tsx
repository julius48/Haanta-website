import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ShieldCheck } from "@medusajs/icons"
import { MfaPanel } from "../../components/mfa-panel"

/** Staff security: enrol or verify two-factor authentication for this sign-in. */
const SecurityPage = () => <MfaPanel always />

export const config = defineRouteConfig({ label: "Security", icon: ShieldCheck })
export default SecurityPage
