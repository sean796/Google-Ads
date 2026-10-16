// audit-live-sections.js
// Captures per-section screenshots of a live Elementor page (after build/ship)
// so you can read pairs against the source screenshots and diff.
//
// Run via: dev-browser run audit-live-sections.js
//
// EDIT THESE for each page:
//   - LIVE_URL          → the live preview URL of your page
//   - PREFIX            → your page-scoped class prefix (the `P` in templates)
//   - sections          → list of [container-class, output-filename] pairs

const LIVE_URL = "https://example.com/your-page-slug/";
const PREFIX   = "ex";   // matches the `P` constant in your template config

const sections = [
  ["site-header",  "live-01-header"],
  ["hero",         "live-02-hero"],
  ["features",     "live-03-features"],
  ["stats",        "live-04-stats"],
  ["cta",          "live-05-cta"],
  ["site-footer",  "live-06-footer"],
];

// Cache-bust the URL + a unique page name so dev-browser re-renders cleanly.
const page = await browser.getPage("live-" + Date.now());
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${LIVE_URL}?v=${Date.now()}`, {
  waitUntil: "load", timeout: 30000,
});
await new Promise(r => setTimeout(r, 3000));

for (const [sec, name] of sections) {
  try {
    const sel = `.${PREFIX}-${sec}`;
    const el  = await page.$(sel);
    if (!el) { console.log("MISS", sel); continue; }
    await el.evaluate(e => e.scrollIntoView({ block: "start" }));
    await new Promise(r => setTimeout(r, 500));
    const buf = await el.screenshot();
    await saveScreenshot(buf, `${name}.png`);
    console.log("OK", name);
  } catch (e) {
    console.log("ERR", name, e.message);
  }
}

// Diff workflow:
//   1. `Read` each src-NN-*.png / live-NN-*.png pair via the Read tool.
//   2. Compile a per-section diff list (wrong color, missing element, etc.).
//   3. Fix each diff via `update-element` or `update-container` MCP calls.
//   4. Re-run this script after each batch of fixes to confirm.
//
// Animations: scroll counter/animated sections into the middle of the viewport
// (`scrollIntoView({ block: "center" })`) and wait ~3500ms before screenshot, // the counter widget animates over `duration` ms after entering view.
