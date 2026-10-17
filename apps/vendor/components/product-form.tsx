"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { deleteProductAction, previewPricesAction, saveProductAction, type SaveIntent } from "@/lib/actions/products"
import { categoryGroups } from "@/lib/categories"
import { buildSnapshot, generateVariants, MAX_VARIANTS, MEASUREMENTS, parsedOptions, submitProblems, validateSnapshot, type FieldErrors, type OptionRow, type ProductForm as Form, type VariantRow } from "@/lib/listing"
import { formatMinor, parsePriceToMinor } from "@/lib/money"
import { FORMATTING_HELP } from "@/lib/rich-text"
import type { ListingView, PricePreview } from "@/lib/types"
import { ListingChips } from "./chips"
import { Alert, Checkbox, describedBy, SelectField, TextArea, TextField } from "./fields"
import { ImageUploader } from "./image-uploader"

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  subtitle: "Subtitle",
  description: "Description",
  material: "Material",
  care: "Care",
  category: "Category",
  images: "Photos",
  lead_time_days: "Lead time",
  options: "Options",
  variants: "Variants",
  fit_notes: "Fit notes",
  styles: "Styles",
  form: "Product",
}

function labelFor(id: string): string {
  if (FIELD_LABELS[id]) return FIELD_LABELS[id]
  const v = /^variant-(\d+)-(\w+)$/.exec(id)
  if (v) return `Variant ${Number(v[1]) + 1} ${v[2]}`
  const o = /^option-(\d+)-(\w+)$/.exec(id)
  if (o) return `Option ${Number(o[1]) + 1} ${o[2]}`
  return id
}

