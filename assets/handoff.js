/* First-touch hand-off to the app, which lives on a DIFFERENT ORIGIN.
 *
 * THE PROBLEM THIS SOLVES. A teacher asks ChatGPT for a tool, lands on
 * sketchcast.app, reads for a minute and clicks "Get started" through to
 * app.sketchcast.app. The app sees a referrer of "sketchcast.app" — us — so it
 * records the visit as "direct" and the real origin is gone. Every visit
 * through the front door looked identical to someone typing the URL in.
 *
 * WHAT IT SENDS. The referring HOST only (or an `android-app` package), never
 * the full referring URL: a whole URL can carry someone else's query string,
 * and none of that belongs in our database.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. No naming. The app owns the single table
 * that maps hosts to channel names ("chatgpt.com" → chatgpt), so a second copy
 * here could only drift out of step with it. This file is a dumb forwarder.
 *
 * Wholly wrapped in try/catch: attribution must never be the reason a link
 * fails to work.
 *
 * Served from /assets/ so the comments above are fetched once and cached for a
 * day, rather than inlined into all 70 generated pages.
 */
(function () {
  try {
    var KEY = "sc_ref";
    var q = new URLSearchParams(location.search);

    function hostOf(u) {
      try {
        var x = new URL(u);
        if (x.protocol === "android-app:") {
          // A tap inside a native app: the package sits in the host position.
          return "pkg:" + (x.hostname || x.pathname.replace(/^\/+/, "")).toLowerCase();
        }
        // Anything that is not the web (intent:, file:, extensions) says
        // nothing about discovery.
        if (x.protocol !== "https:" && x.protocol !== "http:") return "";
        return x.hostname.toLowerCase().replace(/^www\./, "");
      } catch (e) {
        return "";
      }
    }

    var h = hostOf(document.referrer || "");
    // A hop between our own pages is navigation, not discovery.
    if (h === "sketchcast.app" || h.slice(-16) === ".sketchcast.app") h = "";

    // First touch wins, and it must survive a walk across landing pages — by
    // the time someone reaches /pricing the original referrer is long gone.
    var tag = q.get("ref") || h || "";
    try {
      var kept = sessionStorage.getItem(KEY);
      if (kept && !q.get("ref")) tag = kept;
      if (tag) sessionStorage.setItem(KEY, tag);
    } catch (e) {
      // Private mode / storage disabled. The referrer path still works.
    }

    var utm = q.get("utm_source") || "";
    if (!tag && !utm) return;

    var links = document.querySelectorAll('a[href*="app.sketchcast.app"]');
    for (var i = 0; i < links.length; i++) {
      try {
        var L = new URL(links[i].href);
        // Never overwrite a tag already on the link — a hand-built campaign
        // URL is more specific than anything inferred here.
        if (tag && !L.searchParams.has("ref")) L.searchParams.set("ref", tag);
        if (utm && !L.searchParams.has("utm_source")) L.searchParams.set("utm_source", utm);
        links[i].href = L.toString();
      } catch (e) {
        // Leave this link exactly as the author wrote it.
      }
    }
  } catch (e) {
    /* never break a page for bookkeeping */
  }
})();
