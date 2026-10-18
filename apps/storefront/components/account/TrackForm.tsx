"use client"

import { useActionState } from "react"
import { trackOrderAction } from "@/app/actions/misc"
import { Field, FormMessage } from "@/components/ui/Field"
import type { ActionState, TrackingResult } from "@/lib/types"

const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-US", { timeZone: "UTC", dateStyle: "medium" }) : null)

export function TrackForm() {
  const [state, action, pending] = useActionState<ActionState<TrackingResult>, FormData>(trackOrderAction, { status: "idle" })
  const e = state.status === "error" ? (state.fieldErrors ?? {}) : {}
  const result = state.status === "ok" ? state.data : undefined
  return (
    <>
      <form action={action} className="s-auth-form" noValidate data-testid="track-form">
        <Field id="track-number" name="order_number" label="Order number" inputMode="numeric" required hint="From your confirmation email, e.g. 1042" error={e.order_number} data-testid="track-order-number" />
        <Field id="track-email" name="email" label="Email" type="email" autoComplete="email" required error={e.email} data-testid="track-email" />
        {state.status === "error" ? <FormMessage state={state} /> : null}
        <button type="submit" className="h-btn h-btn--primary" disabled={pending} data-testid="track-submit">
          {pending ? "Looking up…" : "Track order"}
        </button>
      </form>
      {result ? (
        <section aria-labelledby="track-result" className="s-section" data-testid="track-result" role="status">
          <h2 id="track-result">Order #{result.order_number}</h2>
          <p>
            Placed {date(result.placed_at)} · Status: {result.status.replace(/_/g, " ")}
          </p>
          <h3>Progress</h3>
          {result.stages.length ? (
            <ol className="s-stages">
              {result.stages.map((s, i) => (
                <li key={i} className="s-stage">
                  <strong>{s.stage}</strong>
                  {s.is_preorder ? <span className="s-small"> · Pre-order</span> : null}
                  {s.estimated_dispatch ? <span className="s-small s-muted"> · Estimated dispatch {date(s.estimated_dispatch)}</span> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p>Order received. Our designers will start soon.</p>
          )}
          <h3>Shipments</h3>
          {result.shipments.length ? (
            result.shipments.map((sh) => (
              <div key={sh.tracking_number} className="s-shipment">
                <p>
                  Tracking number <strong>{sh.tracking_number}</strong>
                  {sh.delivered_at ? ` · Delivered ${date(sh.delivered_at)}` : sh.shipped_at ? ` · Shipped ${date(sh.shipped_at)}` : ""}
                </p>
                {sh.events.length ? (
                  <ol className="s-events">
                    {sh.events.map((ev, i) => (
                      <li key={i}>
                        {date(ev.occurred_at ?? ev.timestamp)} {ev.description ?? ev.status}
                        {ev.location ? ` · ${ev.location}` : ""}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="s-small">No courier updates yet.</p>
                )}
              </div>
            ))
          ) : (
            <p>Nothing has shipped yet. We&apos;ll email you a tracking number as soon as it does.</p>
          )}
        </section>
      ) : null}
    </>
  )
}
