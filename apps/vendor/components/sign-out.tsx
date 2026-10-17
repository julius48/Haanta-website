import { logoutAction } from "@/lib/actions/auth"
import { SubmitButton } from "./submit-button"

export function SignOutButton({ variant = "secondary" }: { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <form action={logoutAction}>
      <SubmitButton variant={variant} pendingText="Signing out…" data-testid="sign-out">
        Sign out
      </SubmitButton>
    </form>
  )
}
