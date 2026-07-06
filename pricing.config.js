/* SketchCast — pricing source of truth.
 *
 * This is the ONE place plans, prices, copy and features live; pricing.html
 * renders entirely from `window.SKETCHCAST_PRICING` below, so no price is ever
 * written twice. Annual = monthly x 10 (two months free).
 *
 * Checkout URLs are NOT hard-coded here — they come from `window.SKETCHCAST_LINKS`
 * (see pricing.links.js), which is generated from environment variables at build
 * time (build-pricing-config.mjs). A blank link degrades gracefully to sign-up.
 * All prices are USD.
 */
(function () {
  "use strict";

  var L = (typeof window !== "undefined" && window.SKETCHCAST_LINKS) || {};
  var APP_SIGNUP_URL = L.APP_SIGNUP_URL || "https://app.sketchcast.app/signup";

  window.SKETCHCAST_PRICING = {
    currency: "USD",
    appSignupUrl: APP_SIGNUP_URL,

    teacher: [
      {
        key: "free",
        name: "Free",
        tag: "To try it on your next lesson",
        monthly: 0,
        annual: 0,
        cta: "Start free",
        checkout: null, // free → sign-up
        features: [
          "Limited lesson generations",
          "Limited slides, worksheets & quizzes",
          "Videos with watermark"
        ]
      },
      {
        key: "pro",
        name: "Teacher Pro",
        tag: "Everything you need, every week",
        featured: true,
        badge: "Most popular",
        monthly: 24,
        annual: 240,
        saveLabel: "Save $48 a year",
        cta: "Choose Teacher Pro",
        checkout: { monthly: L.LS_TEACHER_PRO_M || "", annual: L.LS_TEACHER_PRO_A || "" },
        features: [
          "Unlimited lessons (fair use)",
          "Editable PowerPoint",
          "Worksheets & homework",
          "Assessments",
          "Video lessons",
          "Exports"
        ]
      },
      {
        key: "proplus",
        name: "Teacher Pro+",
        tag: "For power users and departments",
        monthly: 49,
        annual: 490,
        saveLabel: "Save $98 a year",
        cta: "Choose Teacher Pro+",
        checkout: { monthly: L.LS_TEACHER_PROPLUS_M || "", annual: L.LS_TEACHER_PROPLUS_A || "" },
        features: [
          "Everything in Teacher Pro, plus:",
          "Higher AI limits",
          "AI Tutor",
          "Exam papers",
          "Priority generation",
          "Early access to new features"
        ]
      }
    ],

    parent: [
      {
        key: "free",
        name: "Free",
        tag: "See what your child gets",
        monthly: 0,
        annual: 0,
        cta: "Start free",
        checkout: null,
        features: ["A taste of practice & explanations"]
      },
      {
        key: "family",
        name: "Family",
        tag: "Practice and help that actually sticks",
        featured: true,
        monthly: 9.99,
        annual: 99,
        saveLabel: "2 months free",
        cta: "Get Family",
        checkout: { monthly: L.LS_PARENT_FAMILY_M || "", annual: L.LS_PARENT_FAMILY_A || "" },
        features: [
          "Practice papers",
          "Homework help",
          "Revision",
          "AI explanations",
          "Progress tracking"
        ]
      }
    ],

    // Founding-teacher offer: Teacher Pro at a locked rate for early adopters.
    // Set `cap` to null to remove the "first N" line entirely.
    founding: {
      name: "Founding Teacher",
      plan: "Teacher Pro",
      price: 10, // USD / month, fixed (not affected by the monthly/annual toggle)
      lockMonths: 24,
      cap: 500,
      cta: "Become a Founding Teacher",
      checkout: L.LS_FOUNDING_TEACHER || ""
    },

    // Schools never see a public price — sales enquiry only.
    schools: {
      tiers: ["Essentials", "Professional", "Enterprise"],
      cta: "Contact sales",
      href: L.SCHOOLS_ENQUIRY_URL || "" // blank → mailto fallback in the page
    }
  };
})();
