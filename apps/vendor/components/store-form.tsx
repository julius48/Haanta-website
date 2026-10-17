"use client"

import { useActionState, useState } from "react"
import { saveStoreAction } from "@/lib/actions/store"
import type { FormState } from "@/lib/form-state"
import { FORMATTING_HELP } from "@/lib/rich-text"
import { Alert, FormErrors, TextArea, TextField } from "./fields"
import { ImageUploader } from "./image-uploader"
import { SubmitButton } from "./submit-button"

export interface StoreFormValues {
  logo_url: string
  banner_url: string
  story: string
  policies: string
  size_notes: string
  region: string
}

const initial: FormState = {}

export function StoreForm({ values, canEdit }: { values: StoreFormValues; canEdit: boolean }) {
  const [state, action] = useActionState(saveStoreAction, initial)
  const [logo, setLogo] = useState(values.logo_url ? [values.logo_url] : [])
  const [banner, setBanner] = useState(values.banner_url ? [values.banner_url] : [])
  const fe = state.fieldErrors ?? {}
  const v = state.values ?? values
  return (
    <form action={action} noValidate data-testid="store-form">
      {state.message ? (
        <Alert tone="success" title="Saved">
          <p>{state.message}</p>
        </Alert>
      ) : null}
      <FormErrors error={state.error} />
      <fieldset disabled={!canEdit} className="v-fieldset">
        <div className="v-grid v-grid--2">
          <ImageUploader id="logo" name="logo_url" label="Logo" hint="Square image works best. JPEG, PNG or WebP up to 10 MB." purpose="logo" max={1} value={logo} onChange={setLogo} error={fe.logo_url} disabled={!canEdit} />
          <ImageUploader id="banner" name="banner_url" label="Banner" hint="Wide image, about 3:1. JPEG, PNG or WebP up to 10 MB." purpose="banner" max={1} value={banner} onChange={setBanner} error={fe.banner_url} disabled={!canEdit} />
        </div>
        <TextArea id="story" label="Your brand story" rows={8} hint={FORMATTING_HELP} defaultValue={v.story} error={fe.story} data-testid="store-story" />
        <TextField id="region" label="Where you're based" optional maxLength={120} hint="For example Lagos, Nigeria" defaultValue={v.region} error={fe.region} />
        <TextField id="size_notes" label="Size notes" optional maxLength={300} hint="For example: our pieces run long; petite buyers may want to size down." defaultValue={v.size_notes} error={fe.size_notes} />
        <TextArea id="policies" label="Policies" optional rows={5} maxLength={5000} hint="Care, alterations, made-to-order timelines. Haanta's returns policy applies to every order." defaultValue={v.policies} error={fe.policies} />
      </fieldset>
      {canEdit ? (
        <SubmitButton pendingText="Saving…" data-testid="save-store">
          Save store page
        </SubmitButton>
      ) : null}
    </form>
  )
}
