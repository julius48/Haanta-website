import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { mfaApi } from "../lib/mfa"

/** Every page: a reminder (linking to Settings > Security) while this sign-in is not yet verified. */
const MfaTopbar = () => {
  const [verified, setVerified] = useState(true)
  useEffect(() => {
    mfaApi.status().then((s) => setVerified(s.verified), () => setVerified(true))
  }, [])
  if (verified) return null
  return (
    <a href="/app/security" className="mr-2">
      <Badge color="orange" size="small">
        Verify your sign-in
      </Badge>
    </a>
  )
}

export const config = defineWidgetConfig({ zone: "topbar" })
export default MfaTopbar
