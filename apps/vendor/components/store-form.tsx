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

/** One numbered section of the store form: a short title and why it matters, then its fields. */
function Section({ n, title, intro, children }: { n: number; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section className="v-form-section" aria-labelledby={`store-sec-${n}`}>
      <div className="v-form-section__head">
        <span className="v-form-section__n" aria-hidden="true">
          {String(n).padStart(2, "0")}
        </span>
        <div>
          <h3 id={`store-sec-${n}`}>{title}</h3>
          <p>{intro}</p>
        </div>
      </div>
      <div className="v-form-section__body">{children}</div>
    </section>
  )
}

export function StoreForm({ values, canEdit }: { values: StoreFormValues; canEdit: boolean }) {
  const [state, action] = useActionState(saveStoreAction, initial)
  const [logo, setLogo] = useState(values.logo_url ? [values.logo_url] : [])
  const [banner, setBanner] = useState(values.banner_url ? [values.banner_url] : [])
  const fe = state.fieldErrors ?? {}
  const v = state.values ?? values
  return (
    <form action={action} noValidate data-testid="store-form" className="v-store-form">
      {state.message ? (
        <Alert tone="success" title="Saved">
          <p>{state.message}</p>
        </Alert>
      ) : null}
      <FormErrors error={state.error} />
      <fieldset disabled={!canEdit} className="v-fieldset">
        <legend className="h-sr-only">Store page details</legend>
        <Section n={1} title="Imagery" intro="Your cover photo opens your page beside your name; your logo sits above it.">
          <div className="v-grid v-grid--2">
            <ImageUploader id="banner" name="banner_url" label="Cover photo" hint="A portrait or wide photograph of your work. JPEG, PNG or WebP up to 10 MB." purpose="banner" max={1} value={banner} onChange={setBanner} error={fe.banner_url} disabled={!canEdit} />
            <ImageUploader id="logo" name="logo_url" label="Logo" hint="Square works best. JPEG, PNG or WebP up to 10 MB." purpose="logo" max={1} value={logo} onChange={setLogo} error={fe.logo_url} disabled={!canEdit} />
          </div>
        </Section>
        <Section n={2} title="Your story" intro="Who you are, how you work and what makes your pieces yours. The first lines appear beside your cover photo.">
          <TextArea id="story" label="Your brand story" rows={9} hint={FORMATTING_HELP} defaultValue={v.story} error={fe.story} data-testid="store-story" />
        </Section>
        <Section n={3} title="Details" intro="Where you're based and how your pieces fit, so buyers order the right size.">
          <TextField id="region" label="Where you're based" optional maxLength={120} hint="For example Lagos, Nigeria" defaultValue={v.region} error={fe.region} />
          <TextField id="size_notes" label="Size notes" optional maxLength={300} hint="For example: our pieces run long; petite buyers may want to size down." defaultValue={v.size_notes} error={fe.size_notes} />
        </Section>
        <Section n={4} title="Policies" intro="Care, alterations and made-to-order timelines. Haanta's returns policy applies to every order.">
          <TextArea id="policies" label="Policies" optional rows={5} maxLength={5000} defaultValue={v.policies} error={fe.policies} />
        </Section>
      </fieldset>
      {canEdit ? (
        <div className="v-store-form__save">
          <p className="v-small v-muted">Your page updates as soon as you save.</p>
          <SubmitButton pendingText="Saving…" data-testid="save-store">
            Save store page
          </SubmitButton>
        </div>
      ) : null}
    </form>
  )
}
