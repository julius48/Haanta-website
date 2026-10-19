# Haanta

Curated multi-vendor marketplace for African fashion, replacing the Wix site at www.haanta.com.
Buyers in the US and Canada (Mexico supported); vendors mostly in Nigeria, with some stock in a Houston hub.

| App | What | Local URL |
|---|---|---|
| `apps/storefront` | Buyer storefront (Next.js 16) | http://localhost:3000 |
| `apps/vendor` | Vendor portal (Next.js 16) | http://localhost:3001 |
| `apps/backend` | Medusa v2 backend + admin | http://localhost:9000 (admin: `/app`) |
| `packages/*` | Shared shipping, pricing, core and UI code | – |

More detail: [docs/BUILD_REPORT.md](docs/BUILD_REPORT.md) (status), [docs/decisions.md](docs/decisions.md) (decisions), [docs/api.md](docs/api.md) (API contract).

## Run it locally

### Prerequisites

- Node.js 22.12 or newer
- pnpm 9 (`npm i -g pnpm@9`)
- Postgres: on Windows the repo starts one for you (no Docker needed); elsewhere use `docker compose up -d`

### First-time setup

```bash
pnpm install

# Environment files (placeholders only in the examples; never commit the real ones)
cp apps/backend/.env.example    apps/backend/.env
cp apps/storefront/.env.example apps/storefront/.env.local
cp apps/vendor/.env.example     apps/vendor/.env.local
```

In `apps/backend/.env`, replace every `<random>` value with a long random string (for example `openssl rand -base64 48`).
Leave third-party keys (Stripe, PayPal, UPS, Algolia, Cloudinary, Klaviyo) empty: each service then uses a local mock.

```bash
node scripts/dev-db.mjs start               # local Postgres on port 54329
pnpm --filter @haanta/backend migrate       # create the database tables
pnpm --filter @haanta/backend seed          # demo data; prints the publishable key and admin login
```

Copy the publishable key printed by the seed into `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` in `apps/storefront/.env.local`.

### Every day

Start each in its own terminal, in this order:

```bash
node scripts/dev-db.mjs start                # 1. database
pnpm --dir apps/backend exec medusa develop  # 2. backend (takes ~2 min; ready when it prints "Server is ready on port: 9000")
pnpm --filter @haanta/storefront dev         # 3. storefront
pnpm --filter @haanta/vendor dev             # 4. vendor portal (optional)
```

`http://localhost:9000/` shows a 404 by design; use `/app` for the admin and `/health` to check the backend is up.

### Tests and checks

```bash
pnpm -r --filter "./packages/*" test        # unit tests for the shared packages
npx tsc --noEmit && npx eslint .            # inside any app or package
cd apps/storefront && npx playwright test   # end-to-end (needs storefront + backend running)
```

### Troubleshooting

- **Everything stopped at once:** check free disk space. When the disk fills up, the database and dev servers crash. Restart them in the order above.
- **Storefront shows errors or no products:** the backend is not running yet, or the publishable key in `.env.local` is wrong.

## Deploying

Vercel only hosts the two Next.js apps. The Medusa backend needs a long-running server and a Postgres database (for example Railway + Neon).
Step-by-step guide: [docs/deploy.md](docs/deploy.md). Each Next.js app has a `vercel.json` that builds the shared packages first.

## What to do next

1. **Host the backend.** Create accounts on a Node host (Railway, Render or Fly) and a managed Postgres (Neon or Supabase). Deploy `apps/backend` with the variables from `apps/backend/.env.example`, using new production secrets (never the local ones). Then run `migrate` and `seed` against that database.
2. **Point the backend at the live sites.** Set `STOREFRONT_URL`, `VENDOR_PORTAL_URL`, `STORE_CORS`, `VENDOR_CORS`, `ADMIN_CORS` and `AUTH_CORS` to the Vercel URLs once you have them.
3. **Import the storefront into Vercel.** At vercel.com/new, pick this GitHub repo and set **Root Directory** to `apps/storefront`. Add the environment variables:
   - `MEDUSA_BACKEND_URL` and `NEXT_PUBLIC_MEDUSA_BACKEND_URL`: the hosted backend URL
   - `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`: from the production seed
   - `NEXT_PUBLIC_SITE_URL`: the Vercel URL (later `https://www.haanta.com`)
4. **Import the vendor portal** the same way, as a second Vercel project with Root Directory `apps/vendor` and the variables from `apps/vendor/.env.example`.
5. **Check the preview.** Open the site on desktop and mobile: browse, search, add to cart, and run a checkout against the mock payments.
6. **Add real services one at a time.** Add the real keys one service at a time: Stripe and PayPal (sandbox first), UPS/ShipEngine, Algolia, Cloudinary, Klaviyo, Sentry and Cloudflare Turnstile. Every service without a key keeps running on its mock, so the site works as staging until then.
7. **Go live.** When everything is checked, add `www.haanta.com` as a domain in Vercel and switch DNS away from Wix. The legacy Wix redirects are already handled by the storefront.
