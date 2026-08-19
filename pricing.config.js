/* SketchCast — pricing source of truth.
 *
 * The ONE place plans, prices, copy, features and checkout links live;
 * pricing.html renders entirely from `window.SKETCHCAST_PRICING` below, so no
 * price or link is ever written twice. Annual pricing is two months free — the
 * whole-dollar teacher plans are exactly monthly x 10 (24->240, 49->490), and
 * Family is $99 (~2 months off $9.99). All prices USD.
 *
 * This is a static site with no runtime env, and the Lemon Squeezy checkout
 * URLs are PUBLIC hosted-checkout links (any visitor can see them), so they
 * live right here in code. No secrets exist in this repo — billing secrets
 * (API keys, webhook secrets) belong to the separate app repo, never here.
 *
 * One product URL serves BOTH the monthly and annual variant — the customer
 * picks the billing cycle on the Lemon Squeezy checkout page itself. That is
 * why each paid plan has a single `checkout` link, not one per cycle.
 *
 * TRANSLATION. The English copy below is the FALLBACK, not the only copy: each
 * plan's `i18n` key names its string group in strings/en.json, and pricing.html
 * prefers the translated words from the generated /<locale>/pricing.i18n.js.
 * Prices, checkout links and plan structure stay here and are shared by all ten
 * languages, so no number is ever written twice and no translator ever handles
 * a checkout URL. Change the copy here and in strings/en.json together.
 */
