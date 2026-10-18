import Link from "next/link"
import { FilterDrawer } from "./FilterDrawer"
import { SortSelect } from "./SortSelect"
import { ProductGrid } from "@/components/product/ProductCard"
import { categoryLabel } from "@/lib/categories"
import { buildFilterHref, FULFILMENT_LABEL, hasActiveFilters, MULTI_KEYS, SHIPS_FROM_LABEL, toPageParams, type ListingContext, type ListingFilters, type MultiKey } from "@/lib/filters"
import type { BrandSummary, FacetValue, SearchResult } from "@/lib/types"

const FACET_TITLE: Record<MultiKey, string> = { brand: "Designer", style: "Style", region: "Region", size: "Size", color: "Colour" }

interface Props {
  title: string
  intro?: React.ReactNode
  hero?: React.ReactNode
  filters: ListingFilters
  ctx: ListingContext
  result: SearchResult & { error?: boolean }
  currency: string
  savedIds: string[]
  brands: BrandSummary[]
  /** Hide the category facet (e.g. on a category page we show subcategories instead). */
  categoryFacet?: boolean
  breadcrumbs?: React.ReactNode
}

function facetLabel(key: MultiKey, value: string, brands: BrandSummary[]): string {
  if (key === "brand") return brands.find((b) => b.slug === value)?.name ?? value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function Listing({ title, intro, hero, filters, ctx, result, currency, savedIds, brands, categoryFacet = true, breadcrumbs }: Props) {
  const action = ctx.categoryMode === "path" ? (filters.category ? `/shop/${filters.category}` : "/shop") : ctx.basePath
  const activeCount = MULTI_KEYS.reduce((n, k) => n + filters[k].length, 0) + (filters.ships_from ? 1 : 0) + (filters.fulfilment ? 1 : 0) + (filters.price_min !== undefined || filters.price_max !== undefined ? 1 : 0) + (filters.on_sale ? 1 : 0)
  const sortHidden = [...toPageParams({ ...filters, sort: "relevance", page: 1 }, ctx.categoryMode === "param").entries()]
  const facets = result.facets
  const formKey = `${action}?${toPageParams(filters, true).toString()}`
  const categoryValues = (facets.category ?? []).filter((c) => (filters.category ? c.value.startsWith(`${filters.category}/`) : !c.value.includes("/")))

  const chips: { label: string; href: string }[] = []
  for (const k of MULTI_KEYS) for (const v of filters[k]) chips.push({ label: `${FACET_TITLE[k]}: ${facetLabel(k, v, brands)}`, href: buildFilterHref(ctx, filters, { toggle: k, value: v }) })
  if (filters.ships_from) chips.push({ label: SHIPS_FROM_LABEL[filters.ships_from], href: buildFilterHref(ctx, filters, { set: { ships_from: undefined } }) })
  if (filters.fulfilment) chips.push({ label: FULFILMENT_LABEL[filters.fulfilment], href: buildFilterHref(ctx, filters, { set: { fulfilment: undefined } }) })
  if (filters.price_min !== undefined || filters.price_max !== undefined)
    chips.push({ label: `Price: ${filters.price_min ?? 0} to ${filters.price_max ?? "any"}`, href: buildFilterHref(ctx, filters, { set: { price_min: undefined, price_max: undefined } }) })
  if (filters.on_sale) chips.push({ label: "On sale", href: buildFilterHref(ctx, filters, { set: { on_sale: undefined } }) })
  if (ctx.categoryMode === "param" && filters.category) chips.push({ label: categoryLabel(filters.category), href: buildFilterHref(ctx, filters, { set: { category: undefined } }) })

  return (
    <main id="main" className="s-listing">
      {hero}
      <div className="h-container">
        {breadcrumbs}
        <div className="s-listing__head">
          <h1 className="s-listing__title">{title}</h1>
          {intro ? <div className="s-listing__intro">{intro}</div> : null}
          {categoryFacet && categoryValues.length > 1 ? (
            <ul className="s-subcats" aria-label="Refine by category">
              {categoryValues.slice(0, 12).map((c) => (
                <li key={c.value}>
                  <Link href={buildFilterHref(ctx, filters, { set: { category: c.value } })} className="s-subcat">
                    {categoryLabel(c.value).split(": ").pop()}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="s-listing__layout">
          <FilterDrawer activeCount={activeCount}>
            <form key={formKey} action={action} method="get" className="s-filter-form" data-testid="filter-form">
              {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
              {filters.sort !== "relevance" ? <input type="hidden" name="sort" value={filters.sort} /> : null}
              {ctx.categoryMode === "param" && filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
              <div className="s-filter-form__scroll">
                {categoryFacet && categoryValues.length ? (
                  <details open className="s-facet">
                    <summary>Category</summary>
                    <ul className="s-facet__links">
                      {categoryValues.map((c) => (
                        <li key={c.value}>
                          <Link href={buildFilterHref(ctx, filters, { set: { category: c.value } })}>
                            {categoryLabel(c.value).split(": ").pop()} <span className="s-muted">({c.count})</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                <RadioFacet
                  title="Ships from"
                  name="ships_from"
                  value={filters.ships_from}
                  values={(facets.ships_from ?? []).map((f) => ({ ...f, label: SHIPS_FROM_LABEL[f.value as "lagos" | "houston"] ?? f.value }))}
                  testId="facet-ships-from"
                />
                <RadioFacet
                  title="Availability"
                  name="fulfilment"
                  value={filters.fulfilment}
                  values={(facets.fulfilment ?? []).map((f) => ({ ...f, label: FULFILMENT_LABEL[f.value as "ready_to_wear"] ?? f.value }))}
                  testId="facet-fulfilment"
                />

                {MULTI_KEYS.map((k) => (
                  <CheckboxFacet key={k} name={k} title={FACET_TITLE[k]} selected={filters[k]} values={facets[k] ?? []} label={(v) => facetLabel(k, v, brands)} swatch={k === "color"} />
                ))}

                <details open className="s-facet">
                  <summary>Price ({currency.toUpperCase()})</summary>
                  <fieldset className="s-facet__price">
                    <legend className="h-sr-only">Price range in {currency.toUpperCase()}</legend>
                    <div className="s-field">
                      <label htmlFor="price-min" className="s-label">
                        Min
                      </label>
                      <input id="price-min" name="price_min" type="number" inputMode="numeric" min={0} className="s-input" defaultValue={filters.price_min} placeholder={String(result.price_range.min || 0)} />
                    </div>
                    <div className="s-field">
                      <label htmlFor="price-max" className="s-label">
                        Max
                      </label>
                      <input id="price-max" name="price_max" type="number" inputMode="numeric" min={0} className="s-input" defaultValue={filters.price_max} placeholder={String(result.price_range.max || "")} />
                    </div>
                  </fieldset>
                  <label className="s-check">
                    <input type="checkbox" name="on_sale" value="1" defaultChecked={!!filters.on_sale} /> On sale only
                  </label>
                </details>
              </div>
              <div className="s-filter-form__apply">
                <button type="submit" className="h-btn h-btn--primary" data-testid="filters-apply">
                  Show results
                </button>
                {hasActiveFilters(filters) ? (
                  <Link href={buildFilterHref(ctx, filters, { clear: true })} className="h-btn h-btn--ghost">
                    Clear all
                  </Link>
                ) : null}
              </div>
            </form>
          </FilterDrawer>

          <div className="s-listing__results">
            <div className="s-listing__toolbar">
              <p className="s-listing__count" role="status" data-testid="result-count">
                {result.total.toLocaleString("en-US")} {result.total === 1 ? "style" : "styles"} found
              </p>
              <SortSelect value={filters.sort} action={action} hidden={sortHidden} />
            </div>
            {chips.length ? (
              <ul className="s-chips" aria-label="Active filters">
                {chips.map((c) => (
                  <li key={c.label}>
                    <Link href={c.href} className="s-chip">
                      {c.label}
                      <span className="h-sr-only"> (remove filter)</span>
                      <span aria-hidden="true"> ×</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}

            {result.error ? (
              <p role="alert" className="s-notice s-notice--error">
                We couldn&apos;t load products right now. Please refresh in a moment.
              </p>
            ) : result.hits.length === 0 ? (
              <div className="s-empty">
                <h2>No matches yet</h2>
                <p>Try removing a filter or searching for something else.</p>
                <Link href="/shop" className="h-btn h-btn--secondary">
                  Shop everything
                </Link>
              </div>
            ) : (
              <ProductGrid docs={result.hits} currency={currency} savedIds={savedIds} label={title} priorityCount={2} />
            )}

            {result.pages > 1 ? <Pagination ctx={ctx} filters={filters} pages={result.pages} /> : null}
          </div>
        </div>
      </div>
    </main>
  )
}

function RadioFacet({ title, name, value, values, testId }: { title: string; name: string; value: string | undefined; values: (FacetValue & { label: string })[]; testId: string }) {
  if (!values.length && !value) return null
  return (
    <details open className="s-facet" data-testid={testId}>
      <summary>{title}</summary>
      <fieldset>
        <legend className="h-sr-only">{title}</legend>
        <label className="s-check">
          <input type="radio" name={name} value="" defaultChecked={!value} /> Any
        </label>
        {values.map((v) => (
          <label key={v.value} className="s-check">
            <input type="radio" name={name} value={v.value} defaultChecked={value === v.value} /> {v.label} <span className="s-muted">({v.count})</span>
          </label>
        ))}
      </fieldset>
    </details>
  )
}

function CheckboxFacet({ name, title, selected, values, label, swatch }: { name: string; title: string; selected: string[]; values: FacetValue[]; label: (v: string) => string; swatch?: boolean }) {
  const all = [...values]
  for (const s of selected) if (!all.some((v) => v.value.toLowerCase() === s.toLowerCase())) all.push({ value: s, count: 0 })
  if (!all.length) return null
  return (
    <details open={selected.length > 0 || all.length <= 8} className="s-facet" data-testid={`facet-${name}`}>
      <summary>
        {title}
        {selected.length ? <span className="s-muted"> ({selected.length} selected)</span> : null}
      </summary>
      <fieldset>
        <legend className="h-sr-only">{title}</legend>
        <ul className="s-facet__list">
          {all.map((v) => (
            <li key={v.value}>
              <label className="s-check">
                <input type="checkbox" name={name} value={v.value} defaultChecked={selected.some((s) => s.toLowerCase() === v.value.toLowerCase())} />
                {swatch ? <span className="s-swatch" style={{ "--swatch": v.value.toLowerCase() } as React.CSSProperties} aria-hidden="true" /> : null}
                {label(v.value)} <span className="s-muted">({v.count})</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </details>
  )
}

function Pagination({ ctx, filters, pages }: { ctx: ListingContext; filters: ListingFilters; pages: number }) {
  const cur = filters.page
  const nums = [...new Set([1, cur - 1, cur, cur + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
  const href = (page: number) => buildFilterHref(ctx, filters, { set: { page } })
  return (
    <nav aria-label="Pagination" className="s-pagination">
      {cur < pages ? (
        <Link href={href(cur + 1)} className="h-btn h-btn--secondary s-pagination__more" rel="next" data-testid="load-more">
          Next page
        </Link>
      ) : null}
      <ul>
        {cur > 1 ? (
          <li>
            <Link href={href(cur - 1)} rel="prev">
              Previous<span className="h-sr-only"> page</span>
            </Link>
          </li>
        ) : null}
        {nums.map((n) => (
          <li key={n}>
            {n === cur ? (
              <span aria-current="page" className="s-pagination__current">
                <span className="h-sr-only">Page </span>
                {n}
              </span>
            ) : (
              <Link href={href(n)}>
                <span className="h-sr-only">Page </span>
                {n}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
