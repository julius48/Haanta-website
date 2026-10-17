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
| Backend `vendor-isolation.spec.ts` (integration) | 1/2 pass. **The cross-vendor test fails at line 98 (not yet diagnosed).** |
| Lint / typecheck | Clean for packages, backend and both apps at last commit |

## Security findings so far

| Finding | Fix |
|---|---|
| Client-supplied line-item metadata reached the cart because Medusa validates before custom middleware | Guard now cleans `validatedBody` too; covered by a test |
| Path-based guards (MFA allow-list, staff role table) compared mount-relative `req.path` | All guards use `fullPath(req)`; found by the MFA test |
| Refund could move money before the ledger rejected an over-refund | Remaining quantity checked before refunding |

## Next steps (in order)

1. Diagnose the failing cross-vendor isolation test.
2. Remaining backend security suites: roles/MFA, auth hardening (password, Turnstile, lockout), CSRF, webhooks, ledger/payout flows, review flow, uploads.
3. Storefront and vendor portal pages (resume the two agents).
4. Admin extensions (dashboard, review queue, payouts, settings, audit, MFA screen).
5. Catalog migration with dry run, review CSV and redirect map.
6. CI (GitHub Actions + gitleaks, audit, CodeQL, Dependabot), docker-compose, README.
7. Launch readiness: Lighthouse/axe budgets, security review, checkout load test, backup/restore, runbook, cutover plan.