export function ProductEditor({
  productId,
  initial,
  listing,
  sizeCharts,
  canEdit,
  canSubmit,
  savedDescriptionHtml,
  initialPrices,
  flash,
}: {
  productId: string | null
  initial: Form
  listing: ListingView | null
  sizeCharts: { id: string; name: string }[]
  canEdit: boolean
  canSubmit: boolean
  savedDescriptionHtml: string | null
  initialPrices: PricePreview[]
  flash: "saved" | "submitted" | null
}) {
  const [form, setForm] = useState<Form>(() => (initial.variants.length ? initial : { ...initial, variants: generateVariants(initial.options, []) }))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [busyIntent, setBusyIntent] = useState<SaveIntent | "delete" | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setOptions = (options: OptionRow[]) => setForm((f) => ({ ...f, options, variants: generateVariants(options, f.variants) }))
  const setVariant = (i: number, patch: Partial<VariantRow>) => setForm((f) => ({ ...f, variants: f.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }))

  // ------------------------------------------------------------ live price preview (debounced)
  const [prices, setPrices] = useState<PricePreview[]>(initialPrices)
  const [previewMsg, setPreviewMsg] = useState("")
  const priceInputs = form.variants.map((v) => v.price)
  const previewKey = JSON.stringify({ c: form.category, cur: form.currency, p: priceInputs })
  useEffect(() => {
    const parsed = JSON.parse(previewKey) as { c: string; cur: "USD" | "NGN"; p: string[] }
    if (!parsed.p.length || parsed.p.some((p) => parsePriceToMinor(p) === null)) {
      setPreviewMsg(parsed.p.length ? "Enter a price for every variant to see storefront prices." : "")
      return
    }
    let cancelled = false
    setPreviewMsg("Updating storefront prices…")
    const timer = setTimeout(async () => {
      const r = await previewPricesAction({ category: parsed.c, currency: parsed.cur, prices: parsed.p })
      if (cancelled) return
      if (r.ok) {
        setPrices(r.data)
        setPreviewMsg("Storefront prices updated.")
      } else setPreviewMsg(r.error)
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [previewKey])
  const pricesCurrent = prices.length === form.variants.length

  // ------------------------------------------------------------ save / submit / delete
  function showErrors(errs: FieldErrors, message: string) {
    setErrors(errs)
    setFormError(message)
    requestAnimationFrame(() => summaryRef.current?.focus())
  }

  function run(intent: SaveIntent) {
    const local = validateSnapshot(buildSnapshot(form, []), BACKEND_URL)
    const errs: FieldErrors = local.ok ? {} : { ...local.errors }
    if (intent === "submit") Object.assign(errs, submitProblems(form))
    if (Object.keys(errs).length) return showErrors(errs, "Please fix the highlighted fields.")
    setErrors({})
    setFormError(null)
    setBusyIntent(intent)
    startTransition(async () => {
      const r = await saveProductAction(productId, form, intent)
      // Success redirects; we only get here with an error.
      if (r && !r.ok) showErrors(r.fieldErrors ?? {}, r.error)
      setBusyIntent(null)
    })
  }

  function remove() {
    if (!productId) return
    setBusyIntent("delete")
    startTransition(async () => {
      const r = await deleteProductAction(productId)
      if (r && !r.ok) showErrors({}, r.error)
      setBusyIntent(null)
    })
  }

  const isLive = !!listing?.is_live
  const status = listing?.status ?? "draft"
  const submittable = !isLive && (status === "draft" || status === "changes_requested")
  const deletable = !!productId && !isLive && !listing?.product_id && status !== "in_review"
  const errorEntries = Object.entries(errors)
  const err = (id: string) => errors[id]
  const options = parsedOptions(form.options)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        run("save")
      }}
      data-testid="product-form"
    >
      {flash === "saved" ? <Alert tone="success" title="Saved">{isLive ? <p>Your changes are with Haanta for review. The current version stays live until they&apos;re approved.</p> : null}</Alert> : null}
      {flash === "submitted" ? (
        <Alert tone="success" title="Submitted for review">
          <p>Haanta will review your product. We&apos;ll let you know if anything needs changing.</p>
        </Alert>
      ) : null}
      {listing ? (
        <div className="v-card">
          <div className="v-item">
            <strong>Status</strong>
            <ListingChips product={listing} />
          </div>
          {listing.review_note && status !== "live" ? (
            <Alert tone="warning" title="Haanta's review note">
              <p>{listing.review_note}</p>
            </Alert>
          ) : null}
          {isLive ? (
            <p className="v-small" style={{ marginTop: "var(--space-2)" }}>
              This product is live. Edits go back to Haanta for review; the current version stays live on the storefront until your changes are approved.
            </p>
          ) : null}
        </div>
      ) : null}

      <div ref={summaryRef} tabIndex={-1} aria-live="assertive">
        {formError ? (
          <Alert tone="error" title={formError}>
            {errorEntries.length ? (
              <ul>
                {errorEntries.map(([id, msg]) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      onClick={(e) => {
                        const el = document.getElementById(id) ?? document.getElementById(`${id}-group`)
                        if (el) {
                          e.preventDefault()
                          el.scrollIntoView({ block: "center" })
                          ;(el.matches("input,select,textarea,button") ? el : (el.querySelector<HTMLElement>("input,select,textarea,button") ?? el)).focus()
                        }
                      }}
                    >
                      {labelFor(id)}: {msg}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}
      </div>

      <fieldset disabled={!canEdit || pending} className="v-fieldset">
        <section className="v-card" aria-labelledby="sec-basics">
          <h2 id="sec-basics">The basics</h2>
          <TextField id="title" label="Title" required maxLength={200} value={form.title} onChange={(e) => set("title", e.currentTarget.value)} error={err("title")} data-testid="product-title" />
          <TextField id="subtitle" label="Subtitle" optional maxLength={200} value={form.subtitle} onChange={(e) => set("subtitle", e.currentTarget.value)} error={err("subtitle")} />
          <SelectField id="category" label="Category" value={form.category} onChange={(e) => set("category", e.currentTarget.value)} error={err("category")} hint="Storefront prices can depend on the category." data-testid="product-category">
            <option value="">Choose a category</option>
            {categoryGroups().map(({ group, children }) => (
              <optgroup key={group.path} label={group.name}>
                <option value={group.path}>{group.name} (general)</option>
                {children.map((c) => (
                  <option key={c.path} value={c.path}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectField>
          <TextArea id="description" label="Description" rows={8} hint={FORMATTING_HELP} value={form.description} onChange={(e) => set("description", e.currentTarget.value)} error={err("description")} data-testid="product-description" />
          {savedDescriptionHtml ? (
            <details className="v-field">
              <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>Preview the saved description</summary>
              {/* Sanitised by the Haanta API (allow-list) before storage. */}
              <div className="v-prose v-card" dangerouslySetInnerHTML={{ __html: savedDescriptionHtml }} />
            </details>
          ) : null}
          <div className="v-grid v-grid--2">
            <TextField id="material" label="Material" optional maxLength={200} hint="For example 100% cotton Ankara" value={form.material} onChange={(e) => set("material", e.currentTarget.value)} error={err("material")} />
            <TextField id="styles" label="Styles" optional hint="Comma separated, e.g. casual, party, aso-oke" value={form.styles} onChange={(e) => set("styles", e.currentTarget.value)} error={err("styles")} />
          </div>
          <TextArea id="care" label="Care instructions" optional rows={3} maxLength={1000} value={form.care} onChange={(e) => set("care", e.currentTarget.value)} error={err("care")} />
        </section>

        <section className="v-card" aria-labelledby="sec-photos">
          <h2 id="sec-photos">Photos</h2>
          <ImageUploader
            id="images"
            label="Product photos"
            hint="JPEG, PNG or WebP, up to 10 MB each, up to 12 photos. The first photo is the main one."
            purpose="product"
            max={12}
            value={form.images}
            onChange={(urls) => set("images", urls)}
            error={err("images")}
            disabled={!canEdit || pending}
          />
        </section>

        <section className="v-card" aria-labelledby="sec-fulfilment">
          <h2 id="sec-fulfilment">How it&apos;s made and shipped</h2>
          <fieldset className="v-fieldset">
            <legend>Fulfilment</legend>
            <label className="v-check">
              <input type="radio" name="fulfilment_type" value="ready_to_wear" checked={form.fulfilment_type === "ready_to_wear"} onChange={() => set("fulfilment_type", "ready_to_wear")} />
              <span>Ready to wear — ships in 24–48 hours</span>
            </label>
            <label className="v-check">
              <input type="radio" name="fulfilment_type" value="made_to_order" checked={form.fulfilment_type === "made_to_order"} onChange={() => set("fulfilment_type", "made_to_order")} data-testid="fulfilment-mto" />
              <span>Made to order — I make it after the order</span>
            </label>
          </fieldset>
          {form.fulfilment_type === "made_to_order" ? (
            <TextField
              id="lead_time_days"
              label="Lead time (days to make it)"
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              value={form.lead_time_days}
              onChange={(e) => set("lead_time_days", e.currentTarget.value)}
              error={err("lead_time_days")}
            />
          ) : null}
          <Checkbox id="is_preorder" label="Pre-order (buyers order now, you ship later)" checked={form.is_preorder} onChange={(e) => set("is_preorder", e.currentTarget.checked)} />
          <fieldset className="v-fieldset" aria-describedby="measurements-hint">
            <legend>Measurements buyers must give</legend>
            <span className="v-hint" id="measurements-hint">
              Usually for made-to-order pieces. Buyers enter these in inches at checkout.
            </span>
            <div className="v-choice-grid">
              {MEASUREMENTS.map((m) => (
                <label key={m.key} className="v-check">
                  <input
                    type="checkbox"
                    checked={form.required_measurements.includes(m.key)}
                    onChange={(e) => {
                      const on = e.currentTarget.checked
                      set("required_measurements", on ? [...form.required_measurements, m.key] : form.required_measurements.filter((k) => k !== m.key))
                    }}
                  />
                  <span>{m.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <SelectField id="size_chart_id" label="Size chart" optional value={form.size_chart_id} onChange={(e) => set("size_chart_id", e.currentTarget.value)} hint={sizeCharts.length ? undefined : "Create size charts on the Size charts page."}>
            <option value="">No size chart</option>
            {sizeCharts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <TextArea id="fit_notes" label="Fit notes" optional rows={2} maxLength={500} hint="For example: runs small, size up if between sizes." value={form.fit_notes} onChange={(e) => set("fit_notes", e.currentTarget.value)} error={err("fit_notes")} />
        </section>

        <section className="v-card" aria-labelledby="sec-options">
          <h2 id="sec-options">Options</h2>
          <p className="v-small v-muted">Add up to 4 options such as Size or Colour. We create a variant for every combination.</p>
          {err("options") ? <p className="v-error">{err("options")}</p> : null}
          {form.options.map((o, i) => (
            <fieldset key={i} className="v-fieldset v-grid v-grid--2" style={{ alignItems: "end" }}>
              <legend className="h-sr-only">Option {i + 1}</legend>
              <TextField
                id={`option-${i}-title`}
                label={`Option ${i + 1} name`}
                value={o.title}
                placeholder="Size"
                onChange={(e) => setOptions(form.options.map((x, j) => (j === i ? { ...x, title: e.currentTarget.value } : x)))}
                error={err(`option-${i}-title`)}
                data-testid={`option-${i}-title`}
              />
              <TextField
                id={`option-${i}-values`}
                label={`Option ${i + 1} values`}
                hint="Comma separated, e.g. S, M, L"
                value={o.values}
                onChange={(e) => setOptions(form.options.map((x, j) => (j === i ? { ...x, values: e.currentTarget.value } : x)))}
                error={err(`option-${i}-values`)}
                data-testid={`option-${i}-values`}
              />
              {form.options.length > 1 ? (
                <button type="button" className="h-btn v-btn-danger v-btn-sm" onClick={() => setOptions(form.options.filter((_, j) => j !== i))}>
                  Remove option {i + 1}
                </button>
              ) : null}
            </fieldset>
          ))}
          {form.options.length < 4 ? (
            <button type="button" className="h-btn h-btn--secondary" onClick={() => setOptions([...form.options, { title: "", values: "" }])}>
              Add another option
            </button>
          ) : null}
        </section>

        <section className="v-card" aria-labelledby="sec-variants">
          <h2 id="sec-variants">Variants, prices and stock</h2>
          <p className="v-small">Enter the price <strong>you want to receive</strong> for each variant. Haanta adds its fee and shows you the storefront price below before you submit.</p>
          {err("variants") ? <p className="v-error">{err("variants")}</p> : null}
          <SelectField id="currency" label="Price currency" value={form.currency} onChange={(e) => set("currency", e.currentTarget.value === "NGN" ? "NGN" : "USD")}>
            <option value="USD">US dollars (USD)</option>
            <option value="NGN">Naira (NGN)</option>
          </SelectField>
          {form.variants.length ? <BulkPrice disabled={!canEdit || pending} onApply={(price) => setForm((f) => ({ ...f, variants: f.variants.map((v) => ({ ...v, price })) }))} /> : null}
          {form.variants.length >= MAX_VARIANTS ? <p className="v-error">Only the first {MAX_VARIANTS} combinations are used.</p> : null}
          <p role="status" aria-live="polite" className="v-small v-muted" data-testid="price-preview-status">
            {previewMsg}
          </p>
          {!options.length ? <p className="v-muted">Add option values above to create variants.</p> : null}
          <ol className="v-list" aria-label="Variants">
            {form.variants.map((v, i) => {
              const p = pricesCurrent ? prices[i] : undefined
              return (
                <li key={v.key}>
                  <fieldset className="v-fieldset">
                    <legend>
                      <strong>{v.title || `Variant ${i + 1}`}</strong>
                    </legend>
                    <div className="v-grid v-grid--4">
                      <TextField
                        id={`variant-${i}-price`}
                        label={`Your price (${form.currency})`}
                        inputMode="decimal"
                        value={v.price}
                        onChange={(e) => setVariant(i, { price: e.currentTarget.value })}
                        error={err(`variant-${i}-price`)}
                        data-testid={`variant-${i}-price`}
                      />
                      <TextField id={`variant-${i}-sku`} label="SKU" optional value={v.sku} maxLength={64} onChange={(e) => setVariant(i, { sku: e.currentTarget.value })} error={err(`variant-${i}-sku`)} />
                      <TextField
                        id={`variant-${i}-weight`}
                        label="Weight (kg)"
                        optional
                        inputMode="decimal"
                        hint="Packed weight, for shipping"
                        value={v.weight}
                        onChange={(e) => setVariant(i, { weight: e.currentTarget.value })}
                        error={err(`variant-${i}-weight`)}
                      />
                      <SelectField id={`variant-${i}-location`} label="Ships from" value={v.stock_location} onChange={(e) => setVariant(i, { stock_location: e.currentTarget.value === "houston" ? "houston" : "lagos" })}>
                        <option value="lagos">Lagos</option>
                        <option value="houston">Houston hub</option>
                      </SelectField>
                    </div>
                    {form.fulfilment_type === "ready_to_wear" ? (
                      <div className="v-grid v-grid--2" style={{ alignItems: "start" }}>
                        <Checkbox id={`variant-${i}-always`} label="Always available" checked={v.always_available} onChange={(e) => setVariant(i, { always_available: e.currentTarget.checked })} />
                        {!v.always_available ? (
                          <TextField
                            id={`variant-${i}-quantity`}
                            label="Stock quantity"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={v.quantity}
                            onChange={(e) => setVariant(i, { quantity: e.currentTarget.value })}
                            error={err(`variant-${i}-quantity`)}
                          />
                        ) : null}
                      </div>
                    ) : (
                      <p className="v-small v-muted">Made to order: always available.</p>
                    )}
                    {err(`variant-${i}-options`) ? <p className="v-error">{err(`variant-${i}-options`)}</p> : null}
                    <p className="v-small" data-testid={`variant-${i}-storefront-price`} aria-live="off">
                      {p ? (
                        <>
                          Storefront price: <strong>{formatMinor(p.retail.USD ?? 0, "USD")}</strong>
                          {p.retail.CAD != null ? (
                            <>
                              {" "}
                              · <strong>{formatMinor(p.retail.CAD, "CAD")}</strong>
                            </>
                          ) : null}{" "}
                          <span className="v-muted">(you receive {formatMinor(p.vendor_price_usd_minor, "USD")})</span>
                        </>
                      ) : (
                        <span className="v-muted">Storefront price appears once you enter a price.</span>
                      )}
                    </p>
                  </fieldset>
                </li>
              )
            })}
          </ol>
        </section>
      </fieldset>

      {canEdit ? (
        <div className="v-sticky-actions">
          <button type="submit" className="h-btn h-btn--secondary" disabled={pending} data-testid="save-product">
            {busyIntent === "save" ? "Saving…" : isLive ? "Save and send changes for review" : "Save draft"}
          </button>
          {submittable ? (
            <button type="button" className="h-btn h-btn--primary" disabled={pending || !canSubmit} aria-describedby={canSubmit ? undefined : "submit-blocked"} onClick={() => run("submit")} data-testid="submit-product">
              {busyIntent === "submit" ? "Submitting…" : "Submit for review"}
            </button>
          ) : null}
          {deletable ? (
            confirmDelete ? (
              <span className="v-row" role="group" aria-label="Confirm delete">
                <span>Delete this draft for good?</span>
                <button type="button" className="h-btn v-btn-danger-solid" onClick={remove} disabled={pending} data-testid="confirm-delete">
                  {busyIntent === "delete" ? "Deleting…" : "Yes, delete"}
                </button>
                <button type="button" className="h-btn h-btn--ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="h-btn v-btn-danger" onClick={() => setConfirmDelete(true)} disabled={pending} data-testid="delete-product">
                Delete draft
              </button>
            )
          ) : null}
          {!canSubmit && submittable ? (
            <p id="submit-blocked" className="v-small v-muted" style={{ margin: 0, flexBasis: "100%" }}>
              You can submit products once Haanta approves your store.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="v-alert v-alert--warning">Your store is paused, so products can&apos;t be edited right now.</p>
      )}
    </form>
  )
}

function BulkPrice({ onApply, disabled }: { onApply: (price: string) => void; disabled: boolean }) {
  const [value, setValue] = useState("")
  const invalid = value !== "" && parsePriceToMinor(value) === null
  return (
    <div className="v-row" style={{ alignItems: "end", marginBottom: "var(--space-4)" }}>
      <div className="v-field" style={{ marginBottom: 0 }}>
        <label className="v-label" htmlFor="bulk-price">
          Same price for all variants
        </label>
        <input
          id="bulk-price"
          className="v-input"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy("bulk-price", undefined, invalid ? "Enter a price like 68 or 68.50" : null)}
        />
        {invalid ? (
          <span className="v-error" id="bulk-price-error">
            Enter a price like 68 or 68.50
          </span>
        ) : null}
      </div>
      <button type="button" className="h-btn h-btn--secondary" disabled={disabled || !value || invalid} onClick={() => onApply(value.trim())}>
        Apply to all
      </button>
    </div>
  )
}
