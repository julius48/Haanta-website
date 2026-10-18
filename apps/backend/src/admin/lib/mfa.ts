/** Admin-side client for the staff MFA API. */
import { haantaApi } from "./api"

export interface MfaStatus {
  enrolled: boolean
  verified: boolean
}

export interface MfaSetup {
  secret: string
  otpauth_uri: string
  recovery_codes: string[]
}

export const mfaApi = {
  status: () => haantaApi<MfaStatus>("/mfa"),
  setup: () => haantaApi<MfaSetup>("/mfa/setup", { method: "POST", body: "{}" }),
  confirm: (code: string) => haantaApi<{ verified: boolean }>("/mfa/confirm", { method: "POST", body: JSON.stringify({ code }) }),
  verify: (input: { code: string } | { recovery_code: string }) => haantaApi<{ verified: boolean }>("/mfa/verify", { method: "POST", body: JSON.stringify(input) }),
}
