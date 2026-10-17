# Haanta build report

> **Status: IN PROGRESS.** This file is the live checkpoint. It becomes the final report (how to run,
> test results, decisions, gaps, security review, go-live needs) when the build completes.
> Last updated: 2026-10-17.

## Stage status

| Stage | Status | Notes |
|---|---|---|
| 1. Foundations | Partly done | Monorepo, shared config, tokens, local Postgres, Medusa + both Next apps running, auth/roles/MFA on the API. **Missing:** CI workflows, docker-compose file, README, admin MFA screen. |
| 2. Shipping + pricing engines | Done | 70 shipping tests, 16 pricing tests; wired into Medusa (fulfilment provider + server-side pricing). |
| 3. Catalog migration | Not started | Mapping rules exist and are tested (`packages/core/src/catalog/mapping.ts`); import script, dry run, review CSV and redirect map not yet written. |
| 4. Storefront | Not started (scaffold only) | Agent stopped at the usage limit after writing helper files in `apps/storefront/lib`. |
| 5. Vendor portal + review queue | API done, UI not started | Vendor API and admin review-queue API done; portal pages not built (helpers only in `apps/vendor/lib`). |
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

## Next steps (in order)

1. Upload signing integration test.
2. Storefront and vendor portal pages (resume the two agents).
3. Admin extensions (dashboard, review queue, payouts, settings, audit, MFA screen).
4. Catalog migration with dry run, review CSV and redirect map.
5. CI (GitHub Actions + gitleaks, audit, CodeQL, Dependabot), docker-compose, README.
6. Launch readiness: Lighthouse/axe budgets, security review, checkout load test, backup/restore, runbook, cutover plan.
