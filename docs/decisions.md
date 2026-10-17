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
