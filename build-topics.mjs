#!/usr/bin/env node
/* SketchCast marketing site — the free-lesson pages (/topics).
 *
 * WHAT THIS IS. The catalogue's public face: one page per approved topic (the
 * YouTube lesson, the written explanation, key terms, worked examples, common
 * misconceptions, curriculum alignment) and an index of them all. Data comes
 * from the app database's anon-safe projection, public_catalogue() (migration
 * 0128): the same rows any visitor's browser could read, never a path, an id,
 * a question or an answer.
 *
 *   node build-topics.mjs                 fetch from Supabase, write pages
 *   node build-topics.mjs --from file.json  build from a saved copy (offline)
 *
 * RUN ORDER. After build-i18n.mjs: each language's topic pages are cut from that
 * language's BUILT schools page (head, fonts, header, language switcher,
 * footer), so the chrome is never written twice and a nav change reaches the
 * topic pages on the next build.
 *
 * LANGUAGES. The page chrome comes from strings/topics/<locale>.json. The
 * lesson content is the topic's kit in THAT language when the Kit Translator
 * has one with a public video (public_catalogue() returns one row per topic
 * and language): the page is then in that language, indexable, and linked to
 * its other versions by hreflang. Otherwise the page wraps the English
 * content in lang="en" dir="ltr" and is `noindex, follow` with its canonical
 * on the English page, so search engines index one copy of each lesson.
 *
 * KITS. The full kit sits behind sign-in. Until the founder releases it
 * (platform_settings.catalogue_release in the app, migration 0130), every page
 * says "Coming soon"; flip KITS_RELEASED here at the same time.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
/** "slug|language" → [{kind, file}] of downloaded preview cards; filled in main() before any page renders. */
let PREVIEWS = new Map();
const ORIGIN = "https://sketchcast.app";
const APP = "https://app.sketchcast.app";

// The public Supabase endpoint and PUBLISHABLE key: by design not secret (the
// app ships the same key to every browser). public_catalogue() is the only
// thing it reads.
const SUPABASE_URL = "https://pblaxsqhjwlqbrwbraxy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_WkV7khrwzkaj8FlyQ1lLag_rJHOyFPi";

// Flip together with the app's catalogue_release switch.
const KITS_RELEASED = true;

// Same order as build-i18n.mjs's registry.
const LOCALES = [
  { code: "en", html: "en", dir: "ltr" },
  { code: "ms", html: "ms", dir: "ltr" },
  { code: "ar", html: "ar", dir: "rtl" },
  { code: "fr", html: "fr", dir: "ltr" },
  { code: "es", html: "es", dir: "ltr" },
  { code: "pt", html: "pt", dir: "ltr" },
  { code: "te", html: "te", dir: "ltr" },
  { code: "mr", html: "mr", dir: "ltr" },
  { code: "hi", html: "hi", dir: "ltr" },
  { code: "ms-arab", html: "ms-Arab", dir: "rtl" },
];
const DEFAULT = "en";

/* ── data ─────────────────────────────────────────────────────────────── */

async function loadCatalogue() {
  const i = process.argv.indexOf("--from");
  if (i > 0) return JSON.parse(readFileSync(process.argv[i + 1], "utf8"));
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_catalogue`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`public_catalogue: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function loadRedirects() {
  if (process.argv.includes("--from")) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_catalogue_redirects`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  return res.ok ? res.json() : [];
}

/* ── text helpers ─────────────────────────────────────────────────────── */

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const plain = (md) => String(md ?? "").replace(/\*\*?/g, "").replace(/\s+/g, " ").trim();
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");

// Inline markdown: the subset the articles use (surveyed 2026-10-16): **bold**,
// *italic*, and ^ exponents (10^8, r^2, 10^-3, x^(n+1)). Escaped first.
function inline(md) {
  let s = esc(md);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, "$1<em>$2</em>");
  s = s.replace(/([\w)\]])\^\(([^)]{1,40})\)/g, "$1<sup>$2</sup>");
  s = s.replace(/([\w)\]])\^(-?[\w.]{1,6})/g, "$1<sup>$2</sup>");
  return s;
}

// Block markdown: paragraphs, - / * bullets, 1. / 1) numbered lists, and
// pipe tables. No headings, links, code or raw HTML occur in the articles.
function markdown(md) {
  const out = [];
  const blocks = String(md ?? "").replace(/\r/g, "").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*\|.*\|\s*$/.test(l))) {
      const rows = lines
        .filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l))
        .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      const [head, ...body] = rows;
      out.push(
        `<div class="t-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` +
          `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
      );
      continue;
    }
    // A single newline is meaningful in this content (a worked solution's
    // "Step 1: … / Step 2: …" lines), so each line is its own paragraph and
    // a leading "Step N:" is set in bold.
    let para = [];
    let list = null; // { tag, items }
    const flushPara = () => {
      for (const line of para) out.push(`<p>${inline(line).replace(/^(Step \d+[:.])/, "<strong>$1</strong>")}</p>`);
      para = [];
    };
    const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`); list = null; };
    for (const line of lines) {
      const ul = line.match(/^\s*[-*]\s+(.*)$/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        flushPara();
        const tag = ul ? "ul" : "ol";
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push((ul || ol)[1]);
      } else if (list && /^\s{2,}\S/.test(line)) {
        list.items[list.items.length - 1] += " " + line.trim();
      } else {
        flushList();
        para.push(line.trim());
      }
    }
    flushPara();
    flushList();
  }
  return out.join("\n");
}

/* ── strings ──────────────────────────────────────────────────────────── */

const STR_DIR = join(ROOT, "strings", "topics");
const strings = Object.fromEntries(
  LOCALES.map((l) => [l.code, JSON.parse(readFileSync(join(STR_DIR, `${l.code}.json`), "utf8"))]),
);
{
  const keys = Object.keys(strings.en).filter((k) => !k.startsWith("_"));
  for (const l of LOCALES) {
    for (const k of keys) if (!(k in strings[l.code])) throw new Error(`strings/topics/${l.code}.json: missing "${k}"`);
    for (const k of Object.keys(strings[l.code])) if (!k.startsWith("_") && !(k in strings.en)) throw new Error(`strings/topics/${l.code}.json: unknown "${k}"`);
  }
}
const subjectLabel = (t, subject) => t[`subject.${subject}`] ?? subject;

/* ── URLs ─────────────────────────────────────────────────────────────── */

const prefix = (code) => (code === DEFAULT ? "" : `/${code}`);
const indexUrl = (code) => `${ORIGIN}${prefix(code)}/topics`;
const topicUrl = (code, slug) => `${ORIGIN}${prefix(code)}/topics/${slug}`;

/* ── translated kits ──────────────────────────────────────────────────── */
// "slug|language" → that language's catalogue row, for every non-English
// row with a public video and a locale this site has. Filled in main().
let LOCAL = new Map();
const langOf = (row) => row.language || DEFAULT;
/** The row a page in `code` shows for an English topic: its own language's
 * kit when there is one, else the English row. */
const localRow = (topic, code) => (code === DEFAULT ? topic : LOCAL.get(`${topic.slug}|${code}`) || topic);
/** The locales that have their own version of a topic (English first). */
const versionsOf = (slug) => LOCALES.filter((l) => l.code === DEFAULT || LOCAL.has(`${slug}|${l.code}`)).map((l) => l.code);
/** A row's own words for a description: the English summary, or (the
 * summary is not translated) the opening of the first section. */
function summaryOf(row) {
  if (langOf(row) === DEFAULT) return row.summary || "";
  const first = (row.sections || []).find((x) => x && (x.body_md || "").trim());
  return first ? clip(plain(first.body_md), 220) : "";
}
/** A section's anchor: its heading when that has Latin letters, else its id. */
const anchorOf = (sec, i) => slugify(sec.heading || "") || slugify(sec.id || "") || `s${i + 1}`;

/* ── the shell: each language's BUILT schools page ────────────────────── */

