# How to put Haanta online (staging)

This guide puts the whole Haanta site on the internet so you can see it, test it and share it.
It is a **staging** site: a full working copy for testing, not yet connected to www.haanta.com.

Set aside about **1–2 hours**. You don't need to know how to code: you'll mostly click buttons and copy-paste.

---

## Before you start

### What we're setting up

Haanta has four parts. Each one lives on a service that suits it:

| Part | What it does | Where it goes |
|---|---|---|
| **Database** | Stores products, orders, vendors, customers | **Neon** |
| **Backend** (+ admin dashboard) | The "engine": prices, cart, checkout, the admin at `/app` | **Railway** |
| **Storefront** | The shop buyers see | **Vercel** |
| **Vendor portal** | Where vendors log in and manage their products | **Vercel** (a second project) |

We do them **in this order**, because each step gives you an address the next step needs.

### What you need

- The **GitHub account** that owns the Haanta code (`julius48`). You'll sign in to all three services with it.
- A **notes file** to keep the values you collect. Open Notepad and paste this in. You'll fill it as you go:

```text
DATABASE ADDRESS (from Neon):
BACKEND ADDRESS (from Railway):
PUBLISHABLE KEY (from data loading):
STOREFRONT ADDRESS (from Vercel):
VENDOR PORTAL ADDRESS (from Vercel):
ADMIN EMAIL:
ADMIN PASSWORD:
```

> 🔒 **Keep this file private.** The database address and passwords are like keys to the house.
> Don't email them or put them in the code. Store them in a password manager when you're done.

### Words you'll see

- **Deploy**: put a new version of the code online.
- **Environment variables** (or "Variables"): settings the site reads when it starts, written as `NAME=value`.
- **Repository / repo**: the Haanta code on GitHub.
- **URL / domain**: a web address, like `https://something.vercel.app`.

---

## Step 1: Create the database (Neon)

**What this does:** gives Haanta a place to store all its data online.

1. Go to **https://neon.tech** and click **Sign up**. Choose **Continue with GitHub**.
2. Click **New project** (Neon may show this form straight away after sign-up).
3. Fill in:
   - **Project name:** `haanta`
   - **Postgres version:** leave the default
   - **Region:** pick **AWS US East** (N. Virginia or Ohio, whichever is offered first)
4. Click **Create project**.
5. On the project page, click the **Connect** button.
6. In the box that opens:
   - Find the switch called **Connection pooling** and turn it **off**.
   - You'll see a long address starting with `postgresql://`. Click the **copy** icon next to it.
7. Paste it into your notes next to **DATABASE ADDRESS**.

✅ **You should now have** an address like:
`postgresql://neondb_owner:AbC123xyz@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require`

---

## Step 2: Create the secret keys

**What this does:** makes the random "passwords" the backend uses to protect logins and data.

1. In VS Code, open a terminal: menu **Terminal → New Terminal**.
2. Copy this whole line, paste it into the terminal and press **Enter**:

```bash
node -e "const c=require('crypto');for(const [n,b] of [['JWT_SECRET',48],['COOKIE_SECRET',48],['MFA_ENCRYPTION_KEY',32],['MFA_RECOVERY_PEPPER',48],['UPLOAD_SIGNING_SECRET',48],['STRIPE_WEBHOOK_SECRET',48],['PAYPAL_MOCK_WEBHOOK_SECRET',48]])console.log(n+'='+c.randomBytes(b).toString('base64'))"
```

3. It prints 7 lines. Copy all 7 into your notes under a heading **SECRETS**.

✅ **You should now have** 7 lines like `JWT_SECRET=k3Jd9...` in your notes.

> ⚠️ Run it **once** and keep the result. If `MFA_ENCRYPTION_KEY` changes later, every staff member has to set up 2FA again.

4. While you're here, decide your **admin email** (your real email) and a **long, unique admin password**. Write both in your notes.

---

## Step 3: Put the backend online (Railway)

**What this does:** runs Haanta's engine and admin dashboard on the internet.

### 3a. Create the project

1. Go to **https://railway.com** and click **Login → Login with GitHub**.
2. Click **New Project** (or **+ New**) → **Deploy from GitHub repo**.
3. If Railway asks for access to your GitHub, click **Configure GitHub App**, allow access to the **Haanta-website** repo, and come back.
4. Pick **Haanta-website** from the list.
5. Railway starts building straight away. **It will fail the first time. That's expected**: it doesn't have its settings yet.

### 3b. Give it a web address

