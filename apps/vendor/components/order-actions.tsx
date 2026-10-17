"use client"

import { useActionState } from "react"
import { updateOrderStatusAction } from "@/lib/actions/store"
import type { FormState } from "@/lib/form-state"
import { CARRIERS, NEXT_ORDER_STATUSES } from "@/lib/status"
import type { VendorOrderStatus } from "@/lib/types"
import { Alert, FormErrors, SelectField, TextField } from "./fields"
import { SubmitButton } from "./submit-button"

const initial: FormState = {}

const LABEL = { accepted: "Accept order", in_production: "Mark as in production", shipped_to_hub: "Mark as shipped to hub" } as const

export function OrderActions({ orderId, status }: { orderId: string; status: VendorOrderStatus }) {
  const [state, action] = useActionState(updateOrderStatusAction, initial)
  const next = NEXT_ORDER_STATUSES[status] ?? []
  const fe = state.fieldErrors ?? {}
  const simple = next.filter((s) => s !== "shipped_to_hub")
  return (
    <div className="v-stack" data-testid="order-actions">
      {state.message ? (
        <Alert tone="success" title="Updated">
          <p>{state.message}</p>
        </Alert>
      ) : null}
      <FormErrors error={state.error} />
      {simple.map((s) => (
        <form key={s} action={action}>
          <input type="hidden" name="id" value={orderId} />
          <input type="hidden" name="from" value={status} />
          <input type="hidden" name="status" value={s} />
          <SubmitButton pendingText="Updating…" data-testid={`order-${s}`}>
            {LABEL[s]}
          </SubmitButton>
        </form>
      ))}
      {next.includes("shipped_to_hub") ? (
        <form action={action} noValidate className="v-card" aria-labelledby="ship-h">
          <h3 id="ship-h">Shipped to the Haanta hub?</h3>
          <p className="v-small">Enter the tracking details from your courier so we can follow the parcel.</p>
          <input type="hidden" name="id" value={orderId} />
          <input type="hidden" name="from" value={status} />
          <input type="hidden" name="status" value="shipped_to_hub" />
          <SelectField id="tracking_carrier" label="Carrier" required defaultValue={state.values?.tracking_carrier ?? ""} error={fe.tracking_carrier}>
            <option value="">Choose a carrier</option>
            {CARRIERS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </SelectField>
          <TextField id="tracking_number" label="Tracking number" required autoComplete="off" defaultValue={state.values?.tracking_number ?? ""} error={fe.tracking_number} data-testid="tracking-number" />
          <SubmitButton pendingText="Updating…" data-testid="order-shipped_to_hub">
            {LABEL.shipped_to_hub}
          </SubmitButton>
        </form>
      ) : null}
      {!next.length ? <p className="v-muted">Nothing more to do on this order.</p> : null}
    </div>
  )
}