function shell(code) {
  const file = code === DEFAULT ? join(ROOT, "schools.html") : join(ROOT, code, "schools.html");
  const html = readFileSync(file, "utf8");
  const mainStart = html.indexOf("<main>");
  const mainEnd = html.indexOf("</main>");
  const headStart = html.indexOf("<!--i18n:head-->");
  const headEnd = html.indexOf("<!--/i18n:head-->");
  const swStart = html.indexOf("<!--i18n:switcher-->");
  const swEnd = html.indexOf("<!--/i18n:switcher-->");
  if ([mainStart, mainEnd, headStart, headEnd, swStart, swEnd].some((i) => i < 0)) {
    throw new Error(`${file}: missing <main> or an i18n marker — run build-i18n.mjs first`);
  }
  return { html, mainStart, mainEnd, headStart, headEnd, swStart, swEnd };
}

/* Assemble one page from a shell: new <title>/description/og, a head block
 * (canonical, hreflang, robots) that keeps the shell's per-script font CSS,
 * the switcher re-pointed at this page, nav "current" moved to Lessons, and
 * our <main>. */
function page(code, { route, title, description, ogType = "website", jsonLd = [], main, alternates, versions = [DEFAULT] }) {
  const s = shell(code);
  const loc = LOCALES.find((l) => l.code === code);
  let head = s.html.slice(0, s.headStart);
  head = head
    .replace(/<title[^>]*>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*\/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace(/<meta property="og:title"[^>]*\/>/, `<meta property="og:title" content="${esc(title)}" />`)
    .replace(/<meta property="og:description"[^>]*\/>/, `<meta property="og:description" content="${esc(description)}" />`)
    .replace(/<meta property="og:type"[^>]*\/>/, `<meta property="og:type" content="${ogType}" />`)
    .replace(/<script type="application\/ld\+json"[\s\S]*?<\/script>\s*/g, "");

  // Keep the shell head block's typography/CSS lines; replace its URL lines.
  const oldBlock = s.html.slice(s.headStart + "<!--i18n:head-->".length, s.headEnd);
  const keep = oldBlock
    .split("\n")
    .filter((l) => !/rel="canonical"|rel="alternate"|property="og:url"|property="og:locale/.test(l))
    .join("\n");
  // A page is indexable when its language has its own version of the route
  // (English always; a translated lesson when its kit exists).
  const indexable = versions.includes(code);
  const canonical = indexable ? `${ORIGIN}${prefix(code)}${route}` : `${ORIGIN}${route}`;
  const links = [`  <link rel="canonical" href="${canonical}" />`];
  if (!indexable) links.push(`  <meta name="robots" content="noindex, follow" />`);
  // hreflang only between the versions that exist, plus x-default (English).
  const indexed = LOCALES.filter((l) => versions.includes(l.code));
  if (indexed.length > 1) {
    for (const l of indexed) links.push(`  <link rel="alternate" hreflang="${l.html}" href="${alternates(l.code)}" />`);
    links.push(`  <link rel="alternate" hreflang="x-default" href="${alternates(DEFAULT)}" />`);
  }
  links.push(`  <meta property="og:url" content="${canonical}" />`);
  const ld = jsonLd.map((o) => `  <script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`);
  const headBlock = `<!--i18n:head-->\n${links.join("\n")}\n${ld.join("\n")}${keep}`;

  let middle = s.html.slice(s.headEnd, s.swStart);
  middle = middle
    .replace("</head>", `<style id="topics-css">${CSS}</style>\n</head>`)
    .replace(/ aria-current="page"/g, "")
    .replace(/(<a [^>]*href="[^"]*\/topics" )(data-i18n="common\.nav\.lessons")/g, '$1aria-current="page" $2');

  // Language switcher: every language links to THIS page in that language.
  let sw = s.html.slice(s.swStart, s.swEnd);
  sw = sw.replace(/href="https:\/\/sketchcast\.app(?:\/[a-z-]+)?\/schools"/g, (m) => {
    const code2 = (m.match(/sketchcast\.app\/([a-z-]+)\/schools/) || [, DEFAULT])[1];
    return `href="${alternates(LOCALES.some((l) => l.code === code2) ? code2 : DEFAULT)}"`;
  });

  let tail = s.html.slice(s.swEnd, s.mainStart);
  const foot = s.html.slice(s.mainEnd + "</main>".length).replace(/ aria-current="page"/g, "");
  return `${head}${headBlock}${middle}${sw}${tail}<main>\n${main}\n</main>${foot}`.replace(
    /<html lang="[^"]*" dir="[^"]*">/,
    `<html lang="${loc.html}" dir="${loc.dir}">`,
  );
}

/* ── pieces ───────────────────────────────────────────────────────────── */

const thumb = (id) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
const watchUrl = (id, t) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}${t ? `&t=${t}s` : ""}`;
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function stageOf(topic) {
  const grades = [...new Set((topic.curriculum || []).map((c) => c.grade).filter(Boolean))];
  return grades;
}

/* Branch (founder, 2026-10-16): Mathematics splits into Algebra / Geometry,
 * Science into Physics / Chemistry / Biology (+ Earth & space for the one
 * climate lesson). Derived from the curriculum nodes' strands (migration
 * 0131 exposes them): Cambridge strands map directly; CBSE's own strand
 * names map onto the same five. A topic with several strands takes the
 * majority. The two unmapped geometry lessons fall back to title keywords. */
const BRANCH_OF_STRAND = {
  Algebra: "algebra",
  Geometry: "geometry", "Coordinate Geometry": "geometry", "Geometry and measure": "geometry", Mensuration: "geometry",
  Biology: "biology", "The World of the Living": "biology", "Natural Resources": "biology",
  Chemistry: "chemistry", Materials: "chemistry",
  Physics: "physics", "Natural Phenomena": "physics", "Moving Things, People and Ideas": "physics",
  "Earth and Space": "earth",
};
const BRANCHES = { Mathematics: ["algebra", "geometry"], Science: ["physics", "chemistry", "biology", "earth"] };
function branchOf(topic) {
  const votes = {};
  for (const c of topic.curriculum || []) {
    const b = BRANCH_OF_STRAND[c.strand];
    if (b && (BRANCHES[topic.subject] || []).includes(b)) votes[b] = (votes[b] || 0) + 1;
  }
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  if (topic.subject === "Mathematics") {
    return /\b(angles?|triangles?|areas?|perimeters?|circles?|pythagoras|volumes?|shapes?|polygons?|symmetry|surface)\b/i.test(topic.title) ? "geometry" : "algebra";
  }
  return null;
}

/* Curriculum filter keys: "<family>:<grade>" (e.g. cambridge:7, cbse:9) from
 * the mapped nodes; a topic mapped to both boards carries both. */
const familyOf = (code) => (String(code || "").startsWith("cambridge") ? "cambridge" : String(code || "").startsWith("cbse") ? "cbse" : null);
const FAMILY_NAME = { cambridge: "Cambridge", cbse: "CBSE" };
function curriculaOf(topic) {
  const keys = new Set();
  for (const c of topic.curriculum || []) {
    const f = familyOf(c.curriculum_code);
    if (f && c.grade) keys.add(`${f}:${c.grade}`);
  }
  return [...keys].sort();
}
// Family first, then grade as a NUMBER (so Grade 6 precedes Grade 10).
const sortCur = (keys) => [...new Set(keys)].sort((a, b) => {
  const [fa, ga] = a.split(":"), [fb, gb] = b.split(":");
  return fa.localeCompare(fb) || Number(ga) - Number(gb);
});
const curriculumLabel = (t, key) => {
  const [f, g] = key.split(":");
  return `${FAMILY_NAME[f] || f} ${fill(t.grade, { g })}`;
};
const branchLabel = (t, b) => t[`branch.${b}`] || b;

/* Free-text search (founder, 2026-10-16: "cells" finds every lesson with
 * cells in the title, description or article). Each lesson carries a
 * de-duplicated, lower-cased word list rather than its full text, so the
 * index page stays light; the browser then requires every typed word to be a
 * PREFIX of some word in the list ("cell" matches cells/cellular/cellulose).
 * `full` adds the article body, worked examples and misconceptions (used on
 * /topics); the homepage strip uses the lighter list (title, summary,
 * objectives, key terms, section headings). */
function searchTokens(topic, full) {
  const parts = [topic.title, topic.summary, topic.subject];
  for (const o of topic.objectives || []) parts.push(typeof o === "string" ? o : o.text);
  for (const g of topic.key_concepts || []) parts.push(g.term, full ? g.definition : "");
  for (const s of topic.sections || []) parts.push(s.heading, full ? s.body_md : "");
  if (full) {
    for (const w of topic.worked_examples || []) parts.push(w.problem, w.solution_md);
    for (const m of topic.misconceptions || []) parts.push(m.misconception, m.correction);
  }
  for (const c of topic.curriculum || []) parts.push(c.title, String(c.code || "").replace(/^cbse:/, ""));
  const words = new Set();
  for (const p of parts) {
    for (const w of String(p || "").toLowerCase().replace(/\p{M}+/gu, "").replace(/[*_#|`]/g, " ").split(/[^\p{L}\p{N}'’.-]+/u)) {
      const t = w.replace(/^[.'’-]+|[.'’-]+$/g, "");
      if (t.length >= 2) words.add(t);
    }
  }
  return [...words].join(" ");
}

