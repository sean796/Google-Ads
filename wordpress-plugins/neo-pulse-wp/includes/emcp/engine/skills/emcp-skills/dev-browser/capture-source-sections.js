// capture-source-sections.js
// Captures per-section screenshots of a locally-served HTML source.
// Run via: dev-browser run capture-source-sections.js
//
// Prerequisites:
//   - Source folder served at http://127.0.0.1:8765 (e.g.
//     `python -m http.server 8765 --bind 127.0.0.1` from inside the folder)
//   - dev-browser CLI installed and daemon running
//
// Output: `src-01-<name>.png`, `src-02-<name>.png`, … in dev-browser's tmp dir.
// Copy them into your project's screenshots folder for the build phase.

// Open a fresh page (timestamp suffix dodges dev-browser's page cache, // without it, sections from a prior run can stick).
const page = await browser.getPage("src-" + Date.now());
await page.setViewportSize({ width: 1440, height: 900 });

// `domcontentloaded` + bounded image wait avoids hangs on unreachable URLs.
// Append `?v=<ts>` to bust the browser's HTTP cache on each run.
await page.goto("http://127.0.0.1:8765/index.html?v=" + Date.now(), {
  waitUntil: "domcontentloaded", timeout: 25000,
});
await Promise.race([
  page.evaluate(() =>
    Promise.all(Array.from(document.images).map(i =>
      i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })
    ))
  ),
  new Promise(r => setTimeout(r, 6000)),  // hard ceiling on image-load wait
]);
await new Promise(r => setTimeout(r, 800));

// Edit this list per-template. Selectors should match top-level <section> /
// <header> / <footer> elements in the source.
const targets = [
  [".site-header",       "src-01-header"],
  [".hero",              "src-02-hero"],
  [".section--features", "src-03-features"],
  [".section--stats",    "src-04-stats"],
  [".section--cta",      "src-05-cta"],
  [".section--visit",    "src-06-visit"],
  [".site-footer",       "src-07-footer"],
];

for (const [sel, name] of targets) {
  try {
    const el = await page.$(sel);
    if (!el) { console.log("MISS", sel); continue; }
    await el.evaluate(e => e.scrollIntoView({ block: "start" }));
    await new Promise(r => setTimeout(r, 400));
    const buf = await el.screenshot();
    await saveScreenshot(buf, `${name}.png`);
    console.log("OK", name);
  } catch (e) {
    console.log("ERR", name, e.message);
  }
}

// After this finishes, copy the screenshots to your build folder:
//   cp ~/.dev-browser/tmp/src-*.png path/to/build/screenshots/
// Then `Read` each in the agent to see what each section looks like, and
// build the matching Elementor section to match what you SEE, not what
// the HTML literally is.
