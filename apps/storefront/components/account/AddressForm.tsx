"use client"

import { useActionState } from "react"
import { addAddressAction } from "@/app/actions/account"
import { Field, FormMessage } from "@/components/ui/Field"
import type { ActionState } from "@/lib/types"

export function AddressForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(addAddressAction, { status: "idle" })
  const e = state.status === "error" ? (state.fieldErrors ?? {}) : {}
  return (
    <form action={action} className="s-auth-form" noValidate key={state.status === "ok" ? "reset" : "form"}>
      <div className="s-form-row">
        <Field id="ad-first" name="first_name" label="First name" autoComplete="given-name" required error={e.first_name} />
        <Field id="ad-last" name="last_name" label="Last name" autoComplete="family-name" required error={e.last_name} />
      </div>
      <div className="s-field">
        <label htmlFor="ad-country" className="s-label">
          Country <span className="s-required">(required)</span>
        </label>
        <select id="ad-country" name="country_code" className="s-input" autoComplete="country" defaultValue="us">
          <option value="us">United States</option>
          <option value="ca">Canada</option>
          <option value="mx">Mexico</option>
        </select>
      </div>
      <Field id="ad-a1" name="address_1" label="Street address" autoComplete="address-line1" required error={e.address_1} />
      <Field id="ad-a2" name="address_2" label="Apartment, suite (optional)" autoComplete="address-line2" />
      <div className="s-form-row s-form-row--3">
        <Field id="ad-city" name="city" label="City" autoComplete="address-level2" required error={e.city} />
        <Field id="ad-prov" name="province" label="State / province" autoComplete="address-level1" required error={e.province} />
        <Field id="ad-postal" name="postal_code" label="ZIP / postal code" autoComplete="postal-code" required error={e.postal_code} />
      </div>
      <Field id="ad-phone" name="phone" label="Phone (optional)" type="tel" autoComplete="tel" error={e.phone} />
      <FormMessage state={state} />
      <button type="submit" className="h-btn h-btn--primary" disabled={pending}>
        {pending ? "Saving…" : "Save address"}
      </button>
    </form>
  )
}
