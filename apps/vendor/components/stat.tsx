import type { ReactNode } from "react"

/** A key figure: small-caps label, the value in display type, an optional note beneath. */
export function Stat({ label, value, note, tone, testId }: { label: string; value: string; note?: ReactNode; tone?: "alert"; testId?: string }) {
  return (
    <div className={`v-stat ${tone === "alert" ? "v-stat--alert" : ""}`} data-testid={testId}>
      <p className="v-stat__label">{label}</p>
      <p className="v-stat__value">{value}</p>
      {note ? <p className="v-stat__note">{note}</p> : null}
    </div>
  )
}