function curriculumSummary(topic) {
  const by = new Map();
  for (const c of topic.curriculum || []) {
    if (!by.has(c.curriculum)) by.set(c.curriculum, []);
    by.get(c.curriculum).push(c);
  }
  return by;
}

function kitItems(topic, t) {
  const items = [];
  const has = new Set(topic.kit_pieces || []);
  for (const k of ["lesson_plan", "deck", "worksheet", "activity", "case_study"]) if (has.has(k)) items.push(t[`kit.${k}`]);
  // The PRINTABLE bank (catalogue Phase D) names the same questions as the
  // count line did; one line, not two.
  if (has.has("question_bank")) items.push(fill(t["kit.question_bank"], { n: topic.question_count }));
  else if (topic.question_count >= 10) items.push(fill(t["kit.questions"], { n: topic.question_count }));
  if (topic.has_online_assessment) items.push(t["kit.assessment"]);
  if (topic.exam_ready) items.push(t["kit.exam"]);
  return items;
}

function videoBlock(topic, t) {
  const parts = topic.videos || [];
  const chaptersFor = (p) => ((topic.chapters || []).find((c) => c.part === p.part)?.chapters || []).filter((c) => c && typeof c.t === "number");
  return parts
    .map((p) => {
      const label = parts.length > 1 ? `<h3 class="t-part">${esc(fill(t.part, { n: p.part }))}</h3>` : "";
      const ch = chaptersFor(p);
      const chapters = ch.length
        ? `<details class="t-chapters"><summary>${esc(t.chapters)}</summary><ol>${ch
            .map((c) => `<li><a href="${watchUrl(p.youtube_video_id, c.t)}" target="_blank" rel="noopener"><span class="t-time">${mmss(c.t)}</span> ${inline(c.label)}</a></li>`)
            .join("")}</ol></details>`
        : "";
      return `${label}
      <div class="t-video">
        <button type="button" class="t-play" data-yt="${esc(p.youtube_video_id)}" aria-label="${esc(fill(t.play, { title: topic.title }))}">
          <img src="${thumb(p.youtube_video_id)}" alt="" width="480" height="360" loading="${p.part === 1 ? "eager" : "lazy"}" />
          <span class="t-play-icon" aria-hidden="true"><svg viewBox="0 0 68 48" width="68" height="48"><path d="M66.5 7.7A8.5 8.5 0 0 0 60.5 1.6C55.2.2 34 .2 34 .2s-21.2 0-26.5 1.4A8.5 8.5 0 0 0 1.5 7.7C.1 13 .1 24 .1 24s0 11 1.4 16.3a8.5 8.5 0 0 0 6 6.1C12.8 47.8 34 47.8 34 47.8s21.2 0 26.5-1.4a8.5 8.5 0 0 0 6-6.1C67.9 35 67.9 24 67.9 24s0-11-1.4-16.3z" fill="#14181F"/><path d="M45 24 27 14v20z" fill="#fff"/></svg></span>
        </button>
      </div>
      <p class="t-yt"><a href="${watchUrl(p.youtube_video_id)}" target="_blank" rel="noopener">${esc(t.watchOnYouTube)} ↗</a></p>
      ${chapters}`;
    })
    .join("\n");
}

/* ── preview cards (plan §4.4) ───────────────────────────────────────────
   The worker renders low-resolution, "PREVIEW"-watermarked cards of the deck's
   title and first content slide, page 1 of the lesson plan and page 1 of the
   student worksheet (catalogue/previews.py); public_catalogue() hands their
   public URLs over as `previews`. They are copied into the site at build time
   so the pages never hot-link the bucket, and a card that fails to download
   is simply left out. */
const PREVIEW_DIR = join(ROOT, "assets", "previews");
const PREVIEW_LABEL = { "deck-1": "preview.deck", "deck-2": "preview.deck2", "plan-1": "preview.plan", "worksheet-1": "preview.worksheet" };