1. Click the box (the "service") that appeared in your project.
2. Open the **Settings** tab.
3. Scroll to **Networking** and click **Generate Domain**. If it asks for a port, type `9000`.
4. Copy the address it shows (like `haanta-website-production.up.railway.app`).
5. In your notes, write it as **BACKEND ADDRESS** with `https://` in front:
   `https://haanta-website-production.up.railway.app`

### 3c. Tell it how to build and start

Still in **Settings**, find each field below and paste the value exactly. (Railway saves each field when you click away or press Enter.)

| Setting (in the Settings tab) | Paste this |
|---|---|
| **Root Directory** | leave it **empty** |
| **Region** | US East |
| **Custom Build Command** | `pnpm install --frozen-lockfile --prod=false && pnpm turbo run build --filter=@haanta/backend` |
| **Pre-deploy Command** | `pnpm --filter @haanta/backend migrate:prod` |
| **Custom Start Command** | `pnpm --filter @haanta/backend start:prod` |
| **Healthcheck Path** | `/health` |

### 3d. Add the settings (variables)

1. Open the **Variables** tab.
2. Click **Raw Editor**.
3. Copy the block below into Notepad first and replace each `<...>` with your values:
   - `<DATABASE ADDRESS>` → from Step 1
   - `<BACKEND ADDRESS>` → from Step 3b, **including** `https://`
   - the `<from Step 2>` lines → your 7 secret lines (paste them over these 7 lines)
   - `<ADMIN EMAIL>` / `<ADMIN PASSWORD>` → from Step 2
   - Leave the `PUT-STOREFRONT-ADDRESS-HERE` and `PUT-VENDOR-ADDRESS-HERE` parts as they are for now. You'll fix them in Step 6.

```env
NODE_ENV=production
APP_ENV=staging
PORT=9000
MEDUSA_DISABLE_TELEMETRY=true
MEDUSA_WORKER_MODE=shared
PAYPAL_ENV=sandbox
FX_PROVIDER=fixed

DATABASE_URL=<DATABASE ADDRESS>
MEDUSA_BACKEND_URL=<BACKEND ADDRESS>
ADMIN_URL=<BACKEND ADDRESS>/app
ADMIN_CORS=<BACKEND ADDRESS>

STOREFRONT_URL=https://PUT-STOREFRONT-ADDRESS-HERE
VENDOR_PORTAL_URL=https://PUT-VENDOR-ADDRESS-HERE
STORE_CORS=https://PUT-STOREFRONT-ADDRESS-HERE
VENDOR_CORS=https://PUT-VENDOR-ADDRESS-HERE
AUTH_CORS=https://PUT-STOREFRONT-ADDRESS-HERE,https://PUT-VENDOR-ADDRESS-HERE,<BACKEND ADDRESS>

JWT_SECRET=<from Step 2>
COOKIE_SECRET=<from Step 2>
MFA_ENCRYPTION_KEY=<from Step 2>
MFA_RECOVERY_PEPPER=<from Step 2>
UPLOAD_SIGNING_SECRET=<from Step 2>
STRIPE_WEBHOOK_SECRET=<from Step 2>
PAYPAL_MOCK_WEBHOOK_SECRET=<from Step 2>

HAANTA_OPS_EMAIL=<ADMIN EMAIL>
SEED_ADMIN_EMAIL=<ADMIN EMAIL>
SEED_ADMIN_PASSWORD=<ADMIN PASSWORD>
```

4. Paste the filled-in block into the Raw Editor and click **Update Variables**.
5. Railway shows a button to **Deploy** the changes. Click it.

### 3e. Wait for it to go green

1. Open the **Deployments** tab. You'll see the build running. It takes **5–15 minutes** the first time.
2. When it's finished, the deployment shows **Success / Active** (green).
3. Check it: open `<BACKEND ADDRESS>/health` in your browser. It should show **OK**.

✅ **The backend is online.**

❌ **If it fails (red):** click the failed deployment → **View logs**, copy the error lines, and paste them to Claude.

---

## Step 4: Load the products and create the admin account

**What this does:** fills the empty online database with Haanta's products and creates your admin login.

The easiest way: **ask Claude.** Say *"load the data into Neon"* and give it your **DATABASE ADDRESS** when asked.
Claude runs it from your computer and gives you back the **publishable key** (it starts with `pk_`).

Put the publishable key in your notes as **PUBLISHABLE KEY**.

✅ **Check:** go to `<BACKEND ADDRESS>/app` and log in with your admin email and password.
It will ask you to set up **2FA**: scan the QR code with Google Authenticator or Authy and type in the 6-digit code.

---

## Step 5: Put the storefront online (Vercel)

**What this does:** publishes the shop that buyers see.

