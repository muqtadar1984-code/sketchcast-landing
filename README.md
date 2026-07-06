# SketchCast — marketing site

Static marketing site for [sketchcast.app](https://sketchcast.app), deployed to
Cloudflare (Workers static assets). Plain HTML — no framework, no bundler. Each
page is a self-contained file (`index.html`, `pricing.html`, `privacy.html`,
`terms.html`) with inline CSS/JS, sharing the "Live Ink" tokens and header/footer.

## Run locally

Any static file server works, e.g.:

```bash
npx wrangler dev        # serves the folder exactly as Cloudflare will
# or
python -m http.server 8788
```

Open `/` for the homepage and `/pricing` for the pricing page.

## Pricing page

`/pricing` renders entirely from a single config so no price is ever written twice:

- **`pricing.config.js`** — the source of truth: plans, prices, copy, features.
  Annual = monthly × 10 (two months free). All prices USD.
- **`pricing.links.js`** — the public Lemon Squeezy checkout URLs + schools /
  sign-up URLs. **Generated** from environment variables; committed with blank
  values so the page always works (paid CTAs fall back to sign-up, schools to a
  mailto — a missing link never renders a broken button).
- **`build-pricing-config.mjs`** — writes `pricing.links.js` from env at build time.

Teachers and parents check out via **Lemon Squeezy** hosted checkout (USD).
**Schools have no public price** — the schools block is a sales enquiry only.
No student-facing purchase surface exists.

### Inject the checkout links (env)

The checkout links are **public** (not secrets) — kept in env only so they swap
between test and live without editing committed code. See `.env.example`:

```
LS_TEACHER_PRO_M=   LS_TEACHER_PRO_A=
LS_TEACHER_PROPLUS_M=  LS_TEACHER_PROPLUS_A=
LS_PARENT_FAMILY_M=  LS_PARENT_FAMILY_A=
LS_FOUNDING_TEACHER=
SCHOOLS_ENQUIRY_URL=
APP_SIGNUP_URL=https://app.sketchcast.app/signup
```

Set these in the **Cloudflare project → Settings → Variables**, then run the
build so they land in `pricing.links.js`:

```bash
node build-pricing-config.mjs
```

Locally you can export them first (or use a `.env` and a loader) — with none set,
the build re-emits blanks and the page degrades gracefully.

## Deploy

```bash
node build-pricing-config.mjs   # inject checkout links from env
npx wrangler deploy             # upload the static assets
```

For a git-connected Cloudflare **Workers build**, set the build command to
`node build-pricing-config.mjs` and add the variables above in the project
settings. `wrangler.jsonc`, the ignore files, `build-pricing-config.mjs`, and
`.env*` are excluded from the served assets via `.assetsignore`.

Ship changes on a branch and review the Cloudflare **preview** URL before merging
to `main`.