async function fetchPreviews(topics) {
  const out = new Map(); // "slug|language" → [{kind, file}]
  for (const topic of topics) {
    const list = Array.isArray(topic.previews) ? topic.previews : [];
    if (!list.length) continue;
    // English cards keep their old paths; a translated kit's sit in a
    // language folder beside them, so neither overwrites the other.
    const lang = langOf(topic);
    const rel = lang === DEFAULT ? topic.slug : `${topic.slug}/${lang}`;
    const dir = join(PREVIEW_DIR, ...rel.split("/"));
    const kept = [];
    for (const p of list) {
      const kind = String(p?.kind || "");
      const url = String(p?.url || "");
      if (!/^[a-z0-9-]{1,32}$/.test(kind) || !url.startsWith("https://")) continue;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) continue;
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${kind}.png`), buf);
        kept.push({ kind, file: `/assets/previews/${rel}/${kind}.png` });
      } catch {
        // a missing card is not a missing page
      }
    }
    if (kept.length) out.set(`${topic.slug}|${lang}`, kept);
  }
  return out;
}

function previewStrip(topic, t, previews) {
  const cards = previews.get(`${topic.slug}|${langOf(topic)}`) || [];
  if (!cards.length) return "";
  return `<section class="t-previews" aria-labelledby="prev-h">
      <h2 id="prev-h">${esc(t["preview.heading"])}</h2>
      <div class="t-prev-grid">${cards
        .map((c) => `<figure class="t-prev"><img src="${esc(c.file)}" alt="${esc(fill(t["preview.alt"], { title: topic.title, piece: t[PREVIEW_LABEL[c.kind] || "preview.deck"] }))}" loading="lazy" width="640" height="360" /><figcaption>${esc(t[PREVIEW_LABEL[c.kind] || "preview.deck"])}</figcaption></figure>`)
        .join("")}</div>
      <p class="t-prev-note">${esc(t["preview.note"])}</p>
    </section>`;
}

function kitBox(topic, t) {
  const items = kitItems(topic, t);
  const cta = KITS_RELEASED
    ? `<a class="btn btn-primary" href="${APP}/signup?topic=${encodeURIComponent(topic.slug)}">${esc(t["kit.unlock"])}</a>`
    : `<a class="btn btn-primary" href="${APP}/signup?topic=${encodeURIComponent(topic.slug)}">${esc(t["kit.signup"])}</a>`;
  return `<aside class="t-kit" aria-labelledby="kit-h">
      <p class="eyebrow">${KITS_RELEASED ? esc(t["kit.eyebrowReleased"]) : `<span class="t-soon">${esc(t["kit.comingSoon"])}</span>`}</p>
      <h2 id="kit-h">${esc(t["kit.title"])}</h2>
      <p>${esc(KITS_RELEASED ? t["kit.leadReleased"] : t["kit.lead"])}</p>
      <ul class="t-kit-list">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      ${cta}
    </aside>`;
}

/* ── the topic page ───────────────────────────────────────────────────── */

function topicMain(topic, all, code) {
  const t = strings[code];
  const subj = subjectLabel(t, topic.subject);
  const grades = stageOf(topic);
  const curric = curriculumSummary(topic);
  const sections = (topic.sections || []).filter((s) => s && (s.body_md || "").trim());
  const objectives = (topic.objectives || []).map((o) => (typeof o === "string" ? o : o.text)).filter(Boolean);
  const terms = (topic.key_concepts || []).filter((g) => g && g.term);
  const examples = (topic.worked_examples || []).filter((w) => w && w.problem);
  const misc = (topic.misconceptions || []).filter((m) => m && m.misconception);
  const related = all.filter((x) => x.slug !== topic.slug && x.subject === topic.subject).slice(0, 6);
  // `topic` is the row this page shows: its own language's kit, or English.
  const native = langOf(topic) === code;
  const contentAttrs = native ? "" : ` lang="en" dir="ltr"`;
  const note = native ? "" : `<p class="t-note">${esc(t.englishNote)}</p>`;
  // Curriculum titles are the boards' own (English) wording in every language.
  const curricAttrs = code === DEFAULT ? "" : ` lang="en" dir="ltr"`;
  // The summary is not translated; a translated page leads with no summary.
  const lead = langOf(topic) === DEFAULT ? topic.summary : "";

  const toc = sections.length > 2
    ? `<nav class="t-toc" aria-label="${esc(t.contents)}"><p class="eyebrow">${esc(t.contents)}</p><ol>${sections
        .map((s, i) => `<li><a href="#${esc(anchorOf(s, i))}">${esc(s.heading)}</a></li>`)
        .join("")}</ol></nav>`
    : "";

  return `
  <div class="wrap t-page">
    <nav class="t-crumbs" aria-label="Breadcrumb"><a href="${prefix(code)}/topics">${esc(t.breadcrumb)}</a> <span aria-hidden="true">›</span> <span>${esc(subj)}</span></nav>
    ${note}
    <div class="t-hero"${contentAttrs}>
      <p class="eyebrow">${esc(subj)}${grades.length ? ` · ${esc(fill(t.grade, { g: grades.join(", ") }))}` : ""}</p>
      <h1>${esc(topic.title)}</h1>
      ${lead ? `<p class="t-lead">${inline(lead)}</p>` : ""}
    </div>

    <div class="t-grid">
      <div class="t-body"${contentAttrs}>
        <section aria-label="${esc(t.video)}">${videoBlock(topic, t)}</section>
        ${previewStrip(topic, t, PREVIEWS)}

        ${objectives.length ? `<section class="t-card"><h2>${esc(t.objectives)}</h2><ul class="t-ticks">${objectives.map((o) => `<li>${inline(o)}</li>`).join("")}</ul></section>` : ""}

        ${toc}

        <article class="t-article">
          <h2 class="t-article-h">${esc(t.explanation)}</h2>
          ${sections.map((s, i) => `<section id="${esc(anchorOf(s, i))}"><h3>${esc(s.heading)}</h3>${markdown(s.body_md)}</section>`).join("\n")}
        </article>

        ${terms.length ? `<section class="t-card"><h2>${esc(t.keyTerms)}</h2><dl class="t-terms">${terms.map((g) => `<div><dt>${inline(g.term)}</dt><dd>${inline(g.definition || "")}</dd></div>`).join("")}</dl></section>` : ""}

        ${examples.length ? `<section><h2>${esc(t.workedExamples)}</h2>${examples
          .map((w, i) => `<div class="t-example"><p class="t-ex-q"><span class="t-ex-n">${i + 1}</span>${inline(w.problem)}</p>${w.solution_md ? `<details><summary>${esc(t.showSolution)}</summary><div class="t-ex-a">${markdown(w.solution_md)}</div></details>` : ""}</div>`)
          .join("")}</section>` : ""}

        ${misc.length ? `<section><h2>${esc(t.misconceptions)}</h2><div class="t-misc">${misc
          .map((m) => `<div class="t-misc-item"><p class="t-myth"><span>${esc(t.myth)}</span> ${inline(m.misconception)}</p>${m.correction ? `<p class="t-fact"><span>${esc(t.fact)}</span> ${inline(m.correction)}</p>` : ""}</div>`)
          .join("")}</div></section>` : ""}

        ${curric.size ? `<section class="t-card"><h2>${esc(t.curriculum)}</h2><div${curricAttrs}>${[...curric.entries()]
          .map(([name, rows]) => `<h3 class="t-cur-h">${esc(name)}</h3><ul class="t-cur">${rows.map((c) => `<li><code>${esc(String(c.code).replace(/^cbse:/, ""))}</code> ${esc(c.title)}</li>`).join("")}</ul>`)
          .join("")}</div></section>` : ""}
      </div>

      <div class="t-side">${kitBox(topic, t)}</div>
    </div>

    ${related.length ? `<section class="t-related"><h2>${esc(fill(t.related, { subject: subj }))}</h2><div class="t-cards">${related.map((r) => card(r, code)).join("")}</div></section>` : ""}
  </div>`;
}

function topicJsonLd(topic, code = DEFAULT) {
  const url = topicUrl(code, topic.slug);
  const description = summaryOf(topic) || topic.title;
  const date = (topic.approved_at || "").slice(0, 10) || undefined;
  const videos = (topic.videos || []).map((p) => ({
    "@type": "VideoObject",
    name: (topic.videos.length > 1 ? `${topic.title}, Part ${p.part}` : topic.title),
    description,
    thumbnailUrl: thumb(p.youtube_video_id),
    uploadDate: date,
    embedUrl: `https://www.youtube-nocookie.com/embed/${p.youtube_video_id}`,
    url: watchUrl(p.youtube_video_id),
  }));
  return [
    {
      "@context": "https://schema.org",
      "@type": "LearningResource",
      name: topic.title,
      description,
      url,
      inLanguage: langOf(topic),
      isAccessibleForFree: true,
      learningResourceType: "Video lesson",
      about: topic.subject,
      educationalLevel: stageOf(topic).length ? `Grade ${stageOf(topic).join(", ")}` : undefined,
      teaches: (topic.objectives || []).map((o) => (typeof o === "string" ? o : o.text)).filter(Boolean),
      educationalAlignment: (topic.curriculum || []).map((c) => ({
        "@type": "AlignmentObject",
        alignmentType: "teaches",
        educationalFramework: c.curriculum,
        targetName: String(c.code),
        targetDescription: c.title,
      })),
      provider: { "@type": "Organization", name: "SketchCast AI", url: ORIGIN },
      hasPart: videos,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: strings[code].breadcrumb, item: indexUrl(code) },
        { "@type": "ListItem", position: 2, name: topic.title, item: url },
      ],
    },
  ];
}

/* ── the index ────────────────────────────────────────────────────────── */

function card(english, code) {
  const t = strings[code];
  const topic = localRow(english, code);
  const own = langOf(topic) === code ? "" : ` lang="en"`;
  const sum = summaryOf(topic);
  const v = (topic.videos || [])[0];
  const codes = [...new Set((topic.curriculum || []).map((c) => String(c.code).replace(/^cbse:/, "")))].slice(0, 3);
  const branch = branchOf(topic);
  const curs = curriculaOf(topic);
  const text = `${searchTokens(topic, true)} ${branch || ""} ${curs.map((k) => curriculumLabel(t, k)).join(" ").toLowerCase()}`;
  return `<a class="t-cardlink" href="${prefix(code)}/topics/${topic.slug}" data-subject="${esc(topic.subject)}" data-branch="${esc(branch || "")}" data-cur="${esc(curs.join(" "))}" data-text="${esc(text)}">
      ${v ? `<span class="t-thumb"><img src="${thumb(v.youtube_video_id)}" alt="" width="480" height="360" loading="lazy" /></span>` : ""}
      <span class="t-card-body">
        <span class="eyebrow">${esc(subjectLabel(t, topic.subject))}${branch ? ` · ${esc(branchLabel(t, branch))}` : ""}</span>
        <span class="t-card-title"${own}>${esc(topic.title)}</span>
        ${sum ? `<span class="t-card-sum"${own}>${inline(clip(plain(sum), 140))}</span>` : ""}
        ${codes.length ? `<span class="t-codes">${codes.map((c) => `<code>${esc(c)}</code>`).join("")}</span>` : ""}
      </span>
    </a>`;
}

