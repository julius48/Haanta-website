# Haanta API reference

Backend: Medusa v2 at `MEDUSA_BACKEND_URL` (local `http://localhost:9000`). All amounts from Medusa's
own APIs are **major units** (e.g. `68` = $68.00). Haanta's `*_minor` fields are **integer minor units**
(e.g. `6800`).

## Conventions

- Store routes (`/store/*`) need the header `x-publishable-api-key: <key>` (printed by the seed).
- Buyer auth: `Authorization: Bearer <jwt>` (customer). Vendor auth: `Authorization: Bearer <jwt>` (vendor).
  Next.js apps keep these tokens in **HttpOnly, Secure, SameSite=Lax** cookies and call the backend
  **server-side only**. Tokens never reach browser JavaScript.
- Sign-up, login and password reset for buyers and vendors need `x-turnstile-token: <token>` (Cloudflare
  Turnstile). Locally any non-empty token passes except the literal `fail`.
- Errors: `{ type, code?, message }` with HTTP 400 (validation), 401, 403 (`code`: `mfa_required`,
  `email_unverified`, `vendor_pending`, `vendor_paused`, `forbidden_role`, `csrf_origin`), 404, 429
  (`Retry-After` header), 500.
- Unknown body fields are rejected (400).

## Auth (Medusa built-in, hardened)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/customer/emailpass/register` | `{ email, password }` | Turnstile; password ≥12 chars, not breached → `{ token }` (registration token) |
| POST | `/store/customers` | `{ email, first_name, last_name, phone? }` with registration token | creates the customer |
| POST | `/auth/customer/emailpass` | `{ email, password }` | Turnstile; lockout after 5 failures → `{ token }` |
| POST | `/auth/customer/emailpass/reset-password` | `{ identifier: email }` | Turnstile; always 201 |
| POST | `/auth/customer/emailpass/update?token=…` | `{ email, password }` | password policy applies |
| POST | `/auth/token/refresh` | — | bearer → new token |
| (same for `vendor`) | `/auth/vendor/emailpass…` | | vendors then call `/vendor/applications` |

## Storefront (Medusa core store API, used as-is)

