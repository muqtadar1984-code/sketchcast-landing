# SketchCast — marketing site

Static marketing site for [sketchcast.app](https://sketchcast.app), deployed to
Cloudflare (Workers static assets). Plain HTML — no framework, no bundler. Each
page is a single HTML file with inline CSS/JS, sharing the "Live Ink" tokens and
header/footer. (`pricing.html` additionally loads `pricing.config.js` — the one
data file it renders from; see below.)

The one build step is the **translation generator** — six English pages in, the
whole site in ten languages out. See [Languages](#languages).

## Run locally

Any static file server works, e.g.:

```bash
npx wrangler dev        # serves the folder exactly as Cloudflare will
# or
python -m http.server 8788
```

Open `/` for the homepage and `/pricing` for the pricing page. Translated pages
live at `/<locale>/…` — `/ar/pricing`, `/ms-arab/`, and so on.

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
- **A checkout link is variant-locked — one link per cycle.**
  `/checkout/buy/<slug>` is a *variant's* share link: it opens that one variant
  at its own price, with no billing-cycle chooser on the page. Every paid plan
  therefore carries `checkout: { monthly, annual }`, and the Monthly/Annual
  toggle re-points each CTA's `href` in the same update that re-renders its
  price. This bullet used to claim one URL served both cycles; it never did,
  and while it stood a visitor could toggle to Annual, read $240, click, and be
  billed $24 a month. Nothing errors when a link opens the wrong variant — the
  buyer is simply charged by whatever it opens — so **verify any repoint by
  fetching the URL and reading the subtotal it renders.**
- **Founding offer is OFF the site** (founder, 2026-09-04): `founding: null` in
  pricing.config.js hides the band, the Teacher Pro card's flag and the live
  counter. The FOUNDINGTEACHER code stays active in Lemon Squeezy; restore the
  config block from git history to advertise it again.
- **Schools have no public price** — the schools block is a sales enquiry only.
  No student-facing purchase surface exists.
- A missing/blank link degrades gracefully (paid CTAs fall back to sign-up), so
  a misconfigured value never renders a broken button.

## Languages

The site ships in the same ten languages as the portal: `en`, `ms`, `ar`, `fr`,
`es`, `pt`, `te`, `mr`, `hi`, `ms-arab` (Jawi) — the registry at the top of
`build-i18n.mjs` mirrors `src/i18n/locales.ts` in the app repo, code for code and
label for label, so the two pickers can never drift apart on screen.

### The workflow

**Edit English → run the generator → commit the output.**

```bash
npm run i18n          # validate, then write every page
npm run i18n:check    # validate only, write nothing (exit 1 on error) — good for CI
```

1. **Copy lives in `strings/en.json`, not in the HTML.** The English pages carry
   `data-i18n="key"` annotations and English placeholder text; the generator
   overwrites that text from `en.json` on every run. Editing a sentence in
   `index.html` will be silently undone on the next build — so the build warns
   you when a page's text has drifted from `en.json`, naming the key. Move the
   edit into `en.json` and re-run.
2. **New copy = new markup + new key.** Add the element with a
   `data-i18n="page.section.item"` attribute, add the key to `strings/en.json`,
   run `npm run i18n:check`. A key with no element, or an element with no key, is
   an error, not a surprise in production.
3. **New language = one file.** Drop `strings/<code>.json` (a full copy of
   `en.json` with translated values) into `strings/`. Nothing else changes: the
   locale appears in the switcher, in `hreflang`, in `sitemap.xml` and in
   `_headers` on the next run. A locale with no strings file is not linked
   anywhere — we never point a reader or a crawler at a page we have not built.
4. **Commit the generated output.** Cloudflare serves plain files and runs no
   build, so `<locale>/*.html`, `<locale>/pricing.i18n.js`, `sitemap.xml`,
   `robots.txt` and the `_headers` block are committed like any other asset.

### What the generator owns

Between `<!--i18n:NAME-->` … `<!--/i18n:NAME-->` markers, `build-i18n.mjs` writes
the parts that must agree across sixty pages: `canonical`, the full `hreflang`
cluster plus `x-default`, `og:url`/`og:locale`, the per-script font and
typography block, the language switcher (header disclosure + footer list), and
the "this is a translation, English prevails" notice on `/privacy` and `/terms`.
It also sets `<html lang dir>` and rewrites internal links to stay inside the
locale. Adding a language touches none of the HTML.

### Writing a translation

`strings/en.json` opens with a `_readme` block aimed at whoever translates it.
The short version: keys are stable, most values are plain text, and the few that
carry inline markup carry only `<strong>`/`<b>`/`<em>` (emphasis — move it,
don't delete it), `<a href="…">` (translate the words, never the URL) and
`<mark>…</mark>` (the words the hand-drawn ink stroke runs under). The build
fails if a translated value changes the markup or loses a `{placeholder}`.

### Arabic and Jawi

RTL is not a switch that gets flipped once. Three things make it work:

- **The layout mirrors itself.** Every physical direction property in the six
  stylesheets is a logical one (`inset-inline-*`, `padding-inline-*`,
  `border-inline-*`, `text-align:start`), so `dir="rtl"` turns the page over.
  Keep it that way: no `left`, `right`, `padding-left`, `border-left`,
  `text-align:left`.
- **Glyphs that encode reading direction are flipped explicitly.** `←` and `→`
  are not mirrored by the bidi algorithm, and the ink strokes are drawn
  left-to-right by hand — both are turned by the generated RTL block, which uses
  the same `.rtl-flip` convention as the portal's `globals.css`.
- **Typography is per script, not per page.** Arabic and Jawi load Noto Kufi
  Arabic + Noto Sans Arabic (Noto for its Arabic Extended-A coverage, which is
  where Jawi's ݢ ڠ ڤ ڽ live); Hindi/Marathi and Telugu load their Noto faces.
  Letter-spacing and `text-transform` are neutralised document-wide for those
  scripts — tracking pulls a cursive script apart at the joins, and the Latin
  stylesheet applies it to eyebrows, chips and headings.

## Free lessons (/topics)

`/topics` and `/topics/<slug>` (and every `/<locale>/topics…`) are generated by
**`build-topics.mjs`** from the app database's public catalogue
(`public_catalogue()`: approved lessons whose video is public on YouTube). Each
page carries the YouTube lesson, the written explanation, key terms, worked
examples, misconceptions and curriculum alignment. The full teaching kit is
behind sign-in and reads **"Coming soon"** until it is released (flip
`KITS_RELEASED` in the script together with the app's `catalogue_release`
switch).

- Run it **after** `build-i18n.mjs` — each language's topic pages are cut from
  that language's built `schools.html` (head, header, switcher, footer).
- Page text lives in `strings/topics/<locale>.json` (all ten required). The
  lesson content is English; translated pages are `noindex` with their
  canonical on the English page.
- Writes `topics.html`, `topics/*.html`, `<locale>/topics…`, `sitemap-topics.xml`
  (listed in robots.txt) and, when a topic was renamed, `_redirects`.
- Re-run whenever a lesson is approved, published or withdrawn — or let the
  workflow do it (next section).

### The pages rebuild themselves

**`.github/workflows/topics.yml`** runs both generators, checks the output
with **`check-topics.mjs`**, and commits + pushes *only the generated topic
files* when they changed — which deploys the site. It runs:

- **nightly** at 02:40 UTC (one line in the workflow to run more often; a run
  that finds nothing to commit deploys nothing);
- **on demand** — Actions → *topics* → *Run workflow*, on any branch. On a
  branch it commits to that branch, which is how to test it without touching
  `main`;
- **when the app asks** — the staff console sends a `repository_dispatch`
  (`catalogue-changed`) after an action that changes what the public
  catalogue shows (see the app's `docs/LIBRARY-PORTAL.md`). Optional: it
  needs a token on the app side; without one, nightly covers everything. A
  publish finishes in the worker minutes after the click, so a *new* lesson
  may still wait for the nightly run.

What it refuses: an empty catalogue (`build-topics.mjs`), and one that lost
more than a fifth of its topics since the last commit (`check-topics.mjs` —
a half-answered RPC must not unpublish forty lessons overnight; a real cull
passes when dispatched with *allow_shrink*). What it leaves alone: everything
`build-i18n.mjs` touched — `sitemap.xml`'s `<lastmod>` is mtime-based and
would differ on every checkout, and an English page edited without
`npm run i18n` is yours to regenerate and commit (the run warns, naming the
files). Commits are by `github-actions[bot]`; if `main` moved during the
build the push is retried once on a rebase, then fails and the next run
starts from the new `main`.

Locally, `npm run topics` is the same three steps in order (i18n → topics →
check); `npm run topics:check` is the check alone.

## Deploy

```bash
npm run i18n && npm run topics && npx wrangler deploy
```

No environment variables to configure. `wrangler.jsonc`, the generator, its
inputs (`strings/`) and its tooling are excluded from the served assets via
`.assetsignore`; the generator's **output** ships.

Ship changes on a branch and review the Cloudflare **preview** URL before
merging to `main`.
