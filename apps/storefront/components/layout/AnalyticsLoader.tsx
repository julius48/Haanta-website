"use client"

import { useEffect } from "react"
import { loadAnalytics } from "@/lib/analytics"

/** Loads GA4 / PostHog only after analytics consent and only when keys are configured. */
export function AnalyticsLoader({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (enabled) loadAnalytics()
  }, [enabled])
  return null
}
