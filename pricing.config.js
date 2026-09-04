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
 * A LEMON SQUEEZY LINK IS VARIANT-LOCKED — ONE LINK PER BILLING CYCLE.
 * /checkout/buy/<slug> is a VARIANT's share link, not a product's. It opens
 * straight into that one variant with the price already fixed (the page's own
 * state says isMultiVariant:false), and there is NO billing-cycle chooser on
 * it. So every paid plan carries BOTH links below — `checkout.monthly` and
 * `checkout.annual` — and pricing.html's Monthly/Annual toggle must re-point
 * the CTA href as well as re-render the price.
 *
 * This comment used to claim the opposite: that one product URL served both
 * cycles and the customer picked one at checkout. It never did. A visitor who
 * toggled to Annual, read $240 and clicked was sent to the $24/month variant.
 * The same wrong assumption shipped the app repo's three credit-pack chips all
 * pointing at the $8 variant, so the $20 and $36 buttons opened an $8 checkout.
 * Neither failure raises an error anywhere — the buyer is simply charged by
 * whatever variant the link opens. VERIFY ANY REPOINT by fetching the URL and
 * reading the subtotal it renders; never by trusting a slug written in a
 * comment. LS reassigns variant ids (and their slugs) when a variant is edited.
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

  var BUY = "https://aetheltwin.lemonsqueezy.com/checkout/buy/";

  // LIVE-MODE VARIANT LINKS. Read from the Lemon Squeezy API and each fetched
  // and checked against the subtotal it renders on 2026-08-20; the store went
  // live that day, and every link here before then was a TEST-mode object that
  // declined a real card. `monthly` and `annual` are two different variants of
  // the same product and are NOT interchangeable — see the header.
  //
  // ⚠️ THE IDS IN THESE COMMENTS ARE A RECORD, NOT A KEY. LS reassigns a
  // variant id (and mints a new slug) whenever the variant is edited: Teacher
  // Pro Monthly was 2037932 and became 2037937 within the hour these were
  // read. Re-read the catalogue from the API before trusting any of them, and
  // confirm the price the URL actually opens.
  var CHECKOUT = {
    teacherPro: {
      monthly: BUY + "aa7062b7-d108-421e-a703-a9f8915820f3", // variant 2037937 — $24/mo
      annual: BUY + "dac4fa04-49cb-4160-acea-7ff23d51a08d"   // variant 2037934 — $240/yr
    },
    teacherProPlus: {
      monthly: BUY + "b44c72ed-fed6-4296-ba87-b882a94b9b25", // variant 2037938 — $49/mo
      annual: BUY + "4d075907-455e-4c9d-9f01-c2b873774981"   // variant 2037940 — $490/yr
    },
    homeBasic: {
      monthly: BUY + "337fe0b4-0f9a-4fb0-8a1c-b2eb5f2c5743", // variant 2037943 — $9.99/mo
      annual: BUY + "17dbe0ec-72f1-4331-9b44-2166d2181772"   // variant 2037948 — $99/yr
    },
    homeschool: {
      monthly: BUY + "64af4e6c-7937-4174-9db8-5cdcef6713ed", // variant 2037950 — $34/mo
      annual: BUY + "000d458f-f139-4a5f-b07f-079cb9d683fc"   // variant 2037951 — $340/yr
    }
  };
  var APP_SIGNUP = "https://app.sketchcast.app/signup"; // TODO: confirm real sign-up path
  // Schools register themselves now (a 30-day trial, then a tailored quote);
  // the sales mailbox stays on the /schools page as the second door.
  var SCHOOLS_ENQUIRY = "https://app.sketchcast.app/schoolsignup";

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
      // A plain string, not a {monthly, annual} pair: the free tier has one
      // destination and no billing cycle to pick. pricing.html's checkoutFor()
      // accepts either shape, so the two single-destination CTAs on this page
      // (here and the founding band) stay one URL each.
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

    // ── FOUNDING-TEACHER OFFER: OFF THE SITE ──────────────────────────────
    // Founder decision, 2026-09-04: the offer is no longer advertised here.
    // The FOUNDINGTEACHER discount ($14 off the $24 Teacher Pro monthly, 24
    // months, capped at 50 by Lemon Squeezy) stays ACTIVE in Lemon Squeezy for
    // anyone who already holds the code, and the app keeps counting its
    // redemptions; only the public band, the Teacher Pro card's flag and the
    // live counter are gone. `null` is the whole switch: pricing.html hides
    // the #founding box and the card flag when there is no founding entry.
    // To bring it back, restore the block from git history (commit before this
    // one) — name, planKey "pro", price 10, lockMonths 24, cap 50, countUrl,
    // counter "left", code, cta, checkout = CHECKOUT.teacherPro.monthly.
    founding: null,

    // Schools never see a public price — they start a 30-day trial and get a
    // tailored quote. The feature showcase lives at /schools (learnHref renders
    // a second, ghost button).
    schools: {
      tiers: ["Essentials", "Professional", "Enterprise"],
      cta: "Start a free school trial",
      href: SCHOOLS_ENQUIRY,
      learnHref: "/schools",
      learnLabel: "See what schools get"
    }
  };
})();
