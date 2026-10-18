"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"

/**
 * Behaviour for the server-rendered desktop nav (no React tree to hydrate for the panels).
 * Triggers are button[data-panel="<key>"] with aria-controls pointing at a [hidden] panel.
 * Opens one panel at a time; Escape, an outside click, a link click or a route change closes it.
 */
export function MegaMenuController({ navId }: { navId: string }) {
  const pathname = usePathname()

  useEffect(() => {
    const nav = document.getElementById(navId)
    if (!nav) return
    const triggers = () => [...nav.querySelectorAll<HTMLButtonElement>("button[data-panel]")]
    const setOpen = (key: string | null) => {
      for (const b of triggers()) {
        const open = b.dataset.panel === key
        b.setAttribute("aria-expanded", String(open))
        const panel = document.getElementById(b.getAttribute("aria-controls") ?? "")
        if (panel) panel.hidden = !open
      }
    }
    const openKey = () => triggers().find((b) => b.getAttribute("aria-expanded") === "true")?.dataset.panel ?? null

    const onNavClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const trigger = target.closest<HTMLButtonElement>("button[data-panel]")
      if (trigger) {
        setOpen(openKey() === trigger.dataset.panel ? null : (trigger.dataset.panel ?? null))
        return
      }
      if (target.closest("a")) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      const key = openKey()
      if (!key) return
      setOpen(null)
      nav.querySelector<HTMLButtonElement>(`button[data-panel="${key}"]`)?.focus()
    }
    const onDown = (e: MouseEvent) => {
      if (openKey() && !nav.contains(e.target as Node)) setOpen(null)
    }
    nav.addEventListener("click", onNavClick)
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDown)
    return () => {
      nav.removeEventListener("click", onNavClick)
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDown)
    }
  }, [navId])

  // Close any open panel after navigation.
  useEffect(() => {
    const nav = document.getElementById(navId)
    nav?.querySelectorAll<HTMLButtonElement>('button[data-panel][aria-expanded="true"]').forEach((b) => b.click())
  }, [navId, pathname])

  return null
}
