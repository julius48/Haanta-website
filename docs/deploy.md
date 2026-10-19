# Deploying Haanta (staging)

Three pieces, three hosts:

| Piece | Host | Why |
|---|---|---|
| Database | **Neon** (managed Postgres) | Valid TLS certificates (the backend verifies them in production) |
| Backend + admin (`apps/backend`) | **Railway** | Medusa is a long-running server; Vercel can't run it |
| Storefront + vendor portal | **Vercel** (two projects) | Next.js |

Do them in this order: the frontends need the backend URL, and the backend needs the frontend URLs for CORS.

---

## 1. Database: Neon

1. Sign up at neon.tech → **New project**: name `haanta`, Postgres 17, region **AWS US East** (close to US buyers and to Railway's US East region).
2. On the dashboard, click **Connect**, turn **off** "Connection pooling", and copy the connection string. It looks like
   `postgresql://user:password@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`.
   This is `DATABASE_URL`. Treat it as a password.

## 2. Secrets

Generate fresh values (never reuse the local ones). Run each line once and keep the output somewhere safe (a password manager):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # COOKIE_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # MFA_ENCRYPTION_KEY (exactly 32 bytes)
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # MFA_RECOVERY_PEPPER
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # UPLOAD_SIGNING_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # STRIPE_WEBHOOK_SECRET / PAYPAL_MOCK_WEBHOOK_SECRET
```

`MFA_ENCRYPTION_KEY` encrypts staff 2FA secrets: if it changes later, everyone has to re-enrol 2FA.

## 3. Backend: Railway

1. Sign up at railway.com with GitHub → **New project → Deploy from GitHub repo** → pick the Haanta repo.
   Allow Railway access to the repo if asked. The first deploy will fail until the settings below are in; that's expected.
2. Open the service → **Settings**:
   - **Root directory**: leave empty (the backend uses the shared packages, so it builds from the repo root)
   - **Region**: US East
   - **Build command**: `pnpm install --frozen-lockfile --prod=false && pnpm turbo run build --filter=@haanta/backend`
   - **Pre-deploy command**: `pnpm --filter @haanta/backend migrate:prod`
   - **Start command**: `pnpm --filter @haanta/backend start:prod`
   - **Healthcheck path**: `/health`
   - **Networking → Generate domain**. You get something like `haanta-backend-production.up.railway.app`. This is the **backend URL**.
3. **Variables** tab → **Raw editor**, paste and fill in. Use placeholder Vercel URLs for now (you'll fix them in step 6):

```env
NODE_ENV=production
APP_ENV=staging
MEDUSA_DISABLE_TELEMETRY=true
MEDUSA_WORKER_MODE=shared
DATABASE_URL=<Neon connection string>
MEDUSA_BACKEND_URL=https://<backend URL>
STOREFRONT_URL=https://<storefront>.vercel.app
VENDOR_PORTAL_URL=https://<vendor>.vercel.app
ADMIN_URL=https://<backend URL>/app
STORE_CORS=https://<storefront>.vercel.app
VENDOR_CORS=https://<vendor>.vercel.app
ADMIN_CORS=https://<backend URL>
AUTH_CORS=https://<storefront>.vercel.app,https://<vendor>.vercel.app,https://<backend URL>
JWT_SECRET=<generated>
COOKIE_SECRET=<generated>
MFA_ENCRYPTION_KEY=<generated>
MFA_RECOVERY_PEPPER=<generated>
UPLOAD_SIGNING_SECRET=<generated>
STRIPE_WEBHOOK_SECRET=<generated>
PAYPAL_MOCK_WEBHOOK_SECRET=<generated>
PAYPAL_ENV=sandbox
FX_PROVIDER=fixed
HAANTA_OPS_EMAIL=<your ops inbox>
SEED_ADMIN_EMAIL=<your real email>
SEED_ADMIN_PASSWORD=<long unique password>
```

4. Click **Deploy**. The build takes several minutes. It's done when the deploy is green and `https://<backend URL>/health` returns `OK`.
5. **Load the data** (once). Ask Claude to run the seed and catalog import against the Neon database, or do it yourself
   from the repo on your machine with `DATABASE_URL` and the variables above set in your shell:
   `pnpm --filter @haanta/backend seed` then `pnpm --filter @haanta/backend import:catalog`.
   The seed prints the **publishable key** (`pk_…`): you need it for the storefront.
6. Log in at `https://<backend URL>/app` with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and set up 2FA.

## 4. Storefront: Vercel

1. vercel.com → **Add New → Project** → import the GitHub repo.
2. **Root Directory**: `apps/storefront` (click Edit). Framework is detected; build commands come from `apps/storefront/vercel.json`, so leave the overrides off.
3. **Environment Variables**:

```env
MEDUSA_BACKEND_URL=https://<backend URL>
NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://<backend URL>
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<pk_… from the seed>
NEXT_PUBLIC_SITE_URL=https://<storefront>.vercel.app
```

4. **Deploy**. Note the URL Vercel gives you (for example `haanta-storefront.vercel.app`).

`NEXT_PUBLIC_*` values are baked in at build time: after changing one, redeploy (Deployments → ⋯ → Redeploy).

## 5. Vendor portal: Vercel

Same as step 4, as a **second project** from the same repo:

- **Root Directory**: `apps/vendor`
- Variables:

```env
MEDUSA_BACKEND_URL=https://<backend URL>
NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://<backend URL>
NEXT_PUBLIC_VENDOR_URL=https://<vendor>.vercel.app
NEXT_PUBLIC_STOREFRONT_URL=https://<storefront>.vercel.app
```

## 6. Connect them

Back in Railway → Variables, replace the placeholder `<storefront>` / `<vendor>` URLs with the real Vercel URLs
(`STOREFRONT_URL`, `VENDOR_PORTAL_URL`, `STORE_CORS`, `VENDOR_CORS`, `AUTH_CORS`). Railway redeploys automatically.
Also set `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_VENDOR_URL` in Vercel if they changed, and redeploy there.

## 7. Check it

- Storefront: home page shows products; search, product page, add to cart, checkout page loads (desktop and mobile).
- Vendor portal: sign-up / login page loads.
- Admin: `/app` login works.

## Known limits of this staging setup

- **Checkout can't complete without payment keys.** In production mode the mock payment route is switched off.
  Add Stripe **test** keys (`STRIPE_API_KEY=sk_test_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`) and PayPal sandbox keys to test checkout end to end.
- **Uploaded images need Cloudinary.** Without Cloudinary keys, uploads are saved on the Railway server's disk and are lost on every redeploy.
  Add the `CLOUDINARY_*` variables before vendors upload anything.
- **No Redis.** The backend falls back to in-memory events and cache, which is fine for one staging server. Add Railway's Redis and set `REDIS_URL` before going live.
- Shipping, search, email and monitoring use their mocks until their keys are added (UPS/ShipEngine, Algolia, Klaviyo, Sentry, Turnstile).

## Going live (later)

Add `www.haanta.com` in the storefront's Vercel project (Settings → Domains), a subdomain such as `vendors.haanta.com` for the portal and `admin.haanta.com` in Railway,
update every URL and CORS variable to match, then switch DNS away from Wix.
