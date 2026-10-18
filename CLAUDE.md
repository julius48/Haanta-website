# Haanta — working notes for Claude

Curated multi-vendor marketplace for African fashion (replaces the Wix site at www.haanta.com).
Buyers: US and Canada (Mexico supported). Vendors: mostly Nigeria; some stock in a Houston hub.
Status and progress: `docs/BUILD_REPORT.md`. Business/technical decisions: `docs/decisions.md`.
API contract: `docs/api.md`.

## Current priority (owner, 2026-10-18)

Storefront first (premium, editorial UI: Onuli/Adjoaa storytelling + ASOS browsing), then Medusa backend work, then admin pages.

## Storefront design bar

- Editorial luxury, not a template: generous whitespace, full-bleed imagery, Cinzel only for marketing headlines.
- No underlined links outside body copy; single-row header; image-led shops and brand stories.
- Dialogs never block first view (cookie notice is a small card; newsletter popup only after engagement).
- Verify every page visually (desktop and mobile screenshots) before calling it done.

## Layout

| Path | What |
|---|---|
| `apps/backend` | Medusa v2.21 (custom modules, providers, API routes, admin extensions) |
| `apps/storefront` | Next.js 16 buyer storefront (port 3000) |
| `apps/vendor` | Next.js 16 vendor portal (port 3001) |
| `packages/shipping` | Pure shipping engine: port of `docs/legacy/wix-shipping.js` (`quoteShipping`) |
| `packages/pricing` | Markup resolution + rounding (integer minor units, basis points) |
| `packages/core` | Security helpers, ledger logic, catalog mapping, vendor-safe views. `@haanta/core/headers` is the edge-safe entry |
| `packages/ui` | Design tokens (`tokens.ts` → generated `tokens.css`), base CSS, small components |
| `packages/config` | Shared TS / ESLint / Prettier config |
| `scripts/dev-db.mjs` | Local Postgres without Docker (Windows) |

## Commands

```bash
pnpm install                      # pnpm 9, node-linker=hoisted (Medusa needs it)
node scripts/dev-db.mjs start     # local Postgres on 127.0.0.1/::1:54329 (Windows); elsewhere: docker compose up -d
pnpm --filter @haanta/backend migrate
pnpm --filter @haanta/backend seed          # prints the publishable key and local admin login
pnpm --dir apps/backend exec medusa develop # backend :9000, admin at /app
pnpm --filter @haanta/storefront dev        # :3000 (needs apps/storefront/.env.local)
pnpm --filter @haanta/vendor dev            # :3001
pnpm -r --filter "./packages/*" test        # Vitest (shipping, pricing, core, ui)
cd apps/backend && npx cross-env TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules npx jest --runInBand --forceExit integration-tests/http/<file>.spec.ts
npx tsc --noEmit && npx eslint .   # in any package/app
```

Rebuild packages after changing them (backend consumes `dist/`): `npx tsup …` per package `build` script.

## Conventions

- TypeScript strict everywhere; no `any` in source.
- Money: integers in minor units (`*_minor`) in Haanta code; Medusa APIs use major units.
- No hard-coded colours in apps (ESLint rule). Use tokens from `@haanta/ui`.
- Every third-party service is an adapter with a local mock (`apps/backend/src/lib/adapters.ts`, `stripe-client.ts`, `paypal-client.ts`, `search.ts`). Tests never call real services.
- Commit after each completed stage; keep lint, typecheck and tests green. Never commit secrets (`.env*` ignored; `.env.example` and `apps/backend/.env.test` hold placeholders only).

## Security rules (every feature ships with these)

- Validate every body/query with zod at the boundary (`apps/backend/src/api/validators.ts`, `.strict()`).
- Vendor routes read the vendor id ONLY from `req.vendorContext` (set by `vendorGuard` from the token). Lookups use `getOwn*` helpers that return 404 for other vendors' ids.
- Vendor payloads go through `toVendorOrderView` (allow-list); `vendorPiiGuard` blocks buyer-PII keys.
- Staff: role table in `apps/backend/src/lib/rbac.ts` (deny by default) + TOTP MFA on every admin route.
- Sanitise rich text with `sanitizeRichText` (allow-list); plain text with `sanitizePlainText`.
- Ledger and audit tables are append-only (DB triggers + service guards). Corrections = reversing entries.
- Prices, shipping and totals are computed on the server only.

## Gotchas learned the hard way

- **Use `fullPath(req)`, never `req.path`, in middleware**: Medusa mounts middleware at the matcher, so `req.path` is relative.
- Medusa loads module models from `models/*.ts` but **skips files named `index.*`**.
- Line item metadata: Medusa validates before custom middleware; clean **both** `req.body` and `req.validatedBody`.
- Order line quantity lives in `items.detail.quantity` (query graph), not `items.quantity`.
- Medusa 2.21 product options are standalone entities linked by `option_ids` (use `upsertProductOptions` in `catalog-ops.ts` on update).
- DML `model.json()` is object-typed; use `model.array()` for string arrays.
- Medusa test runner forces SSL unless `DB_HOST=localhost` (see `apps/backend/.env.test`).
- `sanitize-html` is pinned to 2.17.1 (later versions need ESM-only htmlparser2, which breaks Jest).
- `next/font/google` fails in this monorepo; fonts are self-hosted with `next/font/local` (`app/fonts`, OFL).
- Next 16 uses `proxy.ts` (not `middleware.ts`). Nonce CSP requires dynamic rendering (`await connection()`).
- Next 16 docs ship in `node_modules/next/dist/docs/`; `next dev` writes `AGENTS.md` in each app (commit it).
- Local Postgres has `fsync=off` for speed (dev/test only; never staging/production).
- Disk is tight on the dev machine (~3 GB free): Playwright uses the installed Edge (`channel: "msedge"`), no browser downloads.