function indexMain(all, code) {
  const t = strings[code];
  const subjects = [...new Set(all.map((x) => x.subject))].sort();
  return `
  <div class="wrap t-page">
    <div class="t-hero t-index-hero">
      <p class="eyebrow">${esc(t["index.eyebrow"])}</p>
      <h1>${esc(t["index.title"])}</h1>
      <p class="t-lead">${esc(t["index.lead"])}</p>
    </div>
    <div class="t-filters" role="search">
      <div class="t-chips" role="group" aria-label="${esc(t.subject)}">
        <button type="button" class="t-chip" aria-pressed="true" data-subject="" data-branch="">${esc(t.all)} <span>${all.length}</span></button>
        ${subjects.map((s) => {
          const inS = all.filter((x) => x.subject === s);
          const chips = [`<button type="button" class="t-chip t-chip-subject" aria-pressed="false" data-subject="${esc(s)}" data-branch="">${esc(fill(t.subjectAll, { subject: subjectLabel(t, s) }))} <span>${inS.length}</span></button>`];
          for (const b of BRANCHES[s] || []) {
            const n = inS.filter((x) => branchOf(x) === b).length;
            if (n) chips.push(`<button type="button" class="t-chip" aria-pressed="false" data-subject="${esc(s)}" data-branch="${b}">${esc(branchLabel(t, b))} <span>${n}</span></button>`);
          }
          return chips.join("");
        }).join("")}
      </div>
      <div class="t-filters-row">
        <label class="t-curpick">${esc(t["curriculum.label"])}<select class="t-cur"><option value="">${esc(t["curriculum.all"])}</option>${sortCur(all.flatMap(curriculaOf)).map((k) => `<option value="${esc(k)}">${esc(curriculumLabel(t, k))} <span>(${all.filter((x) => curriculaOf(x).includes(k)).length})</span></option>`).join("").replace(/ <span>\((\d+)\)<\/span>/g, " ($1)")}</select></label>
        <input class="t-search" type="search" placeholder="${esc(t.search)}" aria-label="${esc(t.search)}" />
      </div>
    </div>
    <div class="t-cards" id="t-cards">${all.map((x) => card(x, code)).join("")}</div>
    <p class="t-empty" hidden>${esc(t.noResults)}</p>
    <aside class="t-kit t-kit-wide">
      <p class="eyebrow">${KITS_RELEASED ? esc(t["kit.eyebrowReleased"]) : `<span class="t-soon">${esc(t["kit.comingSoon"])}</span>`}</p>
      <h2>${esc(t["index.kitTitle"])}</h2>
      <p>${esc(KITS_RELEASED ? t["index.kitLeadReleased"] : t["index.kitLead"])}</p>
      <a class="btn btn-primary" href="${APP}/signup">${esc(KITS_RELEASED ? t["kit.unlock"] : t["kit.signup"])}</a>
    </aside>
  </div>`;
}

function indexJsonLd(all) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "SketchCast free lessons",
      itemListElement: all.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: topicUrl(DEFAULT, x.slug), name: x.title })),
    },
  ];
}

/* ── page CSS + behaviour ─────────────────────────────────────────────── */