1. Go to **https://vercel.com** and click **Sign Up** (or **Log In**) → **Continue with GitHub**.
2. Click **Add New… → Project**.
3. Find **Haanta-website** and click **Import**. (If it's not listed, click **Adjust GitHub App Permissions** and allow the repo.)
4. On the setup screen:
   - **Project Name:** `haanta-storefront`
   - **Root Directory:** click **Edit**, choose **apps/storefront**, click **Continue**
   - **Framework Preset:** should say **Next.js** (leave it)
   - **Build and Output Settings:** leave everything as is
5. Open **Environment Variables**. Copy this block, fill in the two values, and paste it into the first **Key** box (Vercel splits it into rows automatically):

```env
MEDUSA_BACKEND_URL=<BACKEND ADDRESS>
NEXT_PUBLIC_MEDUSA_BACKEND_URL=<BACKEND ADDRESS>
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<PUBLISHABLE KEY>
NEXT_PUBLIC_SITE_URL=https://haanta-storefront.vercel.app
```

6. Click **Deploy** and wait (about 3–6 minutes).
7. When you see the **Congratulations** screen, click **Continue to Dashboard**. Under **Domains** you'll see the address (for example `haanta-storefront.vercel.app`).
   Write it in your notes as **STOREFRONT ADDRESS** (with `https://`).

> If the address Vercel gave you is different from `haanta-storefront.vercel.app`, go to **Settings → Environment Variables**,
> change `NEXT_PUBLIC_SITE_URL` to the real one, then redeploy (see "Redeploying" at the end).

✅ **The storefront is online.** (Products only show once Step 6 is done.)

---

## Step 6: Put the vendor portal online (Vercel)

Same as Step 5, as a **second** project:

1. In Vercel, click **Add New… → Project** → import **Haanta-website** again.
2. **Project Name:** `haanta-vendor`
3. **Root Directory:** **apps/vendor**
4. **Environment Variables:**

```env
MEDUSA_BACKEND_URL=<BACKEND ADDRESS>
NEXT_PUBLIC_MEDUSA_BACKEND_URL=<BACKEND ADDRESS>
NEXT_PUBLIC_VENDOR_URL=https://haanta-vendor.vercel.app
NEXT_PUBLIC_STOREFRONT_URL=<STOREFRONT ADDRESS>
```

5. Click **Deploy**. When it's done, write the address in your notes as **VENDOR PORTAL ADDRESS**.

---

## Step 7: Connect everything

**What this does:** tells the backend which websites are allowed to talk to it. Until this is done, the storefront can't load products.

1. Go back to **Railway** → your service → **Variables** → **Raw Editor**.
2. Replace every `PUT-STOREFRONT-ADDRESS-HERE` with your storefront address **without** `https://`
   (for example `haanta-storefront.vercel.app`).
3. Replace every `PUT-VENDOR-ADDRESS-HERE` with your vendor portal address, also without `https://`.
4. Click **Update Variables**, then **Deploy**. Wait for green again (a few minutes).

✅ **Everything is connected.**

---

## Step 8: Check that it all works

Go through this list on your **computer and your phone**:

- [ ] **Storefront** home page shows products and images
- [ ] Search finds something, and a product page opens
- [ ] **Add to bag** works, and the checkout page opens
- [ ] **Vendor portal** login page opens
- [ ] **Admin** (`<BACKEND ADDRESS>/app`) login works

Anything not working? Tell Claude which item failed and what you see on screen.

---

## Good to know

**What doesn't work yet on staging (on purpose):**

- **Paying at checkout.** Real payment needs Stripe and PayPal accounts. Start with their *test* keys: give them to Claude when you have them.
- **Uploading images** (vendors or admin). This needs a **Cloudinary** account. Without it, uploaded images disappear whenever the backend restarts.
- **Real shipping rates, search, emails.** These run on stand-ins until their accounts (UPS/ShipEngine, Algolia, Klaviyo) are added.

**Redeploying** (needed after changing a Vercel variable that starts with `NEXT_PUBLIC_`):
Vercel → your project → **Deployments** → the **⋯** menu on the top one → **Redeploy**.

**Updates happen automatically:** every time new code is pushed to GitHub (`git push`), Railway and Vercel rebuild and update the sites by themselves.

**Costs:** Neon and Vercel have free tiers that cover staging. Railway gives a small trial credit, then about $5/month.

---

## Later: going live on www.haanta.com

Only when everything above has been tested:

1. Add real payment, image, shipping and email accounts (with Claude).
2. In Vercel → storefront project → **Settings → Domains**, add `www.haanta.com`. Vercel shows you which DNS records to set.
3. Change those DNS records where the haanta.com domain is managed. This switches the site away from Wix.
4. Update the addresses in Railway's variables to the new domain (Claude can list exactly which ones).
