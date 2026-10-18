# Haanta build report

> **Status: IN PROGRESS.** This file is the live checkpoint. It becomes the final report (how to run,
> test results, decisions, gaps, security review, go-live needs) when the build completes.
> Last updated: 2026-10-18.

## Stage status

| Stage | Status | Notes |
|---|---|---|
| 1. Foundations | Partly done | Monorepo, shared config, tokens, local Postgres, Medusa + both Next apps running, auth/roles/MFA on the API. **Missing:** CI workflows, docker-compose file, README, admin MFA screen. |
| 2. Shipping + pricing engines | Done | 70 shipping tests, 16 pricing tests; wired into Medusa (fulfilment provider + server-side pricing). |
| 3. Catalog migration | Done (code) | Transform tested on the real export: 1,280/1,370 products mapped, 90 without any brand reported; per-vendor markups derived from Wix price/cost; dry run writes review CSV + redirect map; idempotent import. |
| 4. Storefront | Redesign done; polishing | Onuli/ASOS-style redesign on the real catalog (1,052 live products). Size guide and optional custom sizing on every product; sold-out options disabled. 18/18 Playwright e2e (desktop + mobile, axe checks included). Lighthouse (local, mobile): accessibility, best practices and SEO 100 on home, listing and product; performance 80–85 when the machine is quiet (see below). |
| 5. Vendor portal + review queue | Portal done; admin queue UI pending | Vendor portal built (22 routes, 29 unit tests, axe scans clean); review-queue API done and tested. |
| 6. Ledger, payouts, admin dashboard | API done, UI not started | Ledger/payout/reconciliation/dashboard APIs done; Medusa admin extensions not built. |
| 7. Launch readiness | Not started | |

## Test results (last runs)

| Suite | Result |
|---|---|
| `packages/shipping` (Vitest) | 70/70 pass |
| `packages/pricing` (Vitest) | 16/16 pass |
| `packages/core` (Vitest) | 73/73 pass |
| `packages/ui` (Vitest) | 20/20 pass |
| Backend integration (all four suites together) | 15/15 pass |
| Backend `checkout.spec.ts` (integration) | 3/3 pass |
| Backend `vendor-isolation.spec.ts` (integration) | 2/2 pass (every vendor endpoint refuses other vendors' ids; no buyer PII in vendor responses or emails) |
| Backend `auth-security.spec.ts` (integration) | 7/7 pass (password policy + breach check, Turnstile, lockout, staff sub-roles + MFA, CSRF with a real session cookie, webhook signatures + replay, append-only audit at DB level, rate limits) |
| Backend `money-flows.spec.ts` (integration) | 3/3 pass (review queue + live edits stay live until approved; finance markup → reprice → review + audit; delivery → payable → payout → PDF/CSV statement; full refund, partial return after payout, double-refund blocked, reconciliation) |
| Backend unit (`TEST_TYPE=unit`) | 5/5 pass (rate-limit scale never applies in production or tests) |
| Storefront (Vitest) | 26/26 pass |
| Storefront e2e (Playwright, Edge) | 18/18 pass: browse/filter (desktop + mobile), quick view, search, 7 checkout routes incl. declined card, made-to-order measurements, account, tracking, axe on home/listing/product/cart/checkout/cookie banner |
| Lint / typecheck | Clean: packages, backend, storefront, vendor portal |

## Security findings so far

| Finding | Fix |
|---|---|
| Client-supplied line-item metadata reached the cart because Medusa validates before custom middleware | Guard now cleans `validatedBody` too; covered by a test |
| Path-based guards (MFA allow-list, staff role table) compared mount-relative `req.path` | All guards use `fullPath(req)`; found by the MFA test |
| Refund could move money before the ledger rejected an over-refund | Remaining quantity checked before refunding |
| PII guard blocked vendor order views: the hub address's `address_1`/`phone` keys matched the buyer-PII key list (false positive; no buyer data present) | Key checks skip `ship_to` (Haanta's hub, from settings); buyer values are still checked everywhere |
| Mock payment route silently treated unknown test cards (e.g. `pm_card_chargeDeclined`) as Visa, so the declined path was never exercised (local mock only; the route is 404 in production and with real keys) | Unknown methods now return 400 and the mock throws; the e2e test asserts a real decline |
| Search index rebuild blocked the event loop for ~19 s (all requests stalled, e.g. 18.9 s cart creation) | Paged queries, flat stock lookup and maps: ~10 s cold build in the background, ~1 s longest stall; event-driven refresh |

## Storefront fixes found by the e2e and Lighthouse runs (2026-10-18)

- Mobile filter drawer never opened (CSS expected `data-open`, component set a class).
- Size/colour radios sat on top of their labels (fixed: label takes the click).
- Failed sign-in/registration wiped the form; non-secret fields are now kept.
- Logo link name did not match its visible text (WCAG 2.5.3); duties note was invalid inside the cart `<dl>`; pagination targets were 8 px; gallery thumbnails were stretched; no favicon (404 on every page).
- Mega-menu editorial cards collapsed to zero size; Medusa's raw "inventory" error was shown to shoppers.

## Lighthouse (mobile, local production build)

Measured with Lighthouse 13 locally (pagespeed.web.dev cannot reach localhost); median of three runs.

| Page | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Home | 81 (quiet machine) / 69 (busy) | 100 | 100 | 100 |
| Women listing | 83–85 / 70 | 100 | 100 | 100 |
| Product | 81–82 / 77 | 100 | 100 | 100 |
| FAQ | 95 | 100 | 100 | 100 |
| Cart | 96 | 100 | 100 | 66 (intentionally `noindex`) |

Performance varies with other load on the dev machine (dev servers, other apps), mostly through Total Blocking Time. Remaining main-thread cost is React hydration (~1 s at 4x CPU slowdown). **Confirm with pagespeed.web.dev on staging.** Further options if staging scores fall short: shorter image URLs via a custom loader (srcsets are ~40% of the HTML and RSC payload), fewer product cards on the home page, and a CDN in front of `/_next/image` (cold Wix fetches can take 3 s).

## Next steps (in order, per owner priority on 2026-10-18)

1. **Storefront:** owner review of the redesign; confirm the standard size chart figures (decision F1); run pagespeed.web.dev once staging exists.
2. **Then Medusa backend work**: done: full integration run, search indexing and jobs. Remaining: upload-signing integration test.
3. **Then the admin pages** (Medusa admin extensions: dashboard, review queue, payouts, settings, audit, MFA screen).
4. CI (GitHub Actions + gitleaks, audit, CodeQL, Dependabot), docker-compose, README.
5. Launch readiness: Lighthouse/axe budgets, security review, checkout load test, backup/restore, runbook, cutover plan.
