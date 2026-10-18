"use client"

import { useRouter } from "next/navigation"
import { useId } from "react"
import { SORTS } from "@/lib/filters"
import type { SortKey } from "@/lib/types"

/** Sort dropdown. Works without JS (GET form + button); with JS it applies on change. */
export function SortSelect({ value, action, hidden }: { value: SortKey; action: string; hidden: [string, string][] }) {
  const router = useRouter()
  const id = useId()
  return (
    <form
      action={action}
      method="get"
      className="s-sort"
      onChange={(e) => {
        const form = e.currentTarget
        const params = new URLSearchParams()
        for (const [k, v] of new FormData(form).entries()) if (typeof v === "string" && v !== "" && !(k === "sort" && v === "relevance")) params.append(k, v)
        const qs = params.toString()
        router.push(qs ? `${action}?${qs}` : action)
      }}
    >
      {hidden.map(([k, v], i) => (
        <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor={id} className="s-small">
        Sort by
      </label>
      <select id={id} name="sort" defaultValue={value} className="s-input s-sort__select" data-testid="sort-select">
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="h-btn h-btn--secondary">
          Sort
        </button>
      </noscript>
    </form>
  )
}
