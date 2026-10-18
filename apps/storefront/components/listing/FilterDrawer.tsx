"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/**
 * Filters: a static sidebar on desktop; on mobile a full-height modal drawer with its own scroll
 * area (content never cut off), a sticky apply bar, focus trap and Escape to close.
 * On desktop, changing a filter applies it immediately.
 */
export function FilterDrawer({ children, activeCount }: { children: React.ReactNode; activeCount: number }) {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const router = useRouter()

  useEffect(() => {
    const el = panel.current
    if (!el) return
    // Delegated listeners: the form remounts whenever the URL changes.
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement
      if (t.type === "number" || !t.form) return
      if (window.matchMedia("(min-width: 1024px)").matches) t.form.requestSubmit()
    }
    // Submit client-side with empty values dropped (clean, shareable URLs).
    const onSubmit = (e: Event) => {
      const form = e.target
      if (!(form instanceof HTMLFormElement)) return
      e.preventDefault()
      const params = new URLSearchParams()
      for (const [k, v] of new FormData(form).entries()) if (typeof v === "string" && v.trim() !== "") params.append(k, v.trim())
      const qs = params.toString()
      const action = form.getAttribute("action") ?? window.location.pathname
      setOpen(false)
      router.push(qs ? `${action}?${qs}` : action, { scroll: false })
    }
    el.addEventListener("change", onChange)
    el.addEventListener("submit", onSubmit)
    return () => {
      el.removeEventListener("change", onChange)
      el.removeEventListener("submit", onSubmit)
    }
  }, [router])

  useEffect(() => {
    if (!open) return
    const el = panel.current
    if (!el) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    el.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const openerEl = opener.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key !== "Tab") return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null)
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
      openerEl?.focus()
    }
  }, [open])

  return (
    <>
      <button
        ref={opener}
        type="button"
        className="h-btn h-btn--secondary s-filter-toggle"
        aria-expanded={open}
        aria-controls="filters-panel"
        onClick={() => setOpen(true)}
        data-testid="filters-open"
      >
        Filter{activeCount ? ` (${activeCount})` : ""}
      </button>
      {open ? <div className="s-filters__backdrop" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
      <div
        id="filters-panel"
        ref={panel}
        className={`s-filters ${open ? "is-open" : ""}`}
        data-open={open}
        role={open ? "dialog" : "region"}
        aria-modal={open ? true : undefined}
        aria-label="Filters"
        data-testid="filters-panel"
      >
        <div className="s-filters__head">
          <h2 className="s-filters__title">Filter</h2>
          <button type="button" className="s-icon-btn s-filters__close" onClick={() => setOpen(false)} aria-label="Close filters">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" focusable="false">
              <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </>
  )
}
