#!/usr/bin/env node
/* SketchCast marketing site — the translation generator.
 *
 * WHAT THIS IS. Six hand-written English pages in, sixty static pages out. The
 * English files at the root are BOTH the source you edit and the English page
 * we serve; each other language is written to <locale>/<page>.html. There is no
 * framework, no bundler and no dependency — `node build-i18n.mjs` is the whole
 * build, and Cloudflare serves the result as plain files.
 *
 * WHY A GENERATOR. The alternative is 54 hand-copied files that drift the first
 * time a price or a claim changes. Here English is the only place copy is
 * written, strings/<locale>.json is the only place it is translated, and every
 * page in every language is derived. Nothing is edited twice.
 *
 * HOW SUBSTITUTION IS UNAMBIGUOUS. The English markup is annotated:
 *
 *   data-i18n="key"            replace this element's CONTENT with the string
 *   data-i18n-attr="a:key;…"   replace these ATTRIBUTES with the strings
 *   data-i18n-mark="class"     the string wraps its highlighted words in
 *                              <mark>…</mark>; expand that to <span class="…">
 *                              plus the hand-drawn SVG stroke lifted from the
 *                              English element, so the ink mark stays in markup
 *                              and never reaches a translator
 *
 * Nothing is guessed from surrounding text: an element without an annotation is
 * never touched, and a key with no home in the markup is reported.
 *
 * WHAT IT ALSO OWNS. Between <!--i18n:NAME--> … <!--/i18n:NAME--> markers the
 * build writes the parts that MUST agree across sixty pages and would rot if
 * hand-maintained: canonical + hreflang + og:url, the per-script font and
 * typography block, the language switcher, and the "this is a translation"
 * notice on the legal pages. Adding a language edits none of the HTML.
 *
 *   node build-i18n.mjs           validate, then write every page
 *   node build-i18n.mjs --check   validate only, write nothing (exit 1 on error)
 *   node build-i18n.mjs --quiet   only warnings and errors
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const STRINGS = join(ROOT, "strings");

/* ══════════════════════════════════════════════════════════════════════════
   CONFIG
   ══════════════════════════════════════════════════════════════════════════ */

const ORIGIN = "https://sketchcast.app";

/* The ten languages, in the SAME order and with the SAME endonym labels as the
 * portal's src/i18n/locales.ts. Two products, one list: a parent who reads the
 * app in Jawi must find Jawi on the website under the same name, and a label
 * that drifts between the two is a reader wondering whether they are in the
 * right place.
 *
 * label   each language's OWN name — never translated, because this is the one
 *         control a reader must find WITHOUT understanding the current page.
 * dir     rtl for the two Arabic-script locales.
 * html    the BCP-47 tag for <html lang> and hreflang. Nine codes already are
 *         valid tags; "ms-arab" is our internal spelling of ms-Arab (BCP-47
 *         title-cases a script subtag, and screen readers want the real one).
 * og      the og:locale form Facebook/LinkedIn expect (language_TERRITORY).
 * script  which typography block to inject — see SCRIPTS below.
 */
const LOCALES = [
  { code: "en",      label: "English",                     dir: "ltr", html: "en",      og: "en_US", script: "latin" },
  { code: "ms",      label: "Bahasa Melayu",               dir: "ltr", html: "ms",      og: "ms_MY", script: "latin" },
  { code: "ar",      label: "العربية (Arabic)",              dir: "rtl", html: "ar",      og: "ar_AR", script: "arabic" },
  { code: "fr",      label: "Français",                    dir: "ltr", html: "fr",      og: "fr_FR", script: "latin" },
  { code: "es",      label: "Español",                     dir: "ltr", html: "es",      og: "es_ES", script: "latin" },
  { code: "pt",      label: "Português",                   dir: "ltr", html: "pt",      og: "pt_PT", script: "latin" },
  { code: "te",      label: "తెలుగు (Telugu)",               dir: "ltr", html: "te",      og: "te_IN", script: "telugu" },
  { code: "mr",      label: "मराठी (Marathi)",              dir: "ltr", html: "mr",      og: "mr_IN", script: "devanagari" },
  { code: "hi",      label: "हिन्दी (Hindi)",                dir: "ltr", html: "hi",      og: "hi_IN", script: "devanagari" },
  { code: "ms-arab", label: "بهاس ملايو — Jawi (Malay)",     dir: "rtl", html: "ms-Arab", og: "ms_MY", script: "arabic" },
];

