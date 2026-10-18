"use client"

import { useEffect, useId, useRef } from "react"

/**
 * Accessible modal built on the native <dialog> element: showModal() makes the rest of the page
 * inert (focus stays inside), Escape closes it, focus returns to the opener, and clicking the
 * backdrop closes it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  size = "md",
  testId,
  description,
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  children: React.ReactNode
  size?: "sm" | "md" | "lg"
  testId?: string
  description?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      d.showModal()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`s-dialog s-dialog--${size}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      data-testid={testId}
      onClose={() => {
        onClose()
        opener.current?.focus()
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close()
      }}
    >
      <div className="s-dialog__inner">
        <div className="s-dialog__header">
          <h2 id={titleId} className="s-dialog__title">
            {title}
          </h2>
          <button type="button" className="s-icon-btn" onClick={() => ref.current?.close()} aria-label="Close" data-testid={testId ? `${testId}-close` : undefined}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" focusable="false">
              <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          </button>
        </div>
        {description ? (
          <p id={descId} className="h-sr-only">
            {description}
          </p>
        ) : null}
        <div className="s-dialog__body">{open ? children : null}</div>
      </div>
    </dialog>
  )
}
