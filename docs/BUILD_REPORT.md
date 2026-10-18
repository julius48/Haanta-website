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
| 4. Storefront | In progress (redesign) | First pass built by a subagent works end to end but looks generic; being redesigned. |
| 5. Vendor portal + review queue | Portal done; admin queue UI pending | Vendor portal built (22 routes, 29 unit tests, axe scans clean); review-queue API done and tested. |
| 6. Ledger, payouts, admin dashboard | API done, UI not started | Ledger/payout/reconciliation/dashboard APIs done; Medusa admin extensions not built. |
| 7. Launch readiness | Not started | |

## Test results (last runs)

| Suite | Result |
|---|---|
| `packages/shipping` (Vitest) | 70/70 pass |
| `packages/pricing` (Vitest) | 16/16 pass |
| `packages/core` (Vitest) | 62/62 pass |
| `packages/ui` (Vitest) | 20/20 pass |
| Backend `checkout.spec.ts` (integration) | 3/3 pass |
| Backend `vendor-isolation.spec.ts` (integration) | 2/2 pass (every vendor endpoint refuses other vendors' ids; no buyer PII in vendor responses or emails) |
| Backend `auth-security.spec.ts` (integration) | 7/7 pass (password policy + breach check, Turnstile, lockout, staff sub-roles + MFA, CSRF with a real session cookie, webhook signatures + replay, append-only audit at DB level, rate limits) |
| Backend `money-flows.spec.ts` (integration) | 3/3 pass (review queue + live edits stay live until approved; finance markup → reprice → review + audit; delivery → payable → payout → PDF/CSV statement; full refund, partial return after payout, double-refund blocked, reconciliation) |
| Lint / typecheck | Clean for packages and backend (153 backend files, 0 lint errors); apps clean at scaffold commit |

## Security findings so far

| Finding | Fix |
|---|---|
| Client-supplied line-item metadata reached the cart because Medusa validates before custom middleware | Guard now cleans `validatedBody` too; covered by a test |
| Path-based guards (MFA allow-list, staff role table) compared mount-relative `req.path` | All guards use `fullPath(req)`; found by the MFA test |
| Refund could move money before the ledger rejected an over-refund | Remaining quantity checked before refunding |
| PII guard blocked vendor order views: the hub address's `address_1`/`phone` keys matched the buyer-PII key list (false positive; no buyer data present) | Key checks skip `ship_to` (Haanta's hub, from settings); buyer values are still checked everywhere |

## Next steps (in order, per owner priority on 2026-10-18)

1. **Storefront first**, redesigned to a premium editorial standard (owner feedback: the first version looked generic). Owned directly, not delegated. Import the real catalog locally so pages show real products and photos.
2. **Then Medusa backend work**: password-reset emails done; remaining: upload signing test, full integration run, search indexing, jobs.
3. **Then the admin pages** (Medusa admin extensions: dashboard, review queue, payouts, settings, audit, MFA screen).
4. CI (GitHub Actions + gitleaks, audit, CodeQL, Dependabot), docker-compose, README.
5. Launch readiness: Lighthouse/axe budgets, security review, checkout load test, backup/restore, runbook, cutover plan.