const DEFAULT_LOCALE = "en";

/* Per-SCRIPT typography. The page's own <style> is written for Latin: Space
 * Grotesk / Inter / JetBrains Mono, all loaded with the `latin` subset only,
 * plus tracked-out uppercase eyebrows and negative heading tracking. Serve an
 * Arabic page through that and you get two failures at once — a system fallback
 * font, and letter-spacing that pulls a CURSIVE script apart at the joins.
 * Both are the first thing a native reader sees, so both are fixed here:
 *
 *   font   a real webfont for the script, loaded only on pages that need it.
 *          Arabic pairs Noto Kufi Arabic (geometric, sits beside Space Grotesk)
 *          for display with Noto Sans Arabic for text — Noto because its
 *          coverage reaches Arabic Extended-A, which is where Jawi's ݢ ڠ ڤ ڽ
 *          live and where most "modern Arabic" webfonts stop.
 *   tracking:false  kill letter-spacing and text-transform document-wide. It is
 *          a blunt !important sweep on purpose: tracking is set by a dozen
 *          different rules across six stylesheets, several of them more
 *          specific than anything an injected block can reach, and there is no
 *          case where spaced-out Arabic, Devanagari or Telugu is what we meant.
 *          Latin words inside a translated page (SketchCast, MD/0002997) lose
 *          their tracking too; that is a smaller cost than broken script.
 *   leading non-Latin scripts have taller ascenders and marks that collide at
 *          the Latin line-height.
 */
const SCRIPTS = {
  latin: null,
  arabic: {
    font: "https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@500;600;700&family=Noto+Sans+Arabic:wght@400;500;600&display=swap",
    display: '"Noto Kufi Arabic","Space Grotesk",ui-sans-serif,system-ui,sans-serif',
    sans: '"Noto Sans Arabic","Inter",ui-sans-serif,system-ui,sans-serif',
    mono: '"Noto Sans Arabic",ui-monospace,monospace',
    leading: "1.85",
    tracking: false,
  },
  devanagari: {
    font: "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap",
    display: '"Noto Sans Devanagari","Space Grotesk",ui-sans-serif,system-ui,sans-serif',
    sans: '"Noto Sans Devanagari","Inter",ui-sans-serif,system-ui,sans-serif',
    mono: '"Noto Sans Devanagari",ui-monospace,monospace',
    leading: "1.8",
    tracking: false,
  },
  telugu: {
    font: "https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;500;600;700&display=swap",
    display: '"Noto Sans Telugu","Space Grotesk",ui-sans-serif,system-ui,sans-serif',
    sans: '"Noto Sans Telugu","Inter",ui-sans-serif,system-ui,sans-serif',
    mono: '"Noto Sans Telugu",ui-monospace,monospace',
    leading: "1.85",
    tracking: false,
  },
};

/* The six pages. `route` is the extensionless URL Cloudflare serves the file
 * at; `file` is the English source. `legal` marks the two pages that carry the
 * "English prevails" notice when translated. */
const PAGES = [
  { file: "index.html",   route: "/" },
  { file: "schools.html", route: "/schools" },
  { file: "pricing.html", route: "/pricing" },
  { file: "about.html",   route: "/about" },
  { file: "privacy.html", route: "/privacy", legal: true },
  { file: "terms.html",   route: "/terms",   legal: true },
];

/* Which paths get a locale prefix. A WHITELIST, not a blacklist: everything
 * else — /seal.png, /pricing.config.js, app.sketchcast.app, mailto:, tel:, a
 * bare #anchor — is shared across every language and must be left exactly as
 * written. Getting this backwards is how you end up serving /ar/seal.png. */
const LOCALIZED_PATHS = new Set([
  ...PAGES.map((p) => p.route),
  "/pricing.i18n.js", // the pricing page's runtime strings — one per locale
]);

/* Keys the BUILD owns rather than the markup: they are read by the generated
 * blocks or by pricing.html's runtime, so "no element uses this key" is
 * expected, not a mistake. */
const GENERATOR_OWNED = ["common.lang.", "common.legal.", "pricing.plans.", "pricing.founding.", "pricing.trial.", "pricing.schools.", "pricing.toggle.status", "pricing.toggle.per"];

/* ══════════════════════════════════════════════════════════════════════════
   A SMALL HTML SCANNER
   ══════════════════════════════════════════════════════════════════════════ */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAWTEXT = new Set(["script", "style"]);

