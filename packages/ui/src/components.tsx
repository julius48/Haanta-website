import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react"

/** Shared, unstyled-by-default components. Styling comes from classes in base.css that use token variables. */

export type ProductBadgeKind = "new" | "preorder" | "made_to_order" | "sale"

const BADGE_LABEL: Record<ProductBadgeKind, string> = {
  new: "New",
  preorder: "Pre-order",
  made_to_order: "Made to order",
  sale: "Sale",
}

export function Badge({ kind }: { kind: ProductBadgeKind }) {
  return <span className={`h-badge h-badge--${kind.replace(/_/g, "-")}`}>{BADGE_LABEL[kind]}</span>
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return <button {...props} className={`h-btn h-btn--${variant} ${className}`.trim()} />
}

export function Container({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`h-container ${className}`.trim()} />
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="h-sr-only">{children}</span>
}

/** The Haanta wordmark "Hààńtà". The logo letterforms must not be altered (brand guide 2.1). */
export function Wordmark({ tone = "brown" }: { tone?: "brown" | "tan" }) {
  return (
    <span className={`h-wordmark h-wordmark--${tone}`} aria-label="Haanta">
      Hààńtà
    </span>
  )
}

export function formatMoney(amountMinor: number, currency: string, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2 }).format(
    amountMinor / 100,
  )
}

export function Price({ amountMinor, currency, compareAtMinor }: { amountMinor: number; currency: string; compareAtMinor?: number | null }) {
  const onSale = compareAtMinor != null && compareAtMinor > amountMinor
  return (
    <span className="h-price">
      {onSale ? (
        <>
          <span className="h-price__sale">{formatMoney(amountMinor, currency)}</span>{" "}
          <s className="h-price__was">
            <VisuallyHidden>Was </VisuallyHidden>
            {formatMoney(compareAtMinor, currency)}
          </s>
        </>
      ) : (
        formatMoney(amountMinor, currency)
      )}
    </span>
  )
}
