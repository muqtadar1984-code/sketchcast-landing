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
 */
(function () {
  "use strict";

  var CHECKOUT = {
    teacherPro: "https://aetheltwin.lemonsqueezy.com/checkout/buy/40f7d222-0d05-4c18-9c87-5aee4254617b",
    teacherProPlus: "https://aetheltwin.lemonsqueezy.com/checkout/buy/6957c1fe-66d3-4f36-af4c-d21436d84cac",
    parentFamily: "https://aetheltwin.lemonsqueezy.com/checkout/buy/10b1b75b-fd10-43b5-8c5e-6243623ff5b2"
  };
  var APP_SIGNUP = "https://app.sketchcast.app/signup"; // TODO: confirm real sign-up path
  var SCHOOLS_ENQUIRY = "mailto:sales@sketchcast.app?subject=SketchCast%20for%20our%20school"; // TODO: swap to the sales form URL if one exists

  window.SKETCHCAST_PRICING = {
    currency: "USD",
    appSignupUrl: APP_SIGNUP,

    teacher: [
      {
        key: "free",
        name: "Free",
        tag: "To try it on your next lesson",
        monthly: 0,
        annual: 0,
        cta: "Start free",
        checkout: APP_SIGNUP,
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
        checkout: CHECKOUT.teacherPro,
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
        checkout: CHECKOUT.teacherProPlus,
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
        checkout: APP_SIGNUP,
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
        checkout: CHECKOUT.parentFamily,
        features: [
          "Practice papers",
          "Homework help",
          "Revision",
          "AI explanations",
          "Progress tracking"
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
      price: 10, // USD / month at checkout with the code (not affected by the toggle)
      lockMonths: 24,
      cap: 500,
      code: "FOUNDINGTEACHER",
      cta: "Claim founding price",
      checkout: CHECKOUT.teacherPro
    },

    // Schools never see a public price — sales enquiry only.
    schools: {
      tiers: ["Essentials", "Professional", "Enterprise"],
      cta: "Contact sales",
      href: SCHOOLS_ENQUIRY
    }
  };
})();
