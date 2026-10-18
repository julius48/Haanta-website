/** Newsletter popup frequency logic (pure, so it is unit tested). */
export interface PopupConfig {
  enabled: boolean
  delaySeconds: number
  frequencyDays: number
  showOnMobile: boolean
}

export const POPUP_STORAGE_KEY = "haanta_popup_last_shown"
export const POPUP_SUBSCRIBED_KEY = "haanta_popup_subscribed"
const DAY_MS = 86_400_000

export function shouldShowPopup(
  cfg: PopupConfig | null | undefined,
  ctx: { now: number; lastShownAt: number | null; isMobile: boolean; subscribed?: boolean },
): boolean {
  if (!cfg || !cfg.enabled) return false
  if (ctx.subscribed) return false
  if (ctx.isMobile && !cfg.showOnMobile) return false
  if (ctx.lastShownAt == null || !Number.isFinite(ctx.lastShownAt)) return true
  const days = Math.max(0, cfg.frequencyDays)
  return ctx.now - ctx.lastShownAt >= days * DAY_MS
}

export function popupDelayMs(cfg: PopupConfig): number {
  return Math.max(0, Math.min(600, cfg.delaySeconds)) * 1000
}

export function parseStoredTimestamp(v: string | null): number | null {
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}
