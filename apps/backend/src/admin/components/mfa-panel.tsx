import { useEffect, useState } from "react"
import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import QRCode from "qrcode"
import { mfaApi, type MfaSetup, type MfaStatus } from "../lib/mfa"

/**
 * Staff two-factor gate. Every Haanta admin API needs a login verified with an authenticator code;
 * this panel enrols (QR + one-time recovery codes) or verifies the current sign-in, then reloads.
 * Renders nothing once the sign-in is verified (unless `always` is set, e.g. on the Security page).
 */
export function MfaPanel({ always = false }: { always?: boolean }) {
  const [status, setStatus] = useState<MfaStatus | null>(null)
  const [setup, setSetup] = useState<MfaSetup | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [useRecovery, setUseRecovery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    mfaApi.status().then(setStatus, (e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (setup) QRCode.toDataURL(setup.otpauth_uri, { margin: 1, width: 192 }).then(setQr, () => setQr(null))
  }, [setup])

  if (!status) return error ? <Container><Text className="text-ui-fg-error">{error}</Text></Container> : null
  if (status.verified && !always) return null

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  if (status.verified) {
    return (
      <Container>
        <Heading level="h2">Two-factor authentication</Heading>
        <Text className="text-ui-fg-subtle mt-2">This sign-in is verified. Your authenticator app is required at every sign-in.</Text>
      </Container>
    )
  }

  const codeOk = useRecovery ? /^[a-z0-9]{5}-[a-z0-9]{5}$/i.test(code.trim()) : /^\d{6}$/.test(code.trim())

  return (
    <Container className="flex flex-col gap-y-4">
      <div>
        <Heading level="h2">{status.enrolled ? "Verify your sign-in" : "Set up two-factor authentication"}</Heading>
        <Text className="text-ui-fg-subtle mt-1">
          {status.enrolled
            ? "Enter the 6-digit code from your authenticator app to unlock the Haanta admin."
            : "Haanta staff accounts need an authenticator app (Google Authenticator, 1Password, Authy…). Scan the code, save your recovery codes, then enter the first 6-digit code."}
        </Text>
      </div>

      {!status.enrolled && !setup ? (
        <div>
          <Button
            size="small"
            isLoading={busy}
            onClick={() => {
              setBusy(true)
              setError(null)
              mfaApi
                .setup()
                .then(setSetup, (e: Error) => setError(e.message))
                .finally(() => setBusy(false))
            }}
          >
            Start setup
          </Button>
        </div>
      ) : null}

      {!status.enrolled && setup ? (
        <div className="flex flex-col gap-y-4">
          <div className="flex flex-wrap items-start gap-6">
            {qr ? <img src={qr} alt="QR code for your authenticator app" width={192} height={192} className="rounded-md border" /> : null}
            <div className="flex flex-col gap-y-2">
              <Text size="small" weight="plus">Can't scan? Enter this key manually:</Text>
              <code className="bg-ui-bg-subtle rounded px-2 py-1 font-mono text-sm break-all">{setup.secret}</code>
              <Text size="small" weight="plus" className="mt-3">Recovery codes (shown once; store them safely):</Text>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm">
                {setup.recovery_codes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {status.enrolled || setup ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!codeOk) return
            const value = code.trim()
            void run(() => (status.enrolled ? mfaApi.verify(useRecovery ? { recovery_code: value } : { code: value }) : mfaApi.confirm(value)))
          }}
        >
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="haanta-mfa-code">{useRecovery ? "Recovery code" : "6-digit code"}</Label>
            <Input
              id="haanta-mfa-code"
              autoComplete="one-time-code"
              inputMode={useRecovery ? "text" : "numeric"}
              placeholder={useRecovery ? "abcde-12345" : "123456"}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          </div>
          <Button type="submit" size="small" isLoading={busy} disabled={!codeOk}>
            {status.enrolled ? "Verify" : "Confirm and finish setup"}
          </Button>
          {status.enrolled ? (
            <Button
              type="button"
              size="small"
              variant="transparent"
              onClick={() => {
                setUseRecovery((v) => !v)
                setCode("")
              }}
            >
              {useRecovery ? "Use authenticator code" : "Use a recovery code"}
            </Button>
          ) : null}
        </form>
      ) : null}

      {error ? (
        <Text size="small" className="text-ui-fg-error" role="alert">
          {error}
        </Text>
      ) : null}
    </Container>
  )
}