/** Every tag in the document, in order, with its exact byte range.
 *
 * Not a parser — it never builds a tree — but it is not a regex either: it
 * skips comments and the doctype, walks attribute values with quote awareness
 * so a `>` inside an attribute cannot end a tag early, and jumps over the
 * contents of <script>/<style> so a `<` in JavaScript is never read as markup.
 * That is exactly enough to locate elements and rewrite attributes, which is
 * all this build does. */
function scanTags(html) {
  const out = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    if (html.startsWith("<!--", lt)) {
      const e = html.indexOf("-->", lt);
      i = e < 0 ? html.length : e + 3;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const e = html.indexOf(">", lt);
      i = e < 0 ? html.length : e + 1;
      continue;
    }
    const m = /^<(\/?)([a-zA-Z][^\s/>]*)/.exec(html.slice(lt, lt + 64));
    if (!m) {
      i = lt + 1;
      continue;
    }
    let j = lt + m[0].length;
    let quote = null;
    while (j < html.length) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
      j++;
    }
    const end = Math.min(j + 1, html.length);
    const raw = html.slice(lt, end);
    const name = m[2].toLowerCase();
    const isClose = m[1] === "/";
    out.push({ name, isClose, start: lt, end, raw, selfClosing: raw.endsWith("/>") });
    if (!isClose && RAWTEXT.has(name)) {
      const close = html.toLowerCase().indexOf(`</${name}`, end);
      i = close < 0 ? html.length : close;
    } else i = end;
  }
  return out;
}

/** The content range of the element opened by tokens[idx], by counting nested
 * tags of the same name. Returns null if the element is never closed — which is
 * a broken page, so callers throw rather than silently skip. */
function contentRange(tokens, idx) {
  const open = tokens[idx];
  if (open.selfClosing || VOID.has(open.name)) return { start: open.end, end: open.end };
  let depth = 0;
  for (let k = idx + 1; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.name !== open.name) continue;
    if (t.isClose) {
      if (depth === 0) return { start: open.end, end: t.start };
      depth--;
    } else if (!t.selfClosing && !VOID.has(t.name)) depth++;
  }
  return null;
}

function parseAttrs(raw) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(raw))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