const CSS = `
.t-page{padding-top:28px;padding-bottom:72px}
.t-crumbs{font-size:14px;color:var(--graphite);margin-bottom:18px}.t-crumbs a{color:var(--teal-ink)}.t-crumbs a:hover{text-decoration:underline}
.t-note{margin:0 0 18px;padding:10px 14px;border:1px solid var(--line);border-inline-start:3px solid var(--marker);border-radius:9px;background:#fff;font-size:14px;color:var(--graphite)}
.t-hero{margin-bottom:26px;max-width:820px}.t-hero h1{font-size:clamp(32px,4.6vw,50px);margin:10px 0 14px}
.t-lead{font-size:18px;color:var(--graphite);line-height:1.55}
.t-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:40px;align-items:start}
@media(max-width:960px){.t-grid{grid-template-columns:minmax(0,1fr)}}
.t-side{position:sticky;top:90px}
@media(max-width:960px){.t-side{position:static}}
.t-body>section,.t-article{margin-bottom:34px}
.t-body h2{font-size:26px;margin:0 0 14px}
.t-video{position:relative;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#000;box-shadow:0 18px 40px -26px rgba(20,24,31,.5)}
.t-play{all:unset;cursor:pointer;display:block;width:100%;height:100%;position:relative}
.t-play img{width:100%;height:100%;object-fit:cover;display:block}
.t-play-icon{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transition:transform .15s}
.t-play:hover .t-play-icon,.t-play:focus-visible .t-play-icon{transform:scale(1.08)}
.t-play:focus-visible{outline:3px solid var(--teal);outline-offset:-3px}
.t-video iframe{width:100%;height:100%;border:0;display:block}
.t-yt{margin:10px 0 6px;font-size:14px}.t-yt a{color:var(--teal-ink);font-weight:500}.t-yt a:hover{text-decoration:underline}
.t-part{font-size:18px;margin:22px 0 10px}
.t-chapters{border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:10px 14px;font-size:14.5px}
.t-chapters summary{cursor:pointer;font-weight:500}
.t-chapters ol{list-style:none;margin:10px 0 2px;display:grid;gap:4px}
.t-chapters a{display:flex;gap:10px;padding:3px 0;color:var(--ink)}.t-chapters a:hover{color:var(--teal-ink)}
.t-time{font-family:var(--mono);font-size:12.5px;color:var(--graphite);min-width:42px}
.t-card{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:22px 24px}
.t-ticks{list-style:none;display:grid;gap:9px}
.t-ticks li{position:relative;padding-inline-start:28px}
.t-ticks li::before{content:"";position:absolute;inset-inline-start:2px;top:.45em;width:14px;height:8px;border-inline-start:2.4px solid var(--teal);border-bottom:2.4px solid var(--teal);transform:rotate(-45deg)}
.t-toc{margin-bottom:28px}.t-toc ol{margin:8px 0 0;padding-inline-start:20px;display:grid;gap:3px;font-size:15px}.t-toc a{color:var(--teal-ink)}.t-toc a:hover{text-decoration:underline}
.t-article h3{font-size:21px;margin:28px 0 10px;scroll-margin-top:90px}
.t-article p,.t-ex-a p{margin:0 0 12px;font-size:16.5px;line-height:1.7}
.t-article ul,.t-article ol,.t-ex-a ul,.t-ex-a ol{margin:0 0 14px;padding-inline-start:24px;display:grid;gap:5px;font-size:16.5px}
.t-table{overflow-x:auto;margin:6px 0 18px;border:1px solid var(--line);border-radius:10px}
.t-table table{border-collapse:collapse;width:100%;font-size:15px;background:var(--paper)}
.t-table th,.t-table td{text-align:start;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
.t-table th{background:var(--mist);font-weight:500}.t-table tr:last-child td{border-bottom:0}
sup{font-size:.72em;line-height:0}
.t-terms{display:grid;gap:12px}.t-terms div{display:grid;gap:2px}.t-terms dt{font-weight:600;font-family:var(--display)}.t-terms dd{color:var(--graphite)}
.t-example{border:1px solid var(--line);border-radius:12px;background:var(--paper);padding:16px 18px;margin-bottom:12px}
.t-ex-q{display:flex;gap:12px;font-weight:500;margin:0}
.t-ex-n{flex:0 0 26px;height:26px;border-radius:50%;background:var(--ink);color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center;font-family:var(--mono)}
.t-example details{margin-top:12px}.t-example summary{cursor:pointer;color:var(--teal-ink);font-weight:500;font-size:15px}
.t-ex-a{margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)}
.t-misc{display:grid;gap:12px}
.t-misc-item{border-radius:12px;border:1px solid var(--line);background:var(--paper);padding:14px 18px}
.t-myth,.t-fact{margin:0;font-size:15.5px}.t-fact{margin-top:8px;color:var(--ink-soft)}
.t-myth span,.t-fact span{font-family:var(--mono);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:5px;margin-inline-end:6px}
.t-myth span{background:#FFF1D6;color:#8A5A00}.t-fact span{background:#DDF5F1;color:var(--teal-ink)}
.t-cur-h{font-size:15px;margin:12px 0 6px;font-family:var(--sans);font-weight:600;letter-spacing:0}
.t-cur{list-style:none;display:grid;gap:6px;font-size:14.5px;color:var(--graphite)}
.t-cur code,.t-codes code{font-family:var(--mono);font-size:12px;background:var(--mist);border:1px solid var(--line);border-radius:5px;padding:1px 6px;color:var(--ink);margin-inline-end:6px}
.t-previews{margin-top:36px}.t-previews h2{font-size:22px;margin-bottom:12px}
.t-prev-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.t-prev{margin:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--paper)}
.t-prev img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover}
.t-prev figcaption{font-family:var(--mono);font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--graphite);padding:8px 12px}
.t-prev-note{margin-top:10px;font-size:14px;color:var(--graphite)}
.t-kit{background:var(--ink);color:#fff;border-radius:16px;padding:24px}
.t-kit h2{font-size:22px;margin:8px 0 10px;color:#fff}
.t-kit p{color:#C9CFD6;font-size:15px;margin-bottom:14px}
.t-kit .eyebrow{color:#9AA3AD}
.t-soon{display:inline-block;background:var(--marker);color:var(--ink);border-radius:6px;padding:2px 8px;font-weight:500}
.t-kit-list{list-style:none;display:grid;gap:7px;margin:0 0 18px;font-size:14.5px}
.t-kit-list li{position:relative;padding-inline-start:22px;color:#E9ECEF}
.t-kit-list li::before{content:"";position:absolute;inset-inline-start:2px;top:.5em;width:10px;height:6px;border-inline-start:2px solid var(--teal);border-bottom:2px solid var(--teal);transform:rotate(-45deg)}
.t-kit .btn-primary{background:#fff;color:var(--ink)}.t-kit .btn-primary:hover{background:var(--mist)}
.t-kit-wide{margin-top:48px;max-width:760px}
.t-related{margin-top:56px}.t-related h2{font-size:24px;margin-bottom:16px}
.t-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}
.t-cardlink{display:flex;flex-direction:column;background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow:hidden;transition:box-shadow .15s,transform .06s,border-color .15s}
.t-cardlink:hover{border-color:var(--faint);box-shadow:0 16px 34px -24px rgba(20,24,31,.45)}
.t-thumb{display:block;aspect-ratio:16/9;overflow:hidden;background:var(--mist)}
.t-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.t-card-body{display:grid;gap:6px;padding:14px 16px 16px}
.t-card-title{font-family:var(--display);font-weight:600;font-size:18px;line-height:1.2}
.t-card-sum{font-size:14px;color:var(--graphite);line-height:1.5}
.t-codes{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
.t-filters{display:grid;gap:12px;margin:0 0 22px}
.t-filters-row{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:end;justify-content:space-between}
.t-curpick{display:grid;gap:4px;font-family:var(--mono);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--graphite)}
.t-cur{font:inherit;font-family:var(--sans);font-size:15px;letter-spacing:0;text-transform:none;color:var(--ink);padding:9px 36px 9px 12px;border:1px solid var(--line);border-radius:10px;background:var(--paper) no-repeat;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235B6470' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-position:right 12px center;background-size:16px;appearance:none;-webkit-appearance:none;min-width:220px}
[dir=rtl] .t-cur{padding:9px 12px 9px 36px;background-position:left 12px center}
.t-chip-subject{font-weight:500;color:var(--ink);margin-inline-start:6px}
.t-chip-subject:first-of-type{margin-inline-start:0}
.t-chips{display:flex;flex-wrap:wrap;gap:8px}
.t-chip{font:inherit;font-size:14px;padding:7px 13px;border-radius:999px;border:1px solid var(--line);background:var(--paper);color:var(--graphite);cursor:pointer}
.t-chip span{font-family:var(--mono);font-size:12px;margin-inline-start:4px;color:var(--faint)}
.t-chip[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:#fff}.t-chip[aria-pressed="true"] span{color:#9AA3AD}
.t-search{font:inherit;font-size:15px;padding:9px 14px;border:1px solid var(--line);border-radius:10px;min-width:240px;background:var(--paper)}
@media(max-width:560px){.t-search{min-width:0;width:100%}}
.t-empty{color:var(--graphite);padding:20px 0}
`;

const JS = `<script>
(function(){
  // Click-to-play: the YouTube player loads only when asked (privacy, speed).
  document.querySelectorAll('.t-play').forEach(function(b){
    b.addEventListener('click',function(){
      var f=document.createElement('iframe');
      f.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(b.getAttribute('data-yt'))+'?autoplay=1&rel=0';
      f.title=b.getAttribute('aria-label')||'Video';
      f.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      f.allowFullscreen=true;
      b.parentNode.replaceChild(f,b);
    });
  });
  // Index filters: subject/branch chips AND curriculum AND text search. Each
  // filter has an "all" state, so any combination works.
  var cards=document.getElementById('t-cards');if(!cards)return;
  var chips=document.querySelectorAll('.t-chip'),q=document.querySelector('.t-search'),cur=document.querySelector('.t-cur'),empty=document.querySelector('.t-empty'),subject='',branch='';
  function apply(){
    var words=(q.value||'').trim().toLowerCase().replace(/\\p{M}+/gu,'').split(/\\s+/).filter(Boolean),ck=cur?cur.value:'',shown=0;
    cards.querySelectorAll('.t-cardlink').forEach(function(c){
      var text=' '+c.getAttribute('data-text');
      var ok=(!subject||c.getAttribute('data-subject')===subject)
        &&(!branch||c.getAttribute('data-branch')===branch)
        &&(!ck||(' '+c.getAttribute('data-cur')+' ').indexOf(' '+ck+' ')>=0)
        &&words.every(function(w){return text.indexOf(' '+w)>=0;});
      c.hidden=!ok;if(ok)shown++;
    });
    empty.hidden=shown>0;
  }
  chips.forEach(function(ch){ch.addEventListener('click',function(){
    subject=ch.getAttribute('data-subject');branch=ch.getAttribute('data-branch');
    chips.forEach(function(o){o.setAttribute('aria-pressed',o===ch?'true':'false');});apply();
  });});
  q.addEventListener('input',apply);
  if(cur)cur.addEventListener('change',apply);
})();
</script>`;

/* ── main ─────────────────────────────────────────────────────────────── */

const rows = (await loadCatalogue()).filter((x) => x.slug && x.title);
const catalogue = rows
  .filter((x) => langOf(x) === DEFAULT)
  .sort((a, b) => a.subject.localeCompare(b.subject) || a.title.localeCompare(b.title));
