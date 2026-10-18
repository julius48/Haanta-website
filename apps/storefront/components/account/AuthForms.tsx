"use client"

import Link from "next/link"
import { useActionState } from "react"
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "@/app/actions/account"
import { Field, FormMessage } from "@/components/ui/Field"
import { Turnstile } from "./Turnstile"
import type { ActionState } from "@/lib/types"

const idle: ActionState = { status: "idle" }
const fe = (s: ActionState) => (s.status === "error" ? (s.fieldErrors ?? {}) : {})

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, idle)
  const e = fe(state)
  return (
    <form action={action} className="s-auth-form" noValidate data-testid="login-form">
      <input type="hidden" name="next" value={next ?? "/account"} />
      <Field id="login-email" name="email" label="Email" type="email" autoComplete="email" required error={e.email} data-testid="login-email" />
      <Field id="login-password" name="password" label="Password" type="password" autoComplete="current-password" required error={e.password} data-testid="login-password" />
      <Turnstile />
      <FormMessage state={state} />
      <button type="submit" className="h-btn h-btn--primary s-btn-block" disabled={pending} data-testid="login-submit">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="s-small">
        <Link href="/account/forgot-password">Forgot your password?</Link>
      </p>
    </form>
  )
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, idle)
  const e = fe(state)
  return (
    <form action={action} className="s-auth-form" noValidate data-testid="register-form">
      <div className="s-form-row">
        <Field id="reg-first" name="first_name" label="First name" autoComplete="given-name" required error={e.first_name} data-testid="register-first-name" />
        <Field id="reg-last" name="last_name" label="Last name" autoComplete="family-name" required error={e.last_name} data-testid="register-last-name" />
      </div>
      <Field id="reg-email" name="email" label="Email" type="email" autoComplete="email" required error={e.email} data-testid="register-email" />
      <Field
        id="reg-password"
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        hint="At least 12 characters. Avoid common or previously leaked passwords; a short phrase works well."
        error={e.password}
        data-testid="register-password"
      />
      <Turnstile />
      <FormMessage state={state} />
      <button type="submit" className="h-btn h-btn--primary s-btn-block" disabled={pending} data-testid="register-submit">
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  )
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, idle)
  const e = fe(state)
  return (
    <form action={action} className="s-auth-form" noValidate>
      <Field id="forgot-email" name="email" label="Email" type="email" autoComplete="email" required error={e.email} />
      <Turnstile />
      <FormMessage state={state} />
      <button type="submit" className="h-btn h-btn--primary s-btn-block" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  )
}

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, idle)
  const e = fe(state)
  if (state.status === "ok")
    return (
      <div>
        <FormMessage state={state} />
        <Link href="/account/login" className="h-btn h-btn--primary">
          Sign in
        </Link>
      </div>
    )
  return (
    <form action={action} className="s-auth-form" noValidate>
      <input type="hidden" name="token" value={token} />
      <Field id="reset-email" name="email" label="Email" type="email" autoComplete="email" required defaultValue={email} error={e.email} />
      <Field id="reset-password" name="password" label="New password" type="password" autoComplete="new-password" required minLength={12} hint="At least 12 characters." error={e.password} />
      <FormMessage state={state} />
      <button type="submit" className="h-btn h-btn--primary s-btn-block" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  )
}
