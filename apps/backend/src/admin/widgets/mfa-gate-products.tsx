import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { MfaPanel } from "../components/mfa-panel"

const MfaGateProducts = () => <MfaPanel />

export const config = defineWidgetConfig({ zone: "product.list.before" })
export default MfaGateProducts
