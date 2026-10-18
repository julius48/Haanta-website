# Decisions

Business and technical decisions made where the brief was silent or the inputs disagreed. Each one is a setting where possible.

## Inputs

| # | Decision | Why |
|---|----------|-----|
| D1 | `docs/` inputs were copied from `~/Downloads`: `Haanta brand guide External.pdf` → `brand-guide.pdf`, `Haanta Website Needs PRD.xlsx` → `prd.xlsx`, `catalog_products (11).csv` → `catalog-export.csv`, `fez-shipping-rates.js` → `legacy/wix-shipping.js`. | The repo had no `docs/` folder. The CSV is the only export downloaded on the day of the build with exactly 1,370 products / 11,680 variants. |
| D2 | The UPS shipper number in the legacy file is redacted; it is read from the `UPS_SHIPPER_NUMBER` secret. | Brief: credentials and the shipper number come from secrets, never code. |

## Shipping (packages/shipping)

The legacy Wix file differs from the brief in places. The engine ports the **file's behaviour** as the default and puts the brief's items behind settings.

| # | Decision |
|---|----------|
| S1 | UPS packages use **2 kg per unit** (`upsAssumedKgPerUnit = 2`), as in the code (`qty × 2 × 2.20462`, rounded up to whole lbs). The brief said 1.5 kg. Gap fix `upsUseRealWeight` uses variant weights. |
| S2 | The $150 free-shipping threshold applies to the **whole cart subtotal** (`freeShippingBasis = "cart_total"`), as in the code, including Nigeria-only carts. `us_origin_only` is available. The PRD mentions $250; `freeShippingThresholdUsd` is a setting (default 150). |
| S3 | The legacy file has **no Lozenge Flex tiers, per-kg rate or drop-off fee**. `lozengeFlexTiers` defaults to empty and `perKgAboveMaxNgn` to ₦32,216.59 (the 9→10 kg FEZ increment), used only when `gapFixes.fezPerKgAboveMax` is on. **Haanta ops must supply real Lozenge Flex rates.** |
| S4 | The ₦5,000 drop-off fee (PRD: "Add 5000 naira pick up fee") is a setting (`dropOffFeeNgn = 5000`) that is **off** (`applyDropOffFee = false`) because the legacy code never applied it. |
| S5 | US subdivisions are normalised (`US-AK` → `AK`) before the AK/HI/OR check. The legacy code compared the raw value in one place and stripped the prefix in another; Wix sends ISO 3166-2 codes, so the raw comparison could miss. |
| S6 | When UPS fails, the fallback price is charged even over $150 (legacy behaviour, kept). |
| S7 | An empty cart returns no options. |
| S8 | Gap fixes, all **off** by default: `usOnlyToMexico`, `restOfWorld`, `convertToCheckoutCurrency`, `upsUseRealWeight`, `fezPerKgAboveMax`. International UPS fallback is $60 (`upsFallbackUsd.international`). |

## Pricing (packages/pricing)

| # | Decision |
|---|----------|
| P1 | Global default markup **35%**, fixed **$0** (setting `globalMarkup`). |
| P2 | Rounding default **whole dollars, half up** (setting `rounding`: `whole`, `whole_up`, `x99`, `cents`). |
| P3 | Retail is never below the vendor price: if rounding would go below, it rounds up instead. |
| P4 | Money is integer minor units; markup percent is basis points. CAD retail is converted from USD retail and rounded with the same rule. |

## Design

| # | Decision |
|---|----------|
| U1 | Avenir fallback: **Figtree** (free, Google Fonts). Swap in `packages/ui/src/tokens.ts` (`fonts.sans`). |
| U2 | Grid unit 8 px; page margins two units (16 px mobile, 32 px desktop). |
| U3 | Tan text is only allowed on brown or the gradient (fails AA on white). Approved pairs are tested in `packages/ui`. |
| U4 | Added neutrals derived from the palette (cream, sand, ink, muted) for surfaces and body text; all pass AA. |

## Storefront and search (2026-10-18)

| # | Decision |
|---|----------|
| F1 | **Size guide on every product.** The designer's chart is shown first when they have one; the Haanta standard women's/men's chart (US/UK sizes, body measurements in inches) and how-to-measure follow. The standard figures are industry ranges and **should be confirmed by Haanta** (`apps/storefront/lib/size-chart.ts`). |
| F2 | **Optional custom sizing on every product.** Any measurement the shopper fills in is range-checked (client and server) and stored on the line item like made-to-order measurements; vendors already see these on their orders. Blank means the standard size. Made-to-order products still require their listed measurements. |
| F3 | Sold-out variants are disabled on the product page and quick view; only an in-stock yes/no reaches the browser (exact stock stays on the server). Product JSON-LD availability follows real stock. |
| F4 | Product cards and the desktop mega menu are server-rendered HTML with one small page-level controller each (`CardActions`, `MegaMenuController`) instead of a React island per card/panel. Images are plain server `<img>` built with `getImageProps` (same srcset as next/image, nothing to hydrate); card hover images use a single 640px source. |
| F5 | Legacy Wix URLs (1,463 `/product-page/*` 301s) are served from a Map in `proxy.ts`, not `next.config` redirects (those are regex-matched on every request). |
| F6 | **Search index:** built from the database in pages of 200 products with stock from two flat queries (cold build ~10 s, was 34 s; longest event-loop stall ~1 s, was ~19 s). Product and order events trigger a debounced rebuild; a job every 15 minutes is the backstop; Algolia is pushed the same documents when configured. |
| F7 | **Demo/e2e fixtures:** seeded vendors with slugs ending `-demo` stay buyable by direct URL but are excluded from search, listings and the designers list. `src/scripts/e2e-fixtures.ts` publishes them and resets their stock to 100 before e2e runs (refuses to run in production). |
| F8 | `RATE_LIMIT_SCALE` multiplies rate limits for local e2e runs only; it is ignored in production and under the test runner (integration tests assert the real limits). |
