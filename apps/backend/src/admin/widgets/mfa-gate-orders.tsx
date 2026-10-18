import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { MfaPanel } from "../components/mfa-panel"

/** Orders is the admin's landing page: ask for the authenticator code here first. */
const MfaGateOrders = () => <MfaPanel />

export const config = defineWidgetConfig({ zone: "order.list.before" })
export default MfaGateOrders
