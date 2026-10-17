"use client"

import Link from "next/link"
import { useActionState, useState, type ReactNode } from "react"
import { acceptInviteAction, loginAction, registerAction, requestResetAction, updatePasswordAction } from "@/lib/actions/auth"
import { PASSWORD_HELP } from "@/lib/auth-flow"
import type { FormState } from "@/lib/form-state"
import { Alert, FormErrors, SelectField, TextArea, TextField } from "./fields"
import { SubmitButton } from "./submit-button"

const initial: FormState = {}

export function LoginForm({ next, turnstile }: { next: string; turnstile: ReactNode }) {
  const [state, action] = useActionState(loginAction, initial)
  const fe = state.fieldErrors ?? {}
  return (
    <form action={action} noValidate data-testid="login-form">
      <FormErrors error={state.error} />
      <input type="hidden" name="next" value={next} />
      <TextField id="email" label="Email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={fe.email} data-testid="login-email" />
      <TextField id="password" label="Password" type="password" autoComplete="current-password" required error={fe.password} data-testid="login-password" />
      {turnstile}
      <SubmitButton pendingText="Signing in…" data-testid="login-submit">
        Sign in
      </SubmitButton>
      <p className="v-small" style={{ marginTop: "var(--space-4)" }}>
        <Link href="/reset-password">Forgot your password?</Link>
      </p>
    </form>
  )
}

const COUNTRIES = [
  { code: "NG", name: "Nigeria" },
  { code: "GH", name: "Ghana" },
  { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" },
  { code: "SN", name: "Senegal" },
  { code: "CI", name: "Côte d’Ivoire" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
]

export function RegisterForm({ turnstile }: { turnstile: ReactNode }) {
  const [state, action] = useActionState(registerAction, initial)
  const fe = state.fieldErrors ?? {}
  const v = state.values ?? {}
  return (
    <form action={action} noValidate data-testid="register-form">
      <FormErrors error={state.error ?? (Object.keys(fe).length ? "Please fix the highlighted fields." : null)} problems={state.problems} />
      <fieldset className="v-fieldset">
        <legend>Your account</legend>
        <TextField id="contact_name" label="Your name" autoComplete="name" required defaultValue={v.contact_name} error={fe.contact_name} data-testid="register-contact-name" />
        <TextField id="email" label="Email" type="email" autoComplete="email" required defaultValue={v.email} error={fe.email} data-testid="register-email" />
        <TextField id="password" label="Password" type="password" autoComplete="new-password" required minLength={12} hint={PASSWORD_HELP} error={fe.password} data-testid="register-password" />
      </fieldset>
      <fieldset className="v-fieldset">
        <legend>Your brand</legend>
        <TextField id="business_name" label="Brand or business name" autoComplete="organization" required defaultValue={v.business_name} error={fe.business_name} data-testid="register-business-name" />
        <SelectField id="origin_country" label="Country your brand is based in" defaultValue={v.origin_country || "NG"} error={fe.origin_country}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField id="region" label="City or region" optional hint="For example Lagos or Abuja" defaultValue={v.region} error={fe.region} />
        <TextField id="website" label="Website" optional type="url" inputMode="url" placeholder="https://" defaultValue={v.website} error={fe.website} />
        <TextField id="instagram" label="Instagram handle" optional defaultValue={v.instagram} error={fe.instagram} />
        <TextArea id="story" label="Tell us about your brand" optional rows={4} hint="What you make, how and where. Haanta reviews every application." defaultValue={v.story} error={fe.story} />
      </fieldset>
      {turnstile}
      <SubmitButton pendingText="Creating your account…" data-testid="register-submit">
        Apply to sell on Haanta
      </SubmitButton>
    </form>
  )
}

export function InviteForm({ token, turnstile }: { token: string; turnstile: ReactNode }) {
  const [state, action] = useActionState(acceptInviteAction, initial)
  const fe = state.fieldErrors ?? {}
  return (
    <form action={action} noValidate data-testid="invite-form">
      <FormErrors error={state.error ?? fe.token ?? (Object.keys(fe).length ? "Please fix the highlighted fields." : null)} problems={state.problems} />
      <input type="hidden" name="token" value={token} />
      <TextField id="name" label="Your name" autoComplete="name" required defaultValue={state.values?.name} error={fe.name} />
      <TextField id="email" label="Email (the address the invite was sent to)" type="email" autoComplete="email" required defaultValue={state.values?.email} error={fe.email} />
      <TextField id="password" label="Choose a password" type="password" autoComplete="new-password" required minLength={12} hint={PASSWORD_HELP} error={fe.password} />
      {turnstile}
      <SubmitButton pendingText="Joining…">Accept invite</SubmitButton>
    </form>
  )
}

export function ResetRequestForm({ turnstile }: { turnstile: ReactNode }) {
  const [state, action] = useActionState(requestResetAction, initial)
  const fe = state.fieldErrors ?? {}
  if (state.message) return <Alert tone="success" title="Check your email">{<p>{state.message}</p>}</Alert>
  return (
    <form action={action} noValidate>
      <FormErrors error={state.error} />
      <TextField id="email" label="Email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={fe.email} />
      {turnstile}
      <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  )
}

export function UpdatePasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(updatePasswordAction, initial)
  const fe = state.fieldErrors ?? {}
  const [show, setShow] = useState(false)
  return (
    <form action={action} noValidate>
      <FormErrors error={state.error ?? fe.token} problems={state.problems} />
      <input type="hidden" name="token" value={token} />
      <TextField id="email" label="Email" type="email" autoComplete="email" required defaultValue={state.values?.email ?? email} error={fe.email} />
      <TextField id="password" label="New password" type={show ? "text" : "password"} autoComplete="new-password" required minLength={12} hint={PASSWORD_HELP} error={fe.password} />
      <TextField id="confirm" label="Repeat new password" type={show ? "text" : "password"} autoComplete="new-password" required error={fe.confirm} />
      <label className="v-check">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.currentTarget.checked)} />
        <span>Show passwords</span>
      </label>
      <SubmitButton pendingText="Saving…">Set new password</SubmitButton>
    </form>
  )
}
