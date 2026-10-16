#!/usr/bin/env node
/* SketchCast marketing site — the mechanical check on the generated topic pages.
 *
 *   node check-topics.mjs                                   check what is on disk
 *   node check-topics.mjs --before <sitemap-topics.xml>     ...and compare with a
 *        [--allow-shrink] [--summary <file>]                 previous sitemap
 *
 * Runs after build-topics.mjs (locally, and in .github/workflows/topics.yml
 * before anything is committed). It exits 1 and says why when:
 *
 *   - sitemap-topics.xml is missing, empty, or names a page that is not on disk;
 *   - a language is missing its index or any topic page, or has a page for a
 *     topic the sitemap does not know (a stale file the clean rebuild missed);
 *   - an English page has no lesson video, no <title>, an unfilled {placeholder}
 *     from strings/topics/<locale>.json, or is cut short (no </html>);
 *   - with --before: the catalogue lost more than a fifth of its topics since
 *     that sitemap. A half-answered RPC must not unpublish forty lessons
 *     overnight. A deliberate cull passes with --allow-shrink.
 *
 * With --summary it writes a commit message: the topic count, what was added
 * and removed since --before, one slug per line.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE = "https://sketchcast.app";
// Same registry as build-topics.mjs (which mirrors build-i18n.mjs).
const LOCALES = ["en", "ms", "ar", "fr", "es", "pt", "te", "mr", "hi", "ms-arab"];
const DEFAULT = "en";
const MAX_SHRINK = 0.2;

const argv = process.argv.slice(2);
const arg = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
};
const BEFORE = arg("--before");
const SUMMARY = arg("--summary");
const ALLOW_SHRINK = argv.includes("--allow-shrink");

const errors = [];
const fail = (s) => errors.push(s);

/* ── the sitemap is the list of record ────────────────────────────────── */

function slugsOf(xml) {
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const slugs = [];
  for (const loc of locs) {
    if (loc === `${SITE}/topics`) continue;
    const m = loc.match(/^https:\/\/sketchcast\.app\/topics\/([a-z0-9-]+)$/);
    if (!m) fail(`sitemap-topics.xml: unexpected <loc> ${loc}`);
    else slugs.push(m[1]);
  }
  return { hasIndex: locs.includes(`${SITE}/topics`), slugs };
}

const sitemapPath = join(ROOT, "sitemap-topics.xml");
if (!existsSync(sitemapPath)) {
  console.error("error sitemap-topics.xml is missing — run build-topics.mjs first");
  process.exit(1);
}
const { hasIndex, slugs } = slugsOf(readFileSync(sitemapPath, "utf8"));
if (!hasIndex) fail("sitemap-topics.xml does not list /topics");
if (slugs.length === 0) fail("sitemap-topics.xml lists no topic pages");
if (new Set(slugs).size !== slugs.length) fail("sitemap-topics.xml lists a slug twice");

/* ── every language has exactly the sitemap's pages ───────────────────── */

for (const code of LOCALES) {
  const base = code === DEFAULT ? ROOT : join(ROOT, code);
  const where = code === DEFAULT ? "" : `${code}/`;
  if (!existsSync(join(base, "topics.html"))) fail(`${where}topics.html is missing`);
  const dir = join(base, "topics");
  if (!existsSync(dir)) {
    fail(`${where}topics/ is missing`);
    continue;
  }
  const onDisk = new Set(readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5)));
  for (const s of slugs) if (!onDisk.has(s)) fail(`${where}topics/${s}.html is missing`);
  for (const s of onDisk) if (!slugs.includes(s)) fail(`${where}topics/${s}.html is not in sitemap-topics.xml (stale file?)`);
}

/* ── the pages are whole ──────────────────────────────────────────────── */

function checkPage(file, { video }) {
  const path = join(ROOT, file);
  if (!existsSync(path)) return; // reported above
  const html = readFileSync(path, "utf8");
  if (!/<title>[^<]{3,}<\/title>/.test(html)) fail(`${file}: no <title>`);
  if (!/<\/html>\s*$/.test(html)) fail(`${file}: cut short — no closing </html>`);
  // The player is a facade: the poster carries data-yt and the embed URL is
  // built on click (build-topics.mjs videoBlock + JS). English pages also
  // name the embed in JSON-LD; translated pages carry no JSON-LD.
  if (video && !/data-yt="[\w-]{6,}"/.test(html) && !/youtube(-nocookie)?\.com\/embed\/[\w-]{6,}/.test(html)) fail(`${file}: no lesson video`);
  // build-topics.mjs's fill() leaves "{name}" standing when a string from
  // strings/topics/<locale>.json asks for a variable the page did not supply.
  const unfilled = html.match(/>[^<{]*\{[a-zA-Z]+\}[^<]*</g);
  if (unfilled) fail(`${file}: unfilled placeholder ${unfilled[0].trim()}`);
}

checkPage("topics.html", { video: false });
for (const s of slugs) checkPage(`topics/${s}.html`, { video: true });
// One translated page per language, so a broken chrome string shows up without
// reading all 520 files.
for (const code of LOCALES) if (code !== DEFAULT) checkPage(`${code}/topics/${slugs[0]}.html`, { video: true });

/* ── compared with last time ──────────────────────────────────────────── */

let added = [];
let removed = [];
let before = null;
if (BEFORE) {
  if (!existsSync(BEFORE)) {
    fail(`--before ${BEFORE} does not exist`);
  } else {
    const prev = new Set(slugsOf(readFileSync(BEFORE, "utf8")).slugs);
    before = prev.size;
    added = slugs.filter((s) => !prev.has(s));
    removed = [...prev].filter((s) => !slugs.includes(s));
    const floor = Math.ceil(before * (1 - MAX_SHRINK));
    if (before > 0 && slugs.length < floor) {
      const msg = `the catalogue shrank from ${before} to ${slugs.length} topics (more than ${MAX_SHRINK * 100}%): ${removed.join(", ")}`;
      if (ALLOW_SHRINK) console.warn(`warn  ${msg} — accepted (--allow-shrink)`);
      else fail(`${msg}. If this is intended, re-run with --allow-shrink.`);
    }
  }
}

/* ── verdict ──────────────────────────────────────────────────────────── */

if (errors.length) {
  for (const e of errors) console.error(`error ${e}`);
  process.exit(1);
}

const delta = before === null ? "" : ` (${added.length ? `+${added.length}` : "±0"}${removed.length ? ` −${removed.length}` : ""})`;
const headline = `Free lessons: ${slugs.length} topics${delta}`;
console.log(`✓ ${headline} — ${LOCALES.length} languages, every page present and whole`);

if (SUMMARY) {
  const lines = [headline, ""];
  if (added.length) lines.push("Added:", ...added.map((s) => `  /topics/${s}`), "");
  if (removed.length) lines.push("Removed:", ...removed.map((s) => `  /topics/${s}`), "");
  lines.push("Rebuilt from public_catalogue() by .github/workflows/topics.yml.");
  writeFileSync(SUMMARY, lines.join("\n") + "\n", "utf8");
}
