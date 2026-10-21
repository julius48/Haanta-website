"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

/**
 * Header search: the icon opens a full-width panel under the header with one large field.
 * Escape, the close button or navigation closes it. Submits to /search as a plain GET form.
 */
export function SearchToggle() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const [lastPath, setLastPath] = useState(pathname)
  const input = useRef<HTMLInputElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        className="s-icon-btn"
        aria-label="Search"
        aria-expanded={open}
        aria-controls="site-search-panel"
        onClick={() => setOpen((o) => !o)}
        data-testid="search-toggle"
      >
        <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5L20.5 20.5" />
        </svg>
      </button>
      <div id="site-search-panel" className="s-search-panel" hidden={!open}>
        <form action="/search" method="get" role="search" className="h-container s-search-panel__form">
          <label htmlFor="site-search" className="h-sr-only">
            Search products and designers
          </label>
          <input
            ref={input}
            id="site-search"
            name="q"
            type="search"
            placeholder="Search pieces and designers"
            className="s-search-panel__input"
            maxLength={100}
            autoComplete="off"
            data-testid="search-input"
          />
          <button type="submit" className="s-textlink">
            Search
          </button>
          <button type="button" className="s-search-panel__close" aria-label="Close search" onClick={() => setOpen(false)}>
            <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </form>
      </div>
    </>
  )
}
