/* The site's own visit counter — one small beacon per page view.
 *
 * WHAT IT SENDS. The page's PATH (no query string) and the referring HOST,
 * to the app's /api/public/visit, which writes one row the staff console
 * reads (app: src/app/api/public/visit/route.ts). The browser adds the
 * Origin header itself; the app takes the site from that, never from us.
 *
 * WHAT IT DOES NOT DO. No cookie, no localStorage, no fingerprinting, no
 * third-party script. The app hashes the address with a salt that changes
 * every day and keeps no IP, so a day's unique visitors can be counted and
 * nobody can be followed across days. The privacy policy says exactly this
 * (section 9).
 *
 * sendBeacon with a text/plain body is a CORS "simple request": no
 * preflight, and it still goes out when the tab is closing. Wholly wrapped
 * in try/catch: a counter must never be the reason a page misbehaves.
 *
 * Served from /assets/ so the comments above are fetched once and cached
 * for a day, rather than inlined into all 70 generated pages.
 */
(function () {
  try {
    var ENDPOINT = "https://app.sketchcast.app/api/public/visit";
    var path = location.pathname || "/";
    var q = path.indexOf("?");
    if (q >= 0) path = path.slice(0, q);
    var ref = "";
    try {
      ref = document.referrer ? new URL(document.referrer).hostname : "";
    } catch (e) {
      ref = "";
    }
    var body = JSON.stringify({ p: path, r: ref });
    var sent = false;
    if (navigator.sendBeacon) {
      try {
        sent = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }));
      } catch (e) {
        sent = false;
      }
    }
    if (!sent && window.fetch) {
      fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, mode: "cors", credentials: "omit",
                        headers: { "Content-Type": "text/plain" } }).catch(function () {});
    }
  } catch (e) {
    /* never break a page for bookkeeping */
  }
})();