(function () {
  "use strict";

  var CHECKOUT = {
    teacherPro: "https://aetheltwin.lemonsqueezy.com/checkout/buy/40f7d222-0d05-4c18-9c87-5aee4254617b",
    teacherProPlus: "https://aetheltwin.lemonsqueezy.com/checkout/buy/6957c1fe-66d3-4f36-af4c-d21436d84cac",
    homeBasic: "https://aetheltwin.lemonsqueezy.com/checkout/buy/10b1b75b-fd10-43b5-8c5e-6243623ff5b2",
    homeschool: "https://aetheltwin.lemonsqueezy.com/checkout/buy/8760db3a-46e0-4ea5-baca-9515519930ea"
  };
  var APP_SIGNUP = "https://app.sketchcast.app/signup"; // TODO: confirm real sign-up path
  var SCHOOLS_ENQUIRY = "mailto:sales@sketchcast.app?subject=SketchCast%20for%20our%20school"; // TODO: swap to the sales form URL if one exists

  window.SKETCHCAST_PRICING = {
    currency: "USD",
    appSignupUrl: APP_SIGNUP,

    // ── THE UNIT ────────────────────────────────────────────────────────────
    // A GENERATION is one artefact and costs one credit; a KIT is six of them
    // (narrated lesson + worksheet + lesson plan + activities + test paper +
    // case study). The pricing page's meter shows both numbers per plan, and it
    // DERIVES the kit count as generations / kitSize — "4 kits" is never stored
    // anywhere, so it cannot drift from "24 generations". All five allowances
    // divide exactly: 6, 12, 24, 48, 72 → 1, 2, 4, 8, 12.
    //
    // ⚠️ kitSize IS NOT THE ONLY PLACE THE NUMBER SIX APPEARS. It is the only
    // authority for anything DERIVED (the per-plan kit count), but the page
    // also states it in prose, and prose cannot be derived from a config value
    // without either printing "{n}" to readers with JavaScript off or moving
    // six translated pill labels out of the crawlable markup. So if the kit
    // ever stops being six pieces, these change WITH this line, in all ten
    // languages, in the same commit:
    //   strings/*.json  pricing.unit.lead  "One kit is six pieces."
    //   strings/*.json  pricing.unit.sub   "…so a kit is six."
    //   strings/*.json  pricing.free.sub   "one complete six-piece kit"
    //   strings/*.json  pricing.unit.p1…p6 — one pill per piece; the pill
    //                   COUNT is the definition the reader actually counts
    //   pricing.html    the six <li> elements carrying those pills
    // (pricing.free.sub is already translated in nine locales, so the number
    // is unavoidably in prose today whatever this file does — which is why
    // this is a checklist and not a refactor.)
    kitSize: 6,

    // ── FREE-TRIAL MODE ──────────────────────────────────────────────────────
    // While `enabled` and the current time is before `endsAt`, every paid CTA
    // (Teacher Pro / Pro+ / Family / Founding) BYPASSES Lemon Squeezy checkout
    // and sends the visitor into the app for a free month; a live countdown
    // banner shows the time remaining. After `endsAt` (or set enabled:false) the
    // page automatically reverts to normal paid checkout — no redeploy needed.
    // The trial's in-app limits (1 book, etc.) are enforced server-side.
    trial: {
      enabled: true,
      startsAt: "2026-07-07",
      // Extended by one week on 7 Aug 2026, hours before it would have lapsed.
      // MUST stay in step with promo_ends_at() in the database (migration 0077):
      // this drives the banner, the countdown and the checkout bypass, while the
      // DB decides who is actually still on the free tier. If they disagree, the
      // site sells a trial the app will not honour, or vice versa.
      endsAt: "2026-08-14T23:59:59+08:00", // was 2026-08-07 (one month from 7 Jul)
      url: APP_SIGNUP,
      cta: "Start free trial"
    },

    // ── ONE free tier, shared by teachers and home educators alike ─────────
    // The trial is a single complete kit from a single book (6 generations),
    // enforced server-side by the trial pin — the same shape whoever you are.
    free: {
      key: "free",
      i18n: "freeAll",
      name: "Free",
      tag: "Try it on your next lesson",
      monthly: 0,
      annual: 0,
      cta: "Start free",
      checkout: APP_SIGNUP,
      features: [
        "1 book, with the full six-piece kit for one chapter part",
        "Narrated video lessons, worksheets, test papers and lesson plans",
        "9 lesson languages, auto-detected from your book (Arabic fully right-to-left)",
        "Assign to a learner or a class and track progress"
      ]
    },

    teacher: [
      {
        key: "pro",
        i18n: "teacherPro",
        name: "Teacher Pro",
        tag: "Everything you need, every week",
        featured: true,
        badge: "Most popular",
        monthly: 24,
        annual: 240,
        saveLabel: "Save $48 a year",
        cta: "Choose Teacher Pro",
        checkout: CHECKOUT.teacherPro,
        // ── the meter (see kitSize above) ──
        // `generations` is the monthly allowance; the card computes kits from
        // it. `who` is the one-line audience fact, repeated in every column so
        // the comparison row is the SAME string everywhere and stays aligned in
        // French. `skipFeatures` are 0-based indices the card does not RENDER —
        // the features array itself is never edited, so f-numbering is stable
        // and homeschool.html's JSON-LD (tag + f1..f5) is untouched. Here: f1
        // ("24 generations a month…") and f2 ("each counts as one") are exactly
        // what the meter and the unit strip now say better, and f5 ('Class
        // rosters, join codes and whole-class progress') is word-for-word what
        // the 'For teachers' label above this pair already says, on the same
        // screen — a label that is now visible at every width, not just above
        // 1080px. Dropping it also shortens the tallest feature list in the
        // row, and with subgrid that list sizes the shared feature row for all
        // four cards: every bullet Teacher Pro does not render is dead white
        // space removed from the three cards that have fewer.
        generations: 24,
        who: "A whole class",
        skipFeatures: [0, 1, 4],
        features: [
          "24 generations a month — about 4 complete lesson kits",
          "A lesson, plan, activities, worksheet, test paper or case study — each counts as one",
          "2 new books a month",
          "AI Tutor",
          "Class rosters, join codes and whole-class progress",
          "Long chapters always fully covered (multi-part videos)",
          "Editable PowerPoint & exports",
          "Live fair-use meter in your Library — no surprises"
        ]
      },
      {
        key: "proplus",
        i18n: "teacherProPlus",
        name: "Teacher Pro+",
        tag: "For power users and departments",
        monthly: 49,
        annual: 490,
        saveLabel: "Save $98 a year",
        cta: "Choose Teacher Pro+",
        checkout: CHECKOUT.teacherProPlus,
        // f1 ("Everything in Teacher Pro, plus:") stays — the card sits next to
        // Teacher Pro. Only f2, the allowance sentence, is skipped.
        generations: 72,
        who: "A whole class",
        skipFeatures: [1],
        features: [
          "Everything in Teacher Pro, plus:",
          "48 additional generations — 72 a month, about 12 complete lesson kits",
          "2 additional books — 4 a month",
          "Priority generation",
          "Early access to new features"
        ]
      }
    ],

    // Home educators and private tutors — built around named learners rather
    // than a class register. The showcase lives at /homeschool.
    home: [
      {
        key: "basic",
        i18n: "homeBasic",
        name: "Home Basic",
        tag: "A subject or two, alongside school",
        monthly: 9.99,
        annual: 99,
        saveLabel: "2 months free",
        cta: "Get Home Basic",
        checkout: CHECKOUT.homeBasic,
        generations: 12,
        who: "Up to 2 learners",
        skipFeatures: [0, 1], // the meter states the allowance; `who` states the learners
        features: [
          "12 generations a month — about 2 complete lesson kits",
          "Up to 2 learners",
          "Practice papers in the book's own language (9 supported)",
          "Homework help & AI explanations",
          "Progress tracking",
          "Unused allowance rolls over a month"
        ]
      },
      {
        key: "homeschool",
        i18n: "homeschool",
        name: "Homeschool",
        tag: "The whole curriculum at home — and tutors with a full roster",
        featured: true,
        badge: "For home educators",
        monthly: 34,
        annual: 340,
        saveLabel: "2 months free",
        cta: "Choose Homeschool",
        checkout: CHECKOUT.homeschool,
        generations: 48,
        who: "Up to 10 learners, each with their own books",
        skipFeatures: [0, 1],
        features: [
          "48 generations a month — about 8 complete lesson kits",
          "Up to 10 learners, each with their own books",
          "Printable progress records per learner",
          "4 new books a month",
          "AI study coach for every learner",
          "Live fair-use meter — no surprises"
        ]
      }
    ],

    // Founding-teacher offer — CODE-driven, not a special link. The CTA opens
    // the plain Teacher Pro checkout; the teacher chooses Monthly there and
    // pastes the code in the discount field to get the founding price. The
    // visible code (+ copy button) is therefore essential, not decoration.
    // Set `cap` to null to remove the "first N" line entirely.
    founding: {
      name: "Founding Teacher",
      plan: "Teacher Pro",
      // Which plan card carries the one-line "Founding price $10/mo with a
      // code" flag. A KEY, not the display name: `plan` above is prose that a
      // rename would break, and the flag must point at the same product the
      // checkout does.
      planKey: "pro",
      price: 10, // USD / month at checkout with the code (not affected by the toggle)
      lockMonths: 24,

      // ── THE CAP, AND WHY 50 IS STILL WRITTEN HERE ────────────────────────
      // 50 is not our number. FOUNDINGTEACHER is a Lemon Squeezy discount with
      // is_limited_redemptions=true and max_redemptions=50, so LS REFUSES the
      // 51st teacher at checkout — "Only the first 50" is a mechanism, not an
      // honour system, and LS is the system that knows it.
      //
      // So why is it also here? Because this site must be CORRECT WITH
      // JAVASCRIPT OFF and correct when the network fails, and neither state
      // can ask Lemon Squeezy anything. `cap` is the offline copy of a public
      // claim — the sentence a reader gets when nothing is fetched. It is not
      // the enforcing value and nothing is gated on it.
      //
      // The number is therefore written in exactly two places on purpose: in
      // Lemon Squeezy (which enforces it) and here (which states it when we
      // cannot ask). The app repo, which does the asking, holds NO cap literal
      // at all — /api/public/founding-places reports max_redemptions as LS
      // states it. And when that endpoint answers, pricing.html PREFERS the
      // max it returns over this one, so if the two ever disagree the reader
      // sees LS's truth and not our stale copy.
      cap: 50,

      // ── THE LIVE COUNTER ────────────────────────────────────────────────
      // A public JSON endpoint on the app (server-side; the Lemon Squeezy API
      // key lives there and never here — see the header of this file). It
      // answers {status:"ok",claimed,max,remaining,...} or {status:"unknown"},
      // and the page treats anything else as unknown. Set to null to stop the
      // page fetching at all.
      //
      // NO NUMBER IS EVER WRITTEN INTO THIS FILE OR THE MARKUP. A hardcoded
      // "37 claimed" would be invented scarcity shown to someone deciding
      // whether to pay. The counter is measured or it is absent.
      countUrl: "https://app.sketchcast.app/api/public/founding-places",

      // How a measured count is PHRASED. A presentation switch, on purpose:
      // the live number today is 0, and "0 of 50 claimed" advertises that
      // nobody has bought — which may read worse than saying nothing at all.
      // Rather than bake that judgement into code, flip it here.
      //   "claimed" → "0 of 50 claimed · 50 left"   (both figures, as asked)
      //   "left"    → "50 of 50 places left"        (same facts, availability
      //                framing — recommended while the count is 0)
      //   "off"     → never fetch; keep the plain "Only the first 50 teachers."
      // Whatever this says, the STATIC line is what renders until a real
      // number arrives, and what stays if one never does.
      // Founder decision, 2026-08-19: "left". Same two measured numbers as
      // "claimed", framed as availability rather than as absence — revisit once
      // real redemptions exist and "N of 50 claimed" carries social proof
      // instead of costing it.
      counter: "left",

      code: "FOUNDINGTEACHER",
      cta: "Claim founding price",
      checkout: CHECKOUT.teacherPro
    },

    // Schools never see a public price — sales enquiry only. The feature
    // showcase lives at /schools (learnHref renders a second, ghost button).
    schools: {
      tiers: ["Essentials", "Professional", "Enterprise"],
      cta: "Contact sales",
      href: SCHOOLS_ENQUIRY,
      learnHref: "/schools",
      learnLabel: "See what schools get"
    }
  };
})();