/** A copy of `raw` with one attribute set (replaced in place, or appended). */
function setAttr(raw, name, value) {
  const v = `${name}="${escapeAttr(value)}"`;
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+)`, "i");
  if (re.test(raw)) return raw.replace(re, ` ${v}`);
  const tail = raw.endsWith("/>") ? 2 : 1;
  return `${raw.slice(0, raw.length - tail)} ${v}${raw.slice(raw.length - tail)}`;
}

const escapeAttr = (s) => String(s).replace(/&(?!#?\w+;)/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const escapeXml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The first complete <svg>…</svg> in a fragment — the hand-drawn ink stroke we
 * lift out of an English heading so the translated string never has to carry
 * it. */
function firstSvg(fragment) {
  const tokens = scanTags(fragment);
  const idx = tokens.findIndex((t) => t.name === "svg" && !t.isClose);
  if (idx < 0) return null;
  const inner = contentRange(tokens, idx);
  if (!inner) return null;
  const closeEnd = tokens.slice(idx).find((t) => t.name === "svg" && t.isClose);
  return fragment.slice(tokens[idx].start, closeEnd ? closeEnd.end : inner.end);
}

/** Apply [{start,end,text}] edits to a string. Applied back-to-front so earlier
 * offsets stay valid; overlaps are a bug and throw rather than corrupt. */
function applyEdits(src, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let last = Infinity;
  let out = src;
  for (const e of sorted) {
    if (e.end > last) throw new Error(`overlapping edits at ${e.start}..${e.end}`);
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    last = e.start;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   DICTIONARIES
   ══════════════════════════════════════════════════════════════════════════ */

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** "a.b.c" → the leaf, or undefined. */
function lookup(dict, key) {
  let node = dict;
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** Every leaf key in a dictionary, dotted. Keys starting "_" are notes to
 * translators (see strings/en.json's _readme), not strings. */
function allKeys(node, prefix = "", out = []) {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("_")) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.push(key);
    else if (v && typeof v === "object" && !Array.isArray(v)) allKeys(v, key, out);
  }
  return out;
}

/** The signature of the inline markup inside a value: every opening tag, in
 * order, with its attributes intact. Two values with the same signature contain
 * the same links pointing at the same URLs and the same emphasis, which is the
 * one thing a translator must not change. */
function markupSignature(value) {
  return scanTags(value)
    .filter((t) => !t.isClose)
    .map((t) => t.raw.replace(/\s+/g, " ").trim())
    .join("|");
}

/* ══════════════════════════════════════════════════════════════════════════
   GENERATED BLOCKS
   ══════════════════════════════════════════════════════════════════════════ */

const urlFor = (locale, route) => (locale === DEFAULT_LOCALE ? `${ORIGIN}${route}` : `${ORIGIN}/${locale}${route === "/" ? "/" : route}`);

/** Rewrite one href/src into the current locale, or leave it exactly alone.
 * Absolute URLs, mailto:, tel:, and bare #fragments are never touched. */
function localizeUrl(url, locale) {
  if (locale === DEFAULT_LOCALE) return url;
  if (!url || url.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return url;
  if (!url.startsWith("/")) return url;
  const hash = url.indexOf("#");
  const path = hash < 0 ? url : url.slice(0, hash);
  const frag = hash < 0 ? "" : url.slice(hash);
  if (!LOCALIZED_PATHS.has(path)) return url;
  return `/${locale}${path === "/" ? "/" : path}${frag}`;
}

/** canonical + the full hreflang cluster + og:url/og:locale + the per-script
 * font and typography block + the switcher's stylesheet.
 *
 * hreflang lists only languages that actually EXIST on disk. Pointing a search
 * engine at a translation we have not shipped is worse than shipping none, and
 * it means the cluster grows on its own as strings/<locale>.json files land. */
function headBlock(locale, page, active) {
  const L = LOCALES.find((l) => l.code === locale);
  const lines = [`<link rel="canonical" href="${urlFor(locale, page.route)}" />`];
  for (const l of active) lines.push(`<link rel="alternate" hreflang="${l.html}" href="${urlFor(l.code, page.route)}" />`);
  lines.push(`<link rel="alternate" hreflang="x-default" href="${urlFor(DEFAULT_LOCALE, page.route)}" />`);
  lines.push(`<meta property="og:url" content="${urlFor(locale, page.route)}" />`);
  lines.push(`<meta property="og:locale" content="${L.og}" />`);
  for (const l of active) if (l.code !== locale) lines.push(`<meta property="og:locale:alternate" content="${l.og}" />`);

  const s = SCRIPTS[L.script];
  if (s) lines.push(`<link href="${s.font}" rel="stylesheet" />`);
  lines.push(`<style id="i18n-css">${switcherCss()}${s ? scriptCss(s) : ""}${L.dir === "rtl" ? rtlCss() : ""}</style>`);
  return lines.map((l) => `  ${l}`).join("\n");
}

/* The switcher's styling lives HERE, not in the six page stylesheets: the
 * switcher is generated markup, so its CSS is generated too and adding a
 * language never means editing six <style> blocks. It leans on the --ink /
 * --line / --mono custom properties every page defines. */
const switcherCss = () => `
.i18n-lang{position:relative;font-size:14px}
.i18n-lang>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border:1px solid var(--line);border-radius:9px;background:var(--paper,#fff);color:var(--graphite,#5B6470);white-space:nowrap}
.i18n-lang>summary::-webkit-details-marker{display:none}
.i18n-lang>summary:hover{color:var(--ink);border-color:var(--faint,#98A0A9)}
.i18n-lang>summary svg{width:15px;height:15px;flex:0 0 15px}
.i18n-lang[open]>summary{color:var(--ink);border-color:var(--faint,#98A0A9)}
.i18n-lang-menu{position:absolute;z-index:40;top:calc(100% + 8px);inset-inline-end:0;min-width:210px;padding:6px;margin:0;list-style:none;background:var(--paper,#fff);border:1px solid var(--line);border-radius:11px;box-shadow:0 1px 2px rgba(20,24,31,.05),0 18px 40px -22px rgba(20,24,31,.45)}
.i18n-lang-menu li{margin:0}
.i18n-lang-menu a{display:block;padding:7px 11px;border-radius:7px;color:var(--ink);text-decoration:none}
.i18n-lang-menu a:hover{background:var(--mist,#F5F6F3)}
.i18n-lang-menu a[aria-current]{font-weight:500;background:var(--mist,#F5F6F3)}
.i18n-foot-lang{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:14px;padding-top:14px;border-top:1px solid var(--line);font-size:13px;color:var(--graphite,#5B6470)}
.i18n-foot-lang b{font-weight:500;color:var(--graphite,#5B6470)}
.i18n-foot-lang a{color:var(--graphite,#5B6470);text-decoration:none}
.i18n-foot-lang a:hover{color:var(--ink)}
.i18n-foot-lang a[aria-current]{color:var(--ink);font-weight:500}
.i18n-notice{margin:0 0 22px;padding:11px 15px;border:1px solid var(--line);border-inline-start:3px solid var(--marker,#FFB020);border-radius:9px;background:#fff;font-size:13.5px;color:var(--graphite,#5B6470)}
@media(max-width:860px){.i18n-lang>summary .i18n-lang-name{display:none}}
`.replace(/\n\s*/g, "");

const scriptCss = (s) => `
:root{--display:${s.display};--sans:${s.sans};--mono:${s.mono}}
body{font-family:var(--sans);line-height:${s.leading}}
h1,h2,h3{font-family:var(--display)}
${s.tracking === false ? "*,*::before,*::after{letter-spacing:normal!important;text-transform:none!important}" : ""}
`.replace(/\n\s*/g, "");

/* Mirroring the LAYOUT is the stylesheets' job — every physical property in
 * them was converted to a logical one (inset-inline-*, padding-inline-*,
 * border-inline-*, text-align:start), so dir="rtl" on <html> turns the page
 * over on its own. What is left here is the handful of GLYPHS that encode
 * reading direction and do not mirror themselves: "←" and "→" are not
 * Bidi_Mirrored, so the bidi algorithm moves them along the line but never
 * turns them round, and the ink strokes are drawn left-to-right by hand.
 * Same rule and the same .rtl-flip name as the portal's globals.css. */
const rtlCss = () => `
.rtl-flip{display:inline-block;scale:-1 1}
.uline svg,.ph-uline svg,.arrow svg,.arr svg,.demo .flow svg{scale:-1 1}
.demo{--pen-x:-1}
`.replace(/\n\s*/g, "");

const GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>';

/** The header switcher: a native <details> disclosure. No framework, no
 * JavaScript, keyboard- and screen-reader-native, and it opens on TOUCH — which
 * a :hover menu does not. Every option is written in its own language, because
 * this is the one control a reader has to find without already understanding
 * the page they are on. */
function switcherBlock(locale, page, active, t) {
  const L = LOCALES.find((l) => l.code === locale);
  const items = active
    .map((l) => {
      const cur = l.code === locale ? ' aria-current="true"' : "";
      return `      <li><a href="${urlFor(l.code, page.route)}" lang="${l.html}" hreflang="${l.html}" dir="${l.dir}"${cur}>${l.label}</a></li>`;
    })
    .join("\n");
  return `  <details class="i18n-lang">
    <summary aria-label="${escapeAttr(t("common.lang.choose"))}">${GLOBE}<span class="i18n-lang-name" lang="${L.html}" dir="${L.dir}">${L.label}</span></summary>
    <ul class="i18n-lang-menu">
${items}
    </ul>
  </details>`;
}

/** The footer list — the same links, but always in the document. A crawler and
 * a reader who never opens the header menu both still see every language. */
function footerLangBlock(locale, page, active, t) {
  const items = active
    .map((l) => {
      const cur = l.code === locale ? ' aria-current="true"' : "";
      return `<a href="${urlFor(l.code, page.route)}" lang="${l.html}" hreflang="${l.html}" dir="${l.dir}"${cur}>${l.label}</a>`;
    })
    .join("\n    ");
  return `  <nav class="i18n-foot-lang" aria-label="${escapeAttr(t("common.lang.label"))}">
    <b>${t("common.lang.footerLabel")}</b>
    ${items}
  </nav>`;
}

/** Privacy and Terms only, and only when translated: a translation of a legal
 * document is a convenience, not the instrument. Saying so is what keeps the
 * translated pages honest — and it is why translating them was safe to do. */
function legalNoticeBlock(locale, t) {
  if (locale === DEFAULT_LOCALE) return "";
  return `  <p class="i18n-notice">${t("common.legal.translationNotice")}</p>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PLAN — read the English page once, decide every substitution
   ══════════════════════════════════════════════════════════════════════════ */

/** Everything that will be replaced in a page, with English byte offsets. The
 * same plan renders all ten languages, so a page is scanned once, not ten
 * times, and every language is guaranteed to differ only in its strings. */
function planPage(html, file, errors) {
  const tokens = scanTags(html);
  const ops = [];
  const keys = new Set();

  tokens.forEach((tok, idx) => {
    if (tok.isClose) return;
    const a = parseAttrs(tok.raw);
    if (a["data-i18n"]) {
      const range = contentRange(tokens, idx);
      if (!range) {
        errors.push(`${file}: <${tok.name} data-i18n="${a["data-i18n"]}"> is never closed`);
        return;
      }
      const english = html.slice(range.start, range.end);
      const markClass = a["data-i18n-mark"] || null;
      let deco = null;
      if (markClass) {
        deco = firstSvg(english);
        if (!deco) errors.push(`${file}: data-i18n-mark="${markClass}" on "${a["data-i18n"]}" but the English element has no <svg> stroke to lift`);
      }
      keys.add(a["data-i18n"]);
      ops.push({ kind: "content", key: a["data-i18n"], markClass, deco, start: range.start, end: range.end });
    }
    if (a["data-i18n-attr"]) {
      const pairs = a["data-i18n-attr"]
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const c = s.indexOf(":");
          return [s.slice(0, c).trim(), s.slice(c + 1).trim()];
        });
      for (const [, key] of pairs) keys.add(key);
      ops.push({ kind: "attrs", pairs, raw: tok.raw, start: tok.start, end: tok.end });
    }
    if (tok.name === "html") ops.push({ kind: "html", raw: tok.raw, start: tok.start, end: tok.end });
  });

  for (const name of ["head", "switcher", "footer-lang", "legal-notice"]) {
    const open = `<!--i18n:${name}-->`;
    const close = `<!--/i18n:${name}-->`;
    let from = 0;
    for (;;) {
      const s = html.indexOf(open, from);
      if (s < 0) break;
      const e = html.indexOf(close, s);
      if (e < 0) {
        errors.push(`${file}: ${open} has no matching ${close}`);
        break;
      }
      ops.push({ kind: "marker", name, start: s + open.length, end: e });
      from = e + close.length;
    }
  }

  return { ops, keys };
}

/** One page, one language. */
function renderPage(html, plan, page, locale, dict, en, active, errors) {
  const L = LOCALES.find((l) => l.code === locale);
  const t = (key) => lookup(dict, key) ?? lookup(en, key) ?? `⟨${key}⟩`;

  const edits = plan.ops.map((op) => {
    switch (op.kind) {
      case "content": {
        let value = t(op.key);
        if (op.markClass) {
          const marks = (value.match(/<mark>/g) || []).length;
          if (marks !== 1 || !value.includes("</mark>")) {
            errors.push(`${locale}/${page.file}: "${op.key}" must contain exactly one <mark>…</mark> pair`);
            value = value.replace(/<\/?mark>/g, "");
            return { start: op.start, end: op.end, text: value };
          }
          value = value.replace("<mark>", `<span class="${op.markClass}">`).replace("</mark>", `${op.deco ?? ""}</span>`);
        }
        return { start: op.start, end: op.end, text: value };
      }
      case "attrs": {
        let raw = op.raw;
        for (const [attr, key] of op.pairs) raw = setAttr(raw, attr, t(key));
        return { start: op.start, end: op.end, text: raw };
      }
      case "html": {
        let raw = setAttr(op.raw, "lang", L.html);
        raw = setAttr(raw, "dir", L.dir);
        return { start: op.start, end: op.end, text: raw };
      }
      case "marker": {
        const body =
          op.name === "head" ? headBlock(locale, page, active)
          : op.name === "switcher" ? switcherBlock(locale, page, active, t)
          : op.name === "footer-lang" ? footerLangBlock(locale, page, active, t)
          : legalNoticeBlock(locale, t);
        return { start: op.start, end: op.end, text: body ? `\n${body}\n` : "" };
      }
      default:
        throw new Error(`unknown op ${op.kind}`);
    }
  });

  // Links LAST, and over the finished document: strings carry anchors of their
  // own (the privacy footer, the schools DPA line), and those have to be
  // localized too. One rule, applied everywhere, after everything.
  return rewriteLinks(applyEdits(html, edits), locale);
}

function rewriteLinks(html, locale) {
  if (locale === DEFAULT_LOCALE) return html;
  const edits = [];
  for (const tok of scanTags(html)) {
    if (tok.isClose) continue;
    const a = parseAttrs(tok.raw);
    let raw = tok.raw;
    let touched = false;
    for (const attr of ["href", "src"]) {
      if (!a[attr]) continue;
      const next = localizeUrl(a[attr], locale);
      if (next !== a[attr]) {
        raw = setAttr(raw, attr, next);
        touched = true;
      }
    }
    if (touched) edits.push({ start: tok.start, end: tok.end, text: raw });
  }
  return applyEdits(html, edits);
}

/* ══════════════════════════════════════════════════════════════════════════
   SIDE FILES
   ══════════════════════════════════════════════════════════════════════════ */

/** The pricing page renders its plan cards from pricing.config.js at runtime,
 * so its copy never appears in pricing.html and cannot be substituted like the
 * rest. This ships that copy as a flat lookup the page reads instead — prices,
 * checkout links and plan structure stay in pricing.config.js (still written
 * once), and only the WORDS come from here. */
function pricingStrings(locale, dict, en) {
  const merged = {};
  for (const key of allKeys(en)) if (key.startsWith("pricing.")) merged[key] = lookup(dict, key) ?? lookup(en, key);
  return `/* Generated by build-i18n.mjs — do not edit. Source: strings/${locale}.json */\nwindow.SKETCHCAST_I18N_LOCALE=${JSON.stringify(locale)};\nwindow.SKETCHCAST_I18N=${JSON.stringify(merged, null, 0)};\n`;
}

function sitemap(active, lastmod) {
  const rows = [];
  for (const l of active) {
    for (const page of PAGES) {
      const alts = active
        .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.html}" href="${escapeXml(urlFor(a.code, page.route))}"/>`)
        .join("\n");
      rows.push(
        `  <url>\n    <loc>${escapeXml(urlFor(l.code, page.route))}</loc>\n    <lastmod>${lastmod}</lastmod>\n${alts}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(urlFor(DEFAULT_LOCALE, page.route))}"/>\n  </url>`,
      );
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated by build-i18n.mjs — do not edit. -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${rows.join("\n")}\n</urlset>\n`;
}

const robots = () => `# Generated by build-i18n.mjs — do not edit.\nUser-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;

/** The no-cache rules for the generated locale trees, written between markers
 * in _headers so the hand-written English rules above them stay untouched. */
function headersBlock(active, current) {
  const begin = "# i18n:begin — generated by build-i18n.mjs, do not edit by hand";
  const end = "# i18n:end";
  const body = active
    .filter((l) => l.code !== DEFAULT_LOCALE)
    .map((l) => `/${l.code}/*\n  Cache-Control: no-cache`)
    .join("\n");
  const block = `${begin}\n${body || "# (no translated locales yet)"}\n${end}`;
  const s = current.indexOf(begin);
  if (s < 0) return `${current.trimEnd()}\n\n${block}\n`;
  const e = current.indexOf(end, s);
  return `${current.slice(0, s)}${block}${current.slice(e + end.length)}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN
   ══════════════════════════════════════════════════════════════════════════ */

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes("--check");
const QUIET = argv.includes("--quiet");
const errors = [];
const warnings = [];
const say = (msg) => {
  if (!QUIET) console.log(msg);
};

const en = readJson(join(STRINGS, "en.json"));
const enKeys = new Set(allKeys(en));

// Which languages exist TODAY. A locale is live the moment strings/<code>.json
// appears — no list to update, and nothing links to a page we have not built.
const present = new Set(
  readdirSync(STRINGS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5)),
);
for (const f of present) if (!LOCALES.some((l) => l.code === f)) warnings.push(`strings/${f}.json is not one of the ten registry locales — ignored`);
const active = LOCALES.filter((l) => present.has(l.code));
if (!active.some((l) => l.code === DEFAULT_LOCALE)) throw new Error("strings/en.json is required");

// ── validate every translation against the English schema ──────────────────
const dicts = new Map([["en", en]]);
for (const l of active) {
  if (l.code === DEFAULT_LOCALE) continue;
  const dict = readJson(join(STRINGS, `${l.code}.json`));
  dicts.set(l.code, dict);
  const keys = new Set(allKeys(dict));
  for (const k of enKeys) if (!keys.has(k)) errors.push(`strings/${l.code}.json: missing key "${k}"`);
  for (const k of keys) if (!enKeys.has(k)) errors.push(`strings/${l.code}.json: unknown key "${k}" (not in en.json)`);
  for (const k of keys) {
    if (!enKeys.has(k)) continue;
    const a = markupSignature(lookup(en, k) ?? "");
    const b = markupSignature(lookup(dict, k) ?? "");
    if (a !== b) errors.push(`strings/${l.code}.json: "${k}" changed its inline markup\n    en: ${a || "(none)"}\n    ${l.code}: ${b || "(none)"}`);
    const enVars = (lookup(en, k)?.match(/\{\w+\}/g) || []).sort().join(",");
    const trVars = (lookup(dict, k)?.match(/\{\w+\}/g) || []).sort().join(",");
    if (enVars !== trVars) errors.push(`strings/${l.code}.json: "${k}" placeholders differ (en: ${enVars || "none"}, ${l.code}: ${trVars || "none"})`);
  }
}

// ── plan every page, and reconcile markup against en.json ──────────────────
const plans = new Map();
const used = new Set();
let lastmod = "1970-01-01";
for (const page of PAGES) {
  const path = join(ROOT, page.file);
  if (!existsSync(path)) {
    errors.push(`missing page ${page.file}`);
    continue;
  }
  const html = readFileSync(path, "utf8");
  const plan = planPage(html, page.file, errors);
  plans.set(page.file, { html, plan });
  for (const k of plan.keys) {
    used.add(k);
    if (!enKeys.has(k)) errors.push(`${page.file}: data-i18n="${k}" has no entry in strings/en.json`);
  }
  const d = statSync(path).mtime.toISOString().slice(0, 10);
  if (d > lastmod) lastmod = d;
}
for (const k of enKeys) {
  if (used.has(k)) continue;
  if (GENERATOR_OWNED.some((p) => k.startsWith(p))) continue;
  warnings.push(`strings/en.json: "${k}" is never used by any page`);
}

// DRIFT. The English pages are both the source you edit and the English pages
// we serve, so the one way to lose work here is to fix a typo in index.html,
// not in strings/en.json, and have the next build quietly put the typo back.
// Comparing each annotated element against the string that will replace it
// turns that into a warning you see the moment it happens.
const squash = (s) => s.replace(/\s+/g, " ").trim();
for (const page of PAGES) {
  const entry = plans.get(page.file);
  if (!entry) continue;
  for (const op of entry.plan.ops) {
    if (op.kind !== "content") continue;
    const current = squash(entry.html.slice(op.start, op.end));
    let expected = lookup(en, op.key) ?? "";
    if (op.markClass) expected = expected.replace("<mark>", `<span class="${op.markClass}">`).replace("</mark>", `${op.deco ?? ""}</span>`);
    if (squash(expected) !== current) {
      warnings.push(`${page.file}: the page text for "${op.key}" differs from strings/en.json — the build will overwrite it. Move the edit into strings/en.json.`);
    }
  }
}

for (const w of warnings) console.warn(`warn  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error ${e}`);
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}
say(`✓ ${enKeys.size} keys · ${used.size} used in markup · ${active.length}/${LOCALES.length} languages present`);

if (CHECK_ONLY) {
  say("--check: nothing written.");
  process.exit(0);
}

// ── write ──────────────────────────────────────────────────────────────────
const renderErrors = [];
let written = 0;
for (const l of active) {
  const dir = l.code === DEFAULT_LOCALE ? ROOT : join(ROOT, l.code);
  if (l.code !== DEFAULT_LOCALE) mkdirSync(dir, { recursive: true });
  for (const page of PAGES) {
    const { html, plan } = plans.get(page.file);
    const out = renderPage(html, plan, page, l.code, dicts.get(l.code), en, active, renderErrors);
    writeFileSync(join(dir, page.file), out, "utf8");
    written++;
  }
  writeFileSync(join(dir, "pricing.i18n.js"), pricingStrings(l.code, dicts.get(l.code), en), "utf8");
}
writeFileSync(join(ROOT, "sitemap.xml"), sitemap(active, lastmod), "utf8");
writeFileSync(join(ROOT, "robots.txt"), robots(), "utf8");
const headersPath = join(ROOT, "_headers");
writeFileSync(headersPath, headersBlock(active, readFileSync(headersPath, "utf8")), "utf8");

if (renderErrors.length) {
  for (const e of renderErrors) console.error(`error ${e}`);
  process.exit(1);
}
say(`✓ wrote ${written} pages + ${active.length} pricing string files, sitemap.xml, robots.txt, _headers`);