if (catalogue.length === 0) throw new Error("public_catalogue returned no topics — refusing to wipe the pages");
// A translated kit takes over its language's page only when it has a public
// video and its English topic is listed (the page's spine is the English list).
const englishSlugs = new Set(catalogue.map((x) => x.slug));
LOCAL = new Map(rows
  .filter((x) => langOf(x) !== DEFAULT && englishSlugs.has(x.slug) && (x.videos || []).length && LOCALES.some((l) => l.code === langOf(x)))
  .map((x) => [`${x.slug}|${langOf(x)}`, x]));
{
  const waiting = rows.filter((x) => langOf(x) !== DEFAULT && !LOCAL.has(`${x.slug}|${langOf(x)}`));
  console.log(`✓ ${LOCAL.size} translated lesson page(s)${waiting.length ? `; ${waiting.length} translated kit(s) without a public video keep the English page` : ""}`);
}
const redirects = await loadRedirects();
PREVIEWS = await fetchPreviews([...catalogue, ...LOCAL.values()]);
console.log("✓ preview cards for " + PREVIEWS.size + " lesson(s)");

// Clean rebuild of the generated folders only.
for (const l of LOCALES) {
  const dir = join(ROOT, ...(l.code === DEFAULT ? [] : [l.code]), "topics");
  if (existsSync(dir)) rmSync(dir, { recursive: true });
}

let written = 0;
for (const l of LOCALES) {
  const t = strings[l.code];
  const base = join(ROOT, ...(l.code === DEFAULT ? [] : [l.code]));
  mkdirSync(join(base, "topics"), { recursive: true });
  const indexHtml = page(l.code, {
    route: "/topics",
    title: t["index.metaTitle"],
    description: t["index.metaDescription"],
    jsonLd: l.code === DEFAULT ? indexJsonLd(catalogue) : [],
    main: indexMain(catalogue, l.code),
    alternates: (c) => indexUrl(c),
  }).replace("</body>", `${JS}\n</body>`);
  writeFileSync(join(base, "topics.html"), indexHtml, "utf8");
  written++;
  for (const topic of catalogue) {
    const row = localRow(topic, l.code);
    const native = langOf(row) === l.code;
    const html = page(l.code, {
      route: `/topics/${topic.slug}`,
      title: fill(t.metaTitle, { title: row.title }),
      description: clip(plain(summaryOf(row) || row.title), 158),
      ogType: "article",
      jsonLd: native ? topicJsonLd(row, l.code) : [],
      main: topicMain(row, catalogue, l.code),
      alternates: (c) => topicUrl(c, topic.slug),
      versions: versionsOf(topic.slug),
    }).replace("</body>", `${JS}\n</body>`);
    writeFileSync(join(base, "topics", `${topic.slug}.html`), html, "utf8");
    written++;
  }
}

/* ── the homepage lesson strip ────────────────────────────────────────── */
// Founder, 2026-10-16: a dropdown on the homepage; the chosen lesson's
// YouTube thumbnail opens the video ON YOUTUBE (new tab). A random lesson
// each visit. Written per language between <!--topics:strip--> markers in
// the BUILT homepage (index.html is both source and the English page).

const STRIP_CSS = `
.lstrip{padding:56px 0 60px;background:var(--paper);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.lstrip-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:44px;align-items:center}
@media(max-width:860px){.lstrip{padding:44px 0 48px}.lstrip-grid{grid-template-columns:minmax(0,1fr);gap:26px}}
.lstrip h2{font-size:34px;margin:10px 0 12px}
.lstrip-lead{color:var(--graphite);font-size:17px;max-width:460px}
.lstrip-pick{display:grid;gap:12px;margin-top:22px;max-width:460px}
.lstrip-pick label{display:grid;gap:5px;font-family:var(--mono);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--graphite)}
.lstrip-pick select{font:inherit;font-size:15px;color:var(--ink);padding:10px 36px 10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--canvas) no-repeat;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235B6470' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-position:right 12px center;background-size:16px;appearance:none;-webkit-appearance:none;width:100%;letter-spacing:0;text-transform:none;font-family:var(--sans)}
[dir=rtl] .lstrip-pick select{padding:10px 12px 10px 36px;background-position:left 12px center}
.lstrip-pick select:focus-visible{outline:2px solid var(--teal);outline-offset:2px}
.lstrip-pick input{font:inherit;font-family:var(--sans);font-size:15px;letter-spacing:0;text-transform:none;color:var(--ink);padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--canvas);width:100%}
.lstrip-pick input:focus-visible{outline:2px solid var(--teal);outline-offset:2px}
.lstrip-links{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:18px;font-size:15px}
.lstrip-links a{color:var(--teal-ink);font-weight:500}.lstrip-links a:hover{text-decoration:underline}
.lstrip-soon{margin-top:14px;font-family:var(--mono);font-size:12px;color:var(--faint)}
.lstrip-soon span{display:inline-block;background:#FFF1D6;color:#8A5A00;border-radius:5px;padding:1px 7px;margin-inline-end:6px;letter-spacing:.04em}
.lstrip-video{display:block;position:relative;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:var(--mist);box-shadow:0 1px 2px rgba(20,24,31,.04),0 24px 60px -28px rgba(20,24,31,.35);transition:transform .15s,box-shadow .15s}
.lstrip-video:hover{transform:translateY(-2px);box-shadow:0 1px 2px rgba(20,24,31,.04),0 30px 64px -26px rgba(20,24,31,.45)}
.lstrip-video img{width:100%;height:100%;object-fit:cover;display:block}
.lstrip-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.lstrip-play svg{width:68px;height:48px;filter:drop-shadow(0 6px 16px rgba(0,0,0,.35))}
.lstrip-cap{display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-top:12px;font-size:14.5px}
.lstrip-cap b{font-family:var(--display);font-weight:600;color:var(--ink);font-size:16px}
.lstrip-cap span{font-family:var(--mono);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--graphite);white-space:nowrap}
`;

