/**
 * Error monitoring and alerting. With SENTRY_DSN set, events go to Sentry with personal data
 * scrubbed; otherwise they are logged locally. Alerts: payment failures, webhook failures and spikes
 * in failed logins (configure alert rules on these tags in Sentry).
 */
import { redact } from "@haanta/core"

export type AlertKind = "payment_failed" | "webhook_failed" | "failed_login_spike" | "high_risk_order" | "ledger_reconciliation_mismatch"

export const recordedAlerts: { kind: AlertKind; data: Record<string, unknown> }[] = []

interface SentryLike {
  captureMessage(message: string, ctx: { level: string; tags: Record<string, string>; extra: Record<string, unknown> }): void
}

let sentry: SentryLike | null | undefined

async function getSentry(): Promise<SentryLike | null> {
  if (sentry !== undefined) return sentry
  sentry = null
  if (process.env.SENTRY_DSN && !process.env.TEST_TYPE) {
    try {
      const mod = (await import(/* webpackIgnore: true */ "@sentry/node" as string)) as {
        init: (o: Record<string, unknown>) => void
        captureMessage: SentryLike["captureMessage"]
      }
      mod.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.APP_ENV || process.env.NODE_ENV,
        sendDefaultPii: false,
        beforeSend: (event: Record<string, unknown>) => redact(event),
      })
      sentry = { captureMessage: mod.captureMessage }
    } catch {
      sentry = null
    }
  }
  return sentry
}

export function captureAlert(kind: AlertKind, data: Record<string, unknown>) {
  const safe = redact(data)
  recordedAlerts.push({ kind, data: safe })
  void getSentry().then((s) => {
    if (s) s.captureMessage(`[alert] ${kind}`, { level: "error", tags: { alert: kind }, extra: safe })
    else console.warn(`[alert] ${kind} ${JSON.stringify(safe)}`)
  })
}
