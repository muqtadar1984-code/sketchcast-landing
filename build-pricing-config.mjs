// Generates pricing.links.js from environment variables.
//
// Run before deploying so the public checkout links are injected from the
// Cloudflare project's env vars (test or live) instead of being committed:
//
//   node build-pricing-config.mjs && npx wrangler deploy
//
// In a git-connected Cloudflare Workers build, set this file as the build
// command (`node build-pricing-config.mjs`) and set the LS_* / URL variables in
// the project's environment. With no env set it simply re-emits blanks, which
// the page handles gracefully. These values are PUBLIC links, not secrets.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const KEYS = [
  "LS_TEACHER_PRO_M",
  "LS_TEACHER_PRO_A",
  "LS_TEACHER_PROPLUS_M",
  "LS_TEACHER_PROPLUS_A",
  "LS_PARENT_FAMILY_M",
  "LS_PARENT_FAMILY_A",
  "LS_FOUNDING_TEACHER",
  "SCHOOLS_ENQUIRY_URL",
  "APP_SIGNUP_URL"
];

const values = {};
for (const key of KEYS) values[key] = (process.env[key] || "").trim();
if (!values.APP_SIGNUP_URL) values.APP_SIGNUP_URL = "https://app.sketchcast.app/signup";

const banner =
  "/* GENERATED FILE — do not edit by hand.\n" +
  " * Written by build-pricing-config.mjs from environment variables at build time.\n" +
  " * Public checkout links only — not secrets. See .env.example for the variables. */\n";

const body = banner + "window.SKETCHCAST_LINKS = " + JSON.stringify(values, null, 2) + ";\n";

const out = fileURLToPath(new URL("./pricing.links.js", import.meta.url));
writeFileSync(out, body);

const filled = KEYS.filter((k) => k !== "APP_SIGNUP_URL" && values[k]).length;
console.log(`pricing.links.js written — ${filled}/${KEYS.length - 1} checkout links set.`);