function stripHtml(code, all) {
  const t = strings[code];
  const loc = LOCALES.find((l) => l.code === code);
  const subjects = [...new Set(all.map((x) => x.subject))].sort();
  const data = all
    .filter((x) => (x.videos || []).length)
    .map((x) => ({ s: x.slug, t: x.title, y: x.videos[0].youtube_video_id, j: x.subject, b: branchOf(x) || "", c: curriculaOf(x), k: searchTokens(x, false) }));
  const first = data[0];
  const n = data.length;
  const opt = (x) => `<option value="${esc(x.s)}" lang="en">${esc(x.t)}</option>`;
  const curKeys = sortCur(data.flatMap((x) => x.c));
  // Subject dropdown: "Mathematics (all)" then its branches, same for Science.
  const subjectOptions = subjects.map((s) =>
    `<optgroup label="${esc(subjectLabel(t, s))}"><option value="${esc(s)}">${esc(fill(t.subjectAll, { subject: subjectLabel(t, s) }))}</option>${(BRANCHES[s] || [])
      .filter((b) => data.some((x) => x.j === s && x.b === b))
      .map((b) => `<option value="${esc(s)}|${b}">${esc(branchLabel(t, b))}</option>`).join("")}</optgroup>`).join("");
  return `<style id="lstrip-css">${STRIP_CSS}</style>
<section class="lstrip" id="lessons" aria-labelledby="lstrip-h">
  <div class="wrap lstrip-grid">
    <div>
      <p class="eyebrow">${esc(t["strip.eyebrow"])}</p>
      <h2 id="lstrip-h">${esc(t["strip.title"])}</h2>
      <p class="lstrip-lead">${esc(fill(t["strip.lead"], { n }))}</p>
      <div class="lstrip-pick">
        <label>${esc(t["strip.subject"])}<select id="lstrip-subject"><option value="">${esc(t["strip.all"])}</option>${subjectOptions}</select></label>
        <label>${esc(t["strip.curriculum"])}<select id="lstrip-cur"><option value="">${esc(t["curriculum.all"])}</option>${curKeys.map((k) => `<option value="${esc(k)}">${esc(curriculumLabel(t, k))}</option>`).join("")}</select></label>
        <label>${esc(t["strip.find"])}<input id="lstrip-q" type="search" placeholder="${esc(t["strip.findHint"])}" autocomplete="off" /></label>
        <label>${esc(t["strip.lesson"])}<select id="lstrip-lesson" lang="en" dir="ltr">${data.map(opt).join("")}</select></label>
      </div>
      <p class="lstrip-links"><a id="lstrip-read" href="${prefix(code)}/topics/${esc(first.s)}">${esc(t["strip.read"])} →</a><a href="${prefix(code)}/topics">${esc(fill(t["strip.browse"], { n }))}</a></p>
      <p class="lstrip-soon"><span>${esc(strings[code]["kit.comingSoon"])}</span>${esc(t["strip.kitSoon"])}</p>
    </div>
    <div>
      <a id="lstrip-video" class="lstrip-video" href="${watchUrl(first.y)}" target="_blank" rel="noopener" aria-label="${esc(fill(t["strip.play"], { title: first.t }))}" data-play="${esc(t["strip.play"])}">
        <img id="lstrip-img" src="${thumb(first.y)}" alt="" width="480" height="360" loading="lazy" />
        <span class="lstrip-play" aria-hidden="true"><svg viewBox="0 0 68 48"><path d="M66.5 7.7A8.5 8.5 0 0 0 60.5 1.6C55.2.2 34 .2 34 .2s-21.2 0-26.5 1.4A8.5 8.5 0 0 0 1.5 7.7C.1 13 .1 24 .1 24s0 11 1.4 16.3a8.5 8.5 0 0 0 6 6.1C12.8 47.8 34 47.8 34 47.8s21.2 0 26.5-1.4a8.5 8.5 0 0 0 6-6.1C67.9 35 67.9 24 67.9 24s0-11-1.4-16.3z" fill="#FF0000"/><path d="M45 24 27 14v20z" fill="#fff"/></svg></span>
      </a>
      <p class="lstrip-cap"><b id="lstrip-title" lang="en">${esc(first.t)}</b><span id="lstrip-subj">${esc(subjectLabel(t, first.j))}</span></p>
    </div>
  </div>
</section>
<script type="application/json" id="lstrip-data">${JSON.stringify({ prefix: prefix(code), labels: Object.fromEntries(subjects.map((s) => [s, subjectLabel(t, s)])), branches: Object.fromEntries(Object.values(BRANCHES).flat().map((b) => [b, branchLabel(t, b)])), none: t.noResults, lessons: data }).replace(/</g, "\\u003c")}</script>
<script>
(function(){
  var el=document.getElementById('lstrip-data');if(!el)return;
  var D=JSON.parse(el.textContent),subj=document.getElementById('lstrip-subject'),cur=document.getElementById('lstrip-cur'),q=document.getElementById('lstrip-q'),sel=document.getElementById('lstrip-lesson');
  var a=document.getElementById('lstrip-video'),img=document.getElementById('lstrip-img'),ttl=document.getElementById('lstrip-title'),sj=document.getElementById('lstrip-subj'),read=document.getElementById('lstrip-read');
  function show(x){a.href='https://www.youtube.com/watch?v='+encodeURIComponent(x.y);a.setAttribute('aria-label',a.getAttribute('data-play').replace('{title}',x.t));img.src='https://i.ytimg.com/vi/'+encodeURIComponent(x.y)+'/hqdefault.jpg';ttl.textContent=x.t;sj.textContent=(D.labels[x.j]||x.j)+(x.b&&D.branches[x.b]?' · '+D.branches[x.b]:'');read.href=D.prefix+'/topics/'+x.s;}
  // Subject value is "Subject" or "Subject|branch"; curriculum value is "family:grade". Both AND together; either may be "all".
  function fillList(keep){var sv=subj.value.split('|'),s=sv[0],b=sv[1]||'',ck=cur.value,words=(q.value||'').trim().toLowerCase().replace(/\\p{M}+/gu,'').split(/\\s+/).filter(Boolean);
    var list=D.lessons.filter(function(x){var text=' '+x.k;return (!s||x.j===s)&&(!b||x.b===b)&&(!ck||x.c.indexOf(ck)>=0)&&words.every(function(w){return text.indexOf(' '+w)>=0;})});
    sel.innerHTML='';sel.disabled=!list.length;if(!list.length){var o=document.createElement('option');o.textContent=D.none;sel.appendChild(o);return;}
    list.forEach(function(x){var o=document.createElement('option');o.value=x.s;o.textContent=x.t;o.lang='en';sel.appendChild(o);});
    var pick=list.find(function(x){return x.s===keep})||(keep==='__first__'?list[0]:list[Math.floor(Math.random()*list.length)]);sel.value=pick.s;show(pick);}
  // A random lesson each visit (founder, 2026-10-16).
  fillList(null);
  subj.addEventListener('change',function(){fillList(null);});
  cur.addEventListener('change',function(){fillList(null);});
  // Typing keeps the current pick while it still matches; otherwise the first match.
  q.addEventListener('input',function(){var k=sel.value;var sv=subj.value.split('|'),ws=(q.value||'').trim().toLowerCase().replace(/\\p{M}+/gu,'').split(/\\s+/).filter(Boolean);var cur0=D.lessons.find(function(x){return x.s===k});var still=cur0&&ws.every(function(w){return (' '+cur0.k).indexOf(' '+w)>=0});fillList(still?k:'__first__');});
  sel.addEventListener('change',function(){var x=D.lessons.find(function(y){return y.s===sel.value});if(x)show(x);});
})();
</script>`;
}

{
  const OPEN = "<!--topics:strip-->", CLOSE = "<!--/topics:strip-->";
  let stripped = 0;
  for (const l of LOCALES) {
    const file = join(ROOT, ...(l.code === DEFAULT ? [] : [l.code]), "index.html");
    if (!existsSync(file)) continue;
    const html = readFileSync(file, "utf8");
    const a = html.indexOf(OPEN), b = html.indexOf(CLOSE);
    if (a < 0 || b < 0) { if (l.code === DEFAULT) throw new Error("index.html has no <!--topics:strip--> markers"); continue; }
    const eol = html.includes("\r\n") ? "\r\n" : "\n";
    const body = stripHtml(l.code, catalogue).replace(/\n/g, eol);
    writeFileSync(file, html.slice(0, a + OPEN.length) + eol + body + eol + html.slice(b), "utf8");
    stripped++;
  }
  console.log(`✓ lesson strip written into ${stripped} homepage(s)`);
}

// Sitemap: the indexable pages (English, and each translated lesson); build-i18n.mjs points robots.txt at it.
const lastmod = (x) => (x.approved_at || "").slice(0, 10);
const newest = catalogue.map(lastmod).sort().pop();
const urls = [
  `  <url><loc>${indexUrl(DEFAULT)}</loc><lastmod>${newest}</lastmod></url>`,
  ...catalogue.map((x) => `  <url><loc>${topicUrl(DEFAULT, x.slug)}</loc><lastmod>${lastmod(x)}</lastmod></url>`),
  ...[...LOCAL.values()]
    .sort((a, b) => a.slug.localeCompare(b.slug) || langOf(a).localeCompare(langOf(b)))
    .map((x) => `  <url><loc>${topicUrl(langOf(x), x.slug)}</loc><lastmod>${lastmod(x)}</lastmod></url>`),
];
writeFileSync(
  join(ROOT, "sitemap-topics.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated by build-topics.mjs — do not edit. -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
  "utf8",
);

// Renamed topics keep their old links: one 301 per former slug, per language.
if (redirects.length) {
  const lines = ["# Generated by build-topics.mjs — renamed topics. Do not edit."];
  for (const r of redirects) for (const l of LOCALES) lines.push(`${prefix(l.code)}/topics/${r.old_slug} ${prefix(l.code)}/topics/${r.slug} 301`);
  writeFileSync(join(ROOT, "_redirects"), lines.join("\n") + "\n", "utf8");
}

console.log(`✓ wrote ${written} topic pages (${catalogue.length} topics × ${LOCALES.length} languages + indexes), sitemap-topics.xml${redirects.length ? `, _redirects (${redirects.length})` : ""}`);
