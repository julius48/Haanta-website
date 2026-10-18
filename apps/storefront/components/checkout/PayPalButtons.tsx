"use client"

import { useEffect, useRef, useState } from "react"
import { createPaypalSessionAction } from "@/app/actions/checkout"

interface PayPalButtonsInstance {
  render: (el: HTMLElement) => Promise<void>
  close?: () => Promise<void>
}
interface PayPalNamespace {
  Buttons: (opts: { createOrder: () => Promise<string>; onApprove: () => Promise<void>; onError: (e: unknown) => void; style?: Record<string, string> }) => PayPalButtonsInstance
}

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""

/** PayPal JS SDK, loaded only on checkout and only when a client id is configured. */
export function PayPalButtons({ currency, onApproved }: { currency: string; onApproved: () => Promise<string | null> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return
    const el = ref.current
    let buttons: PayPalButtonsInstance | null = null
    const render = () => {
      const pp = (window as unknown as { paypal?: PayPalNamespace }).paypal
      if (!pp) return
      buttons = pp.Buttons({
        style: { layout: "horizontal", label: "paypal", tagline: "false" },
        createOrder: async () => {
          const r = await createPaypalSessionAction()
          if (!r.ok) throw new Error(r.message)
          return r.order_id
        },
        onApprove: async () => {
          const msg = await onApproved()
          if (msg) setError(msg)
        },
        onError: () => setError("PayPal could not complete the payment. Please try another method."),
      })
      void buttons.render(el)
    }
    const id = "haanta-paypal-sdk"
    let script = document.getElementById(id) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement("script")
      script.id = id
      script.async = true
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CLIENT_ID)}&currency=${currency.toUpperCase()}&intent=capture&components=buttons`
      document.head.appendChild(script)
    }
    if ((window as unknown as { paypal?: unknown }).paypal) render()
    else script.addEventListener("load", render, { once: true })
    return () => {
      void buttons?.close?.()
    }
  }, [currency, onApproved])

  if (!CLIENT_ID) return null
  return (
    <div className="s-paypal">
      <p className="s-small">Or pay with PayPal</p>
      <div ref={ref} />
      <p role="alert" className="s-error">
        {error}
      </p>
    </div>
  )
}
