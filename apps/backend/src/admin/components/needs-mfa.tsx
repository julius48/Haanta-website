import { MfaPanel } from "./mfa-panel"
import { ApiError } from "../lib/api"

/** Shows the verification panel when an API call was refused for an unverified sign-in. */
export function ErrorOrMfa({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.code === "mfa_required") return <MfaPanel />
  return <p className="text-ui-fg-error txt-small p-6">{error instanceof Error ? error.message : "Something went wrong"}</p>
}
