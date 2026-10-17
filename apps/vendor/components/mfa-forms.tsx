"use client"

import Image from "next/image"
import { useActionState, useState } from "react"
import { confirmMfaAction, resendVerificationAction, startMfaSetupAction, verifyEmailAction, verifyMfaAction, type MfaSetupState } from "@/lib/actions/mfa"
import type { FormState } from "@/lib/form-state"
import { Alert, Checkbox, FormErrors, TextField } from "./fields"
import { SubmitButton } from "./submit-button"

const initialSetup: MfaSetupState = {}

export function MfaSetup() {
  const [state, start] = useActionState(startMfaSetupAction, initialSetup)
  const [confirmState, confirm] = useActionState(confirmMfaAction, initialSetup)
  const setup = state.setup
  if (!setup) {
    return (
      <form action={start}>
        <FormErrors error={state.error} />
        <p>You&apos;ll need an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password on your phone.</p>
        <SubmitButton pendingText="Preparing…" data-testid="mfa-start">
          Start setup
        </SubmitButton>
      </form>
    )
  }
  const fe = confirmState.fieldErrors ?? {}
  return (
    <div className="v-stack">
      <section aria-labelledby="mfa-step-1">
        <h2 id="mfa-step-1">1. Scan this QR code</h2>
        <p>Open your authenticator app, choose “add account” and scan the code.</p>
        <Image className="v-qr" src={setup.qr} alt="QR code for your authenticator app. If you can't scan it, type the setup key shown below." width={240} height={240} unoptimized data-testid="mfa-qr" />
        <p style={{ marginTop: "var(--space-3)" }}>
          Can&apos;t scan? Type this setup key instead:
          <br />
          <code className="v-secret" data-testid="mfa-secret">
            {setup.secret}
          </code>
        </p>
      </section>
      <section aria-labelledby="mfa-step-2">
        <h2 id="mfa-step-2">2. Save your recovery codes</h2>
        <p>
          If you lose your phone, each of these codes lets you sign in once. Store them somewhere safe, like a password manager. <strong>They are shown only now.</strong>
        </p>
        <ul className="v-codes" data-testid="mfa-recovery-codes" aria-label="Recovery codes">
          {setup.recovery_codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <CopyCodes codes={setup.recovery_codes} />
      </section>
      <section aria-labelledby="mfa-step-3">
        <h2 id="mfa-step-3">3. Enter a code to finish</h2>
        <form action={confirm} noValidate>
          <FormErrors error={confirmState.error} />
          <Checkbox id="saved" name="saved" value="yes" label="I have saved my recovery codes somewhere safe" required error={fe.saved} data-testid="mfa-saved" />
          <TextField
            id="code"
            label="6-digit code from your app"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={7}
            required
            error={fe.code}
            data-testid="mfa-code"
          />
          <SubmitButton pendingText="Checking…" data-testid="mfa-confirm">
            Turn on two-factor authentication
          </SubmitButton>
        </form>
      </section>
    </div>
  )
}

function CopyCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false)
  return (
    <p>
      <button
        type="button"
        className="h-btn h-btn--secondary"
        onClick={() => {
          void navigator.clipboard?.writeText(codes.join("\n")).then(() => setCopied(true))
        }}
      >
        Copy codes
      </button>{" "}
      <span role="status" aria-live="polite">
        {copied ? "Copied to clipboard." : ""}
      </span>
    </p>
  )
}

const initial: FormState = {}

export function MfaVerify() {
  const [state, action] = useActionState(verifyMfaAction, initial)
  const [recovery, setRecovery] = useState(false)
  const fe = state.fieldErrors ?? {}
  return (
    <form action={action} noValidate>
      <FormErrors error={state.error} />
      <input type="hidden" name="method" value={recovery ? "recovery" : "code"} />
      {recovery ? (
        <TextField id="recovery_code" label="Recovery code" autoComplete="off" hint="Looks like abcde-12345. Each code works once." required error={fe.recovery_code} data-testid="mfa-recovery-input" />
      ) : (
        <TextField id="code" label="6-digit code from your authenticator app" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} required error={fe.code} data-testid="mfa-code" />
      )}
      <div className="v-row">
        <SubmitButton pendingText="Checking…" data-testid="mfa-verify">
          Verify
        </SubmitButton>
        <button type="button" className="v-link-btn" onClick={() => setRecovery((r) => !r)}>
          {recovery ? "Use a code from my app" : "Use a recovery code instead"}
        </button>
      </div>
    </form>
  )
}

export function VerifyEmailConfirm({ token }: { token: string }) {
  const [state, action] = useActionState(verifyEmailAction, initial)
  return (
    <form action={action}>
      <FormErrors error={state.error} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingText="Confirming…" data-testid="verify-email-confirm">
        Confirm my email address
      </SubmitButton>
    </form>
  )
}

export function ResendVerification() {
  const [state, action] = useActionState(resendVerificationAction, initial)
  return (
    <form action={action}>
      {state.message ? <Alert tone="success">{<p>{state.message}</p>}</Alert> : null}
      <FormErrors error={state.error} />
      <SubmitButton variant="secondary" pendingText="Sending…" data-testid="resend-verification">
        Send a new link
      </SubmitButton>
    </form>
  )
}
