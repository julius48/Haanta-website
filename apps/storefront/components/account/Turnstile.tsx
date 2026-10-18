"use client"

import { useEffect, useRef } from "react"

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""

/**
 * Cloudflare Turnstile widget. It adds a hidden `cf-turnstile-response` field to the form.
 * Without a site key (local dev) nothing renders and the server sends a local-dev token.
 */
export function Turnstile() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!SITE_KEY) return
    const id = "haanta-turnstile"
    if (!document.getElementById(id)) {
      const s = document.createElement("script")
      s.id = id
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"
      s.async = true
      s.defer = true
      document.head.appendChild(s)
    } else {
      const ts = (window as unknown as { turnstile?: { render: (el: HTMLElement, o: Record<string, string>) => void } }).turnstile
      if (ts && ref.current && !ref.current.childElementCount) ts.render(ref.current, { sitekey: SITE_KEY })
    }
  }, [])
  if (!SITE_KEY) return null
  return <div ref={ref} className="cf-turnstile s-turnstile" data-sitekey={SITE_KEY} data-theme="light" />
}