`GET /store/regions` · `GET /store/products?handle=…&region_id=…&fields=*variants.calculated_price,+variants.inventory_quantity`
· `POST /store/carts {region_id, email?}` · `POST /store/carts/:id/line-items {variant_id, quantity, metadata?: { measurements?: { bust?, waist?, hips?, height?, shoulder?, arm_length?, inseam?, dress_length?: number (inches), notes?: string } }}`
(any other metadata is dropped; made-to-order variants **must** include the product's required measurements → 400 `measurements_required`)
· `POST /store/carts/:id/line-items/:line_id {quantity}` · `DELETE /store/carts/:id/line-items/:line_id`
· `POST /store/carts/:id {email?, shipping_address?, billing_address?, region_id?}` · `POST /store/carts/:id/promotions {promo_codes: [code]}`
· `POST /store/carts/:id/shipping-methods {option_id, data: { quote_code }}` (see quotes below)
· `POST /store/payment-collections {cart_id}` · `POST /store/payment-collections/:id/payment-sessions {provider_id: "pp_stripe_stripe" | "pp_paypal_paypal"}`
(Stripe session `data.client_secret` → Stripe Payment Element; PayPal session `data.id` → PayPal Buttons order id)
· `POST /store/carts/:id/complete` → `{ type: "order", order }` or `{ type: "cart", error }`
· `GET /store/customers/me` · `GET /store/orders` · `GET /store/orders/:id` · `POST /store/customers/me/addresses` …

Regions: United States (USD), Canada (CAD), Mexico (USD).

## Storefront (Haanta)

| Method | Path | Response / notes |
|---|---|---|
| POST | `/store/carts/:id/shipping-quotes` | `{ shipping_option_id, origin: "us"\|"ng"\|"mixed", currency, duties_message, options: [{ code, title, delivery_time, amount, currency, carrier }] }`. Needs a shipping address on the cart. Rate limited, cached per cart. Choose with `POST /store/carts/:id/shipping-methods { option_id: shipping_option_id, data: { quote_code: code } }`. Changing the cart or address invalidates the quote (re-quote). |
| GET | `/store/haanta/search` | Query: `q, category (e.g. women/dresses), brand (vendor slug, repeatable), style, region, size, color, ships_from (lagos\|houston), fulfilment (ready_to_wear\|made_to_order\|preorder), shop, price_min, price_max, currency (usd\|cad), on_sale, sort (relevance\|newest\|price_asc\|price_desc\|best_selling), page, limit (≤60)`. → `{ hits: SearchDocument[], total, page, pages, facets: { category, brand, style, region, size, color, ships_from, fulfilment: [{value,count}] }, price_range }`. Out-of-stock never returned. |
| GET | `/store/haanta/brands` | `{ brands: [{ id, name, slug, logo_url, region, origin_country }] }` |
| GET | `/store/haanta/brands/:slug` | `{ brand: { name, slug, logo_url, banner_url, story (sanitised HTML), region, size_notes, policies }, products: SearchDocument[], total }` |
| GET | `/store/haanta/products/:handle` | `{ product_id, vendor, fulfilment_type, lead_time_days, is_preorder, fit_notes, required_measurements: [{key,label,min,max,unit}], size_chart: { name, unit, rows: [{label, us, uk, eu, measurements}] } \| null, ships_from, variants: [{variant_id, ships_from, fulfilment_type}], delivery_estimate, badges: ("new"\|"preorder"\|"made_to_order"\|"sale")[], material, care, reviews: { average, count, fit, items }, complete_the_look: SearchDocument[] }` |
| POST | `/store/haanta/products/:product_id/reviews` | customer auth; `{ rating 1-5, title?, body (10-3000), fit?, photos?: url[] (≤4, Haanta-hosted) }` → moderated |
| POST | `/store/haanta/newsletter` | `{ email, source: "popup"\|"footer"\|"checkout" }` |
| POST | `/store/haanta/tracking` | `{ order_number, email }` → `{ order_number, status, placed_at, stages: [{stage, is_preorder, estimated_dispatch}], shipments: [{tracking_number, events}] }` or 404 |
| GET | `/store/haanta/settings` | `{ newsletter_popup: { enabled, delaySeconds, frequencyDays, showOnMobile }, duties_message, ready_to_wear_dispatch, free_shipping_threshold_usd, return_window_days }` |
| POST | `/store/haanta/dev/mock-payment` | **local only**: `{ payment_intent_id, payment_method? }` (Stripe test methods: `pm_card_visa`, `pm_card_chargeDeclined`, `pm_card_riskLevelElevated`) or `{ paypal_order_id }` |

`SearchDocument`: `{ id, handle, title, description, thumbnail, vendor: {id,name,slug,region}, categories, category_names, styles, shops, merch, sizes, colors, price_usd, price_cad, compare_at_usd, on_sale, ships_from, fulfilment, is_preorder, in_stock, is_new, created_at, units_sold }`

## Vendor portal API (`/vendor/*`, vendor bearer token)

All routes are scoped to the signed-in vendor on the server. Other vendors' ids return 404.
Before TOTP verification only `/vendor/me` and `/vendor/mfa/*` work (`403 mfa_required`); before email
verification also `/vendor/verify-email` and `/vendor/resend-verification` (`403 email_unverified`).

| Method | Path | Body / response |
|---|---|---|
| POST | `/vendor/applications` | registration token; `{ business_name, contact_name, origin_country, region?, story?, website?, instagram? }` → then sign in again |
| POST | `/vendor/invites/accept` | registration token; `{ token, name }` |
| GET | `/vendor/me` | `{ user, vendor: { id, name, slug, status, … }, mfa: { enrolled, verified } }` |
| GET | `/vendor/mfa` | `{ enrolled, verified }` |
| POST | `/vendor/mfa/setup` | → `{ secret, otpauth_uri, recovery_codes }` (show once; render QR from `otpauth_uri`) |
| POST | `/vendor/mfa/confirm` | `{ code }` |
| POST | `/vendor/mfa/verify` | `{ code }` or `{ recovery_code }` |
| POST | `/vendor/verify-email` | `{ token }` (from the emailed link `/verify-email?token=…`) |
| POST | `/vendor/resend-verification` | — |
| GET/POST | `/vendor/store` | store page `{ logo_url, banner_url, story, policies, size_notes, region }`; GET also returns `preview_path` |
| GET | `/vendor/products?status=&limit=&offset=` | `{ products: [{ id, title, status (draft\|in_review\|live\|changes_requested), is_live, has_pending_changes, review_note, weight_missing, size_chart_missing }], count }` |
| POST | `/vendor/products` | `{ snapshot }` → draft. See **Listing snapshot** |
| GET | `/vendor/products/:id` | `{ product, snapshot, approved_snapshot, prices: [{ variant, vendor_price_usd_minor, retail: { USD, CAD } }] }` |
| POST | `/vendor/products/:id` | `{ snapshot }`; editing a live product sends it back to review (approved version stays live) |
| DELETE | `/vendor/products/:id` | drafts only |
| POST | `/vendor/products/:id/submit` | draft/changes_requested → in_review (vendor must be active) |
| POST | `/vendor/pricing/preview` | `{ category_ids, variants: [{ vendor_price_minor, vendor_currency }] }` → storefront prices |
| GET/POST | `/vendor/size-charts`, `/vendor/size-charts/:id` (+DELETE) | `{ name, unit: "in"\|"cm", rows: [{ label, us?, uk?, eu?, measurements: { bust: "34", … } }], notes? }` |
| GET | `/vendor/orders?status=` | `{ orders: [{ id, display_id, created_at, status, tracking_number, ship_to (Haanta hub), lines: [{ product_title, variant_title, sku, quantity, vendor_price_minor, line_total_minor, measurements, fulfilment_type, thumbnail }], total_minor, ship_by, is_late }] }`, never buyer data |
| GET | `/vendor/orders/:id` | one order (same shape) |
| POST | `/vendor/orders/:id/status` | `{ status: accepted\|in_production\|shipped_to_hub, tracking_number?, tracking_carrier? (dhl\|fedex\|ups\|gig\|fez\|other) }` (tracking required for shipped_to_hub) |
| GET | `/vendor/earnings` | `{ balance: { pending_minor, payable_minor, paid_minor, lifetime_minor }, entries: [{ created_at, type, reason, order, product, quantity, amount_minor, status (pending\|payable\|paid), payout_id }], payouts }` |
| GET | `/vendor/earnings/statements/:payout_id?format=pdf\|csv` | file download |
| GET | `/vendor/analytics?days=` | `{ sales_by_day, best_sellers, low_stock, open_orders, late_orders }` |
| POST | `/vendor/uploads/sign` | `{ purpose: product\|logo\|banner, content_type: image/jpeg\|png\|webp, size }` → `{ upload: { provider, upload_url, fields, expires_at } }`. Cloudinary: POST multipart `fields` + `file` to `upload_url`. Local: POST the raw file bytes to `upload_url?<fields as query string>` with `Content-Type` = content type → `{ secure_url }` |

**Listing snapshot**: `{ title, subtitle?, description (HTML, sanitised), material?, care?, category_ids[], images: url[] (uploaded via sign), fulfilment_type: ready_to_wear|made_to_order, lead_time_days (required for made_to_order), is_preorder, required_measurements: (bust|waist|hips|height|shoulder|arm_length|inseam|dress_length)[], size_chart_id?, fit_notes?, styles[], options: [{ title, values[] }] (1–4), variants: [{ title, sku?, options: { [optionTitle]: value }, vendor_price_minor, vendor_currency: USD|NGN, weight_kg?, stock_location: lagos|houston, quantity? (null = always available), fulfilment_type? }] }`

## Admin API (`/admin/haanta/*`)

Staff session (Medusa admin dashboard) or bearer; staff role required; TOTP required. See `apps/backend/src/lib/rbac.ts`
for the role table. Routes: `me`, `mfa{,/setup,/confirm,/verify}`, `dashboard?days`, `abandoned-carts`,
`orders?origin&risk`, `orders/:id/delivered`, `refunds/:order_id`, `catalog-health`, `review-queue{,/:id,/:id/approve,/:id/request-changes,/:id/edit}`,
`vendors{,/:id,/:id/status,/:id/invites,/:id/mfa-reset}`, `markup/{vendors/:id,categories,products}`, `payouts`, `reconciliation`,
`ledger/:vendor_id`, `settings{,/:key}`, `audit-log`, `staff-roles`, `product-reviews{,/:id}`, `privacy/export/:customer_id`, `privacy/delete/:customer_id`.

## Webhooks

`POST /webhooks/stripe` (Stripe-Signature), `POST /webhooks/paypal` (PayPal transmission headers),
`POST /webhooks/shipengine?token=…`. Each event id is processed once.
