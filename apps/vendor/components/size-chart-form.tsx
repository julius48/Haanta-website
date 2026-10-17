"use client"

import { useRef, useState, useTransition } from "react"
import { deleteSizeChartAction, saveSizeChartAction, type SizeChartInput } from "@/lib/actions/store"
import { Alert, SelectField, TextArea, TextField } from "./fields"

type Row = SizeChartInput["rows"][number]

export function SizeChartEditor({ chartId, initial, canEdit }: { chartId: string | null; initial: SizeChartInput; canEdit: boolean }) {
  const [chart, setChart] = useState<SizeChartInput>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const alertRef = useRef<HTMLDivElement>(null)

  const setRow = (i: number, patch: Partial<Row>) => setChart((c) => ({ ...c, rows: c.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  const setCol = (i: number, name: string) => setChart((c) => ({ ...c, columns: c.columns.map((x, j) => (j === i ? name : x)) }))
  const addCol = () => setChart((c) => ({ ...c, columns: [...c.columns, ""], rows: c.rows.map((r) => ({ ...r, values: [...r.values, ""] })) }))
  const removeCol = (i: number) => setChart((c) => ({ ...c, columns: c.columns.filter((_, j) => j !== i), rows: c.rows.map((r) => ({ ...r, values: r.values.filter((_, j) => j !== i) })) }))
  const addRow = () => setChart((c) => ({ ...c, rows: [...c.rows, { label: "", us: "", uk: "", eu: "", values: c.columns.map(() => "") }] }))
  const removeRow = (i: number) => setChart((c) => ({ ...c, rows: c.rows.filter((_, j) => j !== i) }))

  function fail(message: string, fieldErrors: Record<string, string> = {}) {
    setErrors(fieldErrors)
    setFormError(message)
    requestAnimationFrame(() => alertRef.current?.focus())
  }

  function save() {
    const cleaned = { ...chart, columns: chart.columns.map((c) => c.trim()) }
    if (cleaned.columns.some((c) => !c)) return fail("Name every measurement column or remove empty ones.", { columns: "Name every measurement column" })
    startTransition(async () => {
      const r = await saveSizeChartAction(chartId, cleaned)
      if (r && !r.ok) fail(r.error, r.fieldErrors)
    })
  }

  function remove() {
    if (!chartId) return
    startTransition(async () => {
      const r = await deleteSizeChartAction(chartId)
      if (r && !r.ok) fail(r.error)
    })
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      data-testid="size-chart-form"
    >
      <div ref={alertRef} tabIndex={-1}>
        {formError ? (
          <Alert tone="error" title={formError}>
            {Object.keys(errors).length ? (
              <ul>
                {Object.entries(errors).map(([k, v]) => (
                  <li key={k}>{v}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}
      </div>
      <fieldset disabled={!canEdit || pending} className="v-fieldset">
        <div className="v-card">
          <div className="v-grid v-grid--2">
            <TextField id="name" label="Chart name" required maxLength={80} value={chart.name} onChange={(e) => setChart({ ...chart, name: e.currentTarget.value })} error={errors.name} hint="For example: Women's dresses" />
            <SelectField id="unit" label="Measurements in" value={chart.unit} onChange={(e) => setChart({ ...chart, unit: e.currentTarget.value === "cm" ? "cm" : "in" })}>
              <option value="in">Inches</option>
              <option value="cm">Centimetres</option>
            </SelectField>
          </div>
          <TextArea id="notes" label="Notes" optional rows={2} maxLength={500} value={chart.notes} onChange={(e) => setChart({ ...chart, notes: e.currentTarget.value })} error={errors.notes} hint="For example: model is 5'8&quot; and wears size M." />
        </div>

        <div className="v-card">
          <h2>Measurement columns</h2>
          {errors.columns ? <p className="v-error">{errors.columns}</p> : null}
          <ul className="v-list">
            {chart.columns.map((c, i) => (
              <li key={i} className="v-row" style={{ alignItems: "end" }}>
                <TextField id={`col-${i}`} label={`Column ${i + 1}`} value={c} maxLength={30} onChange={(e) => setCol(i, e.currentTarget.value)} hint="e.g. bust, waist, hips, length" />
                <button type="button" className="h-btn v-btn-danger v-btn-sm" onClick={() => removeCol(i)} style={{ marginBottom: "var(--space-4)" }}>
                  Remove column {c || i + 1}
                </button>
              </li>
            ))}
          </ul>
          {chart.columns.length < 12 ? (
            <button type="button" className="h-btn h-btn--secondary" onClick={addCol}>
              Add measurement column
            </button>
          ) : null}
        </div>

        <div className="v-card">
          <h2>Sizes</h2>
          {errors.rows ? <p className="v-error">{errors.rows}</p> : null}
          <div className="v-table-wrap" role="region" aria-label="Size chart rows" tabIndex={0}>
            <table className="v-table">
              <thead>
                <tr>
                  <th scope="col">Size</th>
                  <th scope="col">US</th>
                  <th scope="col">UK</th>
                  <th scope="col">EU</th>
                  {chart.columns.map((c, i) => (
                    <th scope="col" key={i}>
                      {c || `Column ${i + 1}`} ({chart.unit})
                    </th>
                  ))}
                  <th scope="col">
                    <span className="h-sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {chart.rows.map((r, i) => {
                  const labelErr = errors[`row-${i}-label`]
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          className="v-input"
                          aria-label={`Row ${i + 1} size label`}
                          value={r.label}
                          maxLength={30}
                          onChange={(e) => setRow(i, { label: e.currentTarget.value })}
                          aria-invalid={labelErr ? true : undefined}
                          aria-describedby={labelErr ? `row-${i}-label-error` : undefined}
                        />
                        {labelErr ? (
                          <span className="v-error" id={`row-${i}-label-error`}>
                            {labelErr}
                          </span>
                        ) : null}
                      </td>
                      {(["us", "uk", "eu"] as const).map((k) => (
                        <td key={k}>
                          <input className="v-input" aria-label={`Row ${i + 1} ${k.toUpperCase()} size`} value={r[k]} maxLength={10} onChange={(e) => setRow(i, { [k]: e.currentTarget.value })} />
                        </td>
                      ))}
                      {chart.columns.map((c, j) => (
                        <td key={j}>
                          <input
                            className="v-input"
                            inputMode="decimal"
                            aria-label={`Row ${i + 1} ${c || `column ${j + 1}`}`}
                            value={r.values[j] ?? ""}
                            maxLength={20}
                            onChange={(e) => {
                              const values = [...r.values]
                              values[j] = e.currentTarget.value
                              setRow(i, { values })
                            }}
                          />
                        </td>
                      ))}
                      <td>
                        <button type="button" className="h-btn v-btn-danger v-btn-sm" onClick={() => removeRow(i)} disabled={chart.rows.length <= 1} aria-label={`Remove row ${r.label || i + 1}`}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {chart.rows.length < 40 ? (
            <button type="button" className="h-btn h-btn--secondary" onClick={addRow} style={{ marginTop: "var(--space-4)" }}>
              Add a size
            </button>
          ) : null}
        </div>
      </fieldset>
      {canEdit ? (
        <div className="v-sticky-actions">
          <button type="submit" className="h-btn h-btn--primary" disabled={pending} data-testid="save-size-chart">
            {pending ? "Saving…" : "Save size chart"}
          </button>
          {chartId ? (
            confirmDelete ? (
              <span className="v-row" role="group" aria-label="Confirm delete">
                <span>Delete this size chart?</span>
                <button type="button" className="h-btn v-btn-danger-solid" onClick={remove} disabled={pending}>
                  Yes, delete
                </button>
                <button type="button" className="h-btn h-btn--ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="h-btn v-btn-danger" onClick={() => setConfirmDelete(true)} disabled={pending}>
                Delete
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
