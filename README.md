# SketchCast — marketing site

Static marketing site for [sketchcast.app](https://sketchcast.app), deployed to
Cloudflare (Workers static assets). Plain HTML — no framework, no bundler. Each
page is a single HTML file with inline CSS/JS, sharing the "Live Ink" tokens and
header/footer. (`pricing.html` additionally loads `pricing.config.js` — the one
data file it renders from; see below.)

## Run locally

Any static file server works, e.g.:

```bash
npx wrangler dev        # serves the folder exactly as Cloudflare will
# or
python -m http.server 8788
```

Open `/` for the homepage and `/pricing` for the pricing page.

## Pricing page

`/pricing` renders entirely from **`pricing.config.js`** — the single source of
truth for plans, prices, copy, features, and checkout links. No price or link
is ever written twice; to change any of them, edit that one file. Annual pricing
is two months free — the whole-dollar teacher plans are exactly monthly × 10
(24→240, 49→490), and Family is $99 (~2 months off $9.99). All prices USD.

- **Checkout links live directly in the config.** This is a static site with no
  runtime env, and Lemon Squeezy hosted-checkout URLs are public (any visitor
  can see them) — so they belong in code. **No secrets exist in this repo**;
  billing secrets (API keys, webhook signing secrets) live in the separate app.
- **One product URL serves both cycles.** Lemon Squeezy shows the monthly and
  annual variant on the same checkout page, so the toggle changes displayed
  prices only — the customer picks the cycle at checkout.
- **Founding offer is code-driven.** The banner links to the plain Teacher Pro
  checkout and displays the discount code (with a copy button); the teacher
  chooses Monthly and pastes the code in the discount field. The "first N" cap
  is a single config value (`founding.cap`, set `null` to remove the line).
- **Schools have no public price** — the schools block is a sales enquiry only.
  No student-facing purchase surface exists.
- A missing/blank link degrades gracefully (paid CTAs fall back to sign-up), so
  a misconfigured value never renders a broken button.

## Deploy

```bash
npx wrangler deploy
```

No environment variables to configure. `wrangler.jsonc` and the ignore files are
excluded from the served assets via `.assetsignore`.

Ship changes on a branch and review the Cloudflare **preview** URL before
merging to `main`.
