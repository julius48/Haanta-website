"use client"

import { useState, useTransition } from "react"
import { saveConsentAction } from "@/app/actions/misc"

/**
 * Cookie banner. Nothing optional loads until the shopper chooses. A full reload after saving lets
 * the proxy issue a CSP that allows the analytics hosts (only when analytics was accepted).
 */
export function CookieConsent({ hasChoice }: { hasChoice: boolean }) {
  const [visible, setVisible] = useState(!hasChoice)
  const [custom, setCustom] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [pending, start] = useTransition()

  if (!visible) return null

  const save = (c: { analytics: boolean; marketing: boolean }) =>
    start(async () => {
      await saveConsentAction(c)
      setVisible(false)
      if (c.analytics) window.location.reload()
    })

  return (
    <section className="s-consent" aria-labelledby="consent-title" data-testid="cookie-consent">
      <div className="h-container s-consent__inner">
        <div>
          <h2 id="consent-title" className="s-consent__title">
            Cookies at Haanta
          </h2>
          <p className="s-small">
            We use essential cookies to run the shop (your bag and sign-in). With your permission we
            also use analytics to improve Haanta and marketing cookies to show relevant offers. We
            never sell your data.
          </p>
          {custom ? (
            <fieldset className="s-consent__options">
              <legend className="h-sr-only">Optional cookies</legend>
              <label className="s-check">
                <input type="checkbox" checked disabled /> Essential (always on)
              </label>
              <label className="s-check">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  data-testid="consent-analytics"
                />{" "}
                Analytics
              </label>
              <label className="s-check">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  data-testid="consent-marketing"
                />{" "}
                Marketing
              </label>
            </fieldset>
          ) : null}
        </div>
        <div className="s-consent__actions">
          {custom ? (
            <button
              type="button"
              className="h-btn h-btn--primary"
              disabled={pending}
              onClick={() => save({ analytics, marketing })}
            >
              Save choices
            </button>
          ) : (
            <>
              <button
                type="button"
                className="h-btn h-btn--primary"
                disabled={pending}
                onClick={() => save({ analytics: true, marketing: true })}
                data-testid="consent-accept"
              >
                Accept all
              </button>
              <button
                type="button"
                className="h-btn h-btn--secondary"
                disabled={pending}
                onClick={() => save({ analytics: false, marketing: false })}
                data-testid="consent-reject"
              >
                Essential only
              </button>
              <button type="button" className="h-btn h-btn--ghost" onClick={() => setCustom(true)}>
                Choose
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
