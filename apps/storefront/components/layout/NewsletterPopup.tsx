"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Dialog } from "@/components/ui/Dialog"
import { NewsletterForm } from "./NewsletterForm"
import {
  parseStoredTimestamp,
  popupDelayMs,
  POPUP_STORAGE_KEY,
  POPUP_SUBSCRIBED_KEY,
  shouldShowPopup,
  type PopupConfig,
} from "@/lib/popup"

/** Newsletter popup controlled by backend settings; frequency cap in localStorage; off on mobile unless allowed. */
export function NewsletterPopup({ config, blocked }: { config: PopupConfig; blocked: boolean }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const quietPage = /^\/(checkout|cart|account|order)/.test(pathname)

  useEffect(() => {
    if (blocked || quietPage) return
    let last: number | null = null
    let subscribed = false
    try {
      last = parseStoredTimestamp(localStorage.getItem(POPUP_STORAGE_KEY))
      subscribed = localStorage.getItem(POPUP_SUBSCRIBED_KEY) === "1"
    } catch {
      return
    }
    const isMobile = window.matchMedia("(max-width: 767px)").matches
    if (!shouldShowPopup(config, { now: Date.now(), lastShownAt: last, isMobile, subscribed }))
      return
    const t = window.setTimeout(() => {
      // Never interrupt someone typing in a form.
      const a = document.activeElement
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT")) return
      if (document.querySelector("dialog[open]")) return
      try {
        localStorage.setItem(POPUP_STORAGE_KEY, String(Date.now()))
      } catch {
        // ignore
      }
      setOpen(true)
    }, popupDelayMs(config))
    return () => window.clearTimeout(t)
  }, [config, blocked, quietPage])

  const close = useCallback(() => setOpen(false), [])

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Join the Haanta list"
      size="sm"
      testId="newsletter-popup"
    >
      <p>Be first to meet new designers, hear about restocks and read stories from the studios.</p>
      <NewsletterForm source="popup" />
      <button type="button" className="h-btn h-btn--ghost" onClick={close}>
        No thanks
      </button>
    </Dialog>
  )
}
