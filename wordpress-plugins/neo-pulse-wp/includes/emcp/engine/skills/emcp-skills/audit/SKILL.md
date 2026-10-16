---
name: emcp-skills/audit
description: >-
  Verify-and-polish deep-dive for the Elementor MCP builder: responsive
  controls to set on every build, the WCAG colour-contrast audit (token plan,
  muted-grey rules, rgba minimums, checklist), the visual-review / live-diff
  loop (per-section screenshots, lightweight completeness checks, bulk-insert
  position math), and the agent-browser diagnostic recipes for finding which
  CSS rule is responsible when a page looks wrong (incl. kit-corruption
  recovery). Load this from `emcp-skills` when finishing, checking, or
  debugging a page.
---

# emcp-skills/audit, responsive, WCAG, visual review, diagnostics

> Loaded on demand from the core `emcp-skills` skill. Read the core first for the build workflow.

## 9. Responsive controls

Set on every build. The desktop-only build always needs hand-fixing later.

| Control | Where | Value |
|---|---|---|
| `flex_direction_tablet` AND `flex_direction_mobile` | Multi-column row containers | `column` (set BOTH, not just mobile) |
| `padding_mobile` | Section inner wraps | 15-25 px (vs 48 desktop) |
| `width_tablet` | Hero text/form cols, why-us cols | `100%` |
| `align_mobile: "justify"` + `_flex_size_mobile: "grow"` | Buttons | Full-width on mobile |
| `flex_gap` (asymmetric) | Wide row containers | e.g. `{ column: 60, row: 0 }` |
| `margin_tablet: { top: 20 }` | Second column when stacked | Spacing from above |
| `paragraph_spacing_tablet: 0` | Text-editors in stacked columns | Tight spacing |
| `grid_columns_grid_tablet` | Grids | 2 (4-up trust) or 1 (3-up cards) |
| `border_width_mobile` | Trust-bar cells | Flips edge from right → bottom |
| `typography_font_size_mobile` | Display headings (CTA h2, hero h1) | Smaller (CTA: 60→40px) |
| `position_mobile`, `_padding_mobile`, `_margin_mobile`, `title_typography_font_size_mobile`, `description_typography_font_size_mobile` | Overlay stickers / floating cards | Always |
| `height_mobile` | google_maps | 240 px |
| `hide_tablet: "hidden-tablet"`, `hide_mobile: "hidden-mobile"` | Desktop-only nav, inline booking widgets | Don't fake it with CSS |

---

## 10. WCAG audit

Don't ship a page that's going to need retroactive color patches. Audit the palette **before** the build is "done."

### Token plan: derive `--primary` siblings up front

For any non-neutral brand color, derive both:
- **`--primary-strong`**: darker variant for primary-colored *text* on **light backgrounds**. ≥ 4.5:1 against lightest section bg
- **`--primary-light`**: brighter variant for primary-colored *text + UI* on **dark backgrounds**. ≥ 4.5:1 against darkest section bg

The base `--primary` becomes the decorative hue (buttons with white text, icon-disc backgrounds).

### Muted greys must respect the bg

`#737373` fails AA on typical off-white "paper" bgs (~4.42:1). Start `--ink-soft` / `--muted` at **`#666666` or darker**. Cream backgrounds compound this, even darker grays may be needed.

### Rgba opacity minimums on dark sections

| Use | Minimum opacity |
|---|---|
| Body paragraphs, labels, anything you'd treat as content | `≥ .72` |
| Placeholders, secondary captions, inline notes | `≥ .55` |
| UI borders (form lines, dividers used as affordance) | `≥ .4` |
| Inactive nav/list items shown alongside an active one | `≥ .6` |
| Pure decorative hairlines, glass-card outlines | `.1–.2` is fine |

### Audit checklist

- [ ] Every eyebrow/accent word color on every section bg → ≥ 4.5:1
- [ ] Every body paragraph color on its section bg → ≥ 4.5:1
- [ ] Every small (< 18px) muted/meta line → ≥ 4.5:1 (these fail most often)
- [ ] Every button's text on its bg → ≥ 4.5:1
- [ ] Every form label, placeholder, input border → text 4.5:1, border 3:1
- [ ] Every link/CTA hover state → ≥ 3:1
- [ ] Every "inactive" nav/list state next to an "active" one → ≥ 3:1 if body-sized
- [ ] Icons that convey meaning (status, rating stars) → ≥ 3:1 against their bg

If anything fails, **fix the palette token, not the selector.** Add the missing sibling token to `:root` and reference it everywhere the failing color was used. Don't sprinkle `!important` overrides.

Logo exemption: WCAG 1.4.3 exempts logos and logotypes.

---

## 11. Visual review & live-diff loop

### Per-build visual check

After each significant section is in place:

```bash
agent-browser set viewport 1280 800              # ALWAYS first
agent-browser open https://<site>/<slug>/?bust=$(date +%s)
agent-browser screenshot --full /tmp/page.png
```

Read the screenshot. Decide:
- Rendering glitch? → `update-element`/`update-container`
- Content gap vs source? → add the missing piece
- Matches → next section

`?bust=<timestamp>` bypasses the CDN/browser cache after an Elementor save.

**Reusable helpers.** [`dev-browser/capture-source-sections.js`](dev-browser/capture-source-sections.js) snapshots a locally-served HTML source per-section. [`dev-browser/audit-live-sections.js`](dev-browser/audit-live-sections.js) does the same for the live URL. Both are ~50 lines, edit the selector list per template.

### End-to-end live-diff against a source HTML/design

When the source is a static HTML site, the strongest comparison is per-section pairs:

1. Serve the source locally (e.g. `python -m http.server 8765` from inside the source folder)
2. Use `agent-browser` (or any headless-browser tool you have) to screenshot each top-level `<section>`/`<header>`/`<footer>` at desktop width, save as `01-header.png`, `02-hero.png`, …
3. After the Elementor build is live, screenshot the same selectors on the live page, save as `live-01-header.png`, `live-02-hero.png`, …
4. Read each pair side-by-side. Compile a diff list. Fix every diff with `update-*`. Re-snap and verify.

### Lightweight completeness checks (no browser available)

**Top-level container count vs source section count:**

```bash
grep -nE "<section|<header|<footer" source/index.html | wc -l
```

```js
emcp-tools-get-page-structure(post_id=<N>)
// → structure[].length === top-level container count
```

If source has 12 and live has 7, you're missing 5. List the source sections by content and identify which are missing.

**Content-grep on the live URL:**

```bash
curl -sL "https://<site>/<page-slug>/?bust=N" -o /tmp/live.html
grep -o "<distinctive-class>\|<key-content-string>" /tmp/live.html | sort -u
```

Pick 6–10 unique-per-section strings (CSS class hooks, section headings, prices, person names). If every expected string is in the output, content rendered correctly without needing a screenshot.

> ⚠️ Use the SLUG URL with `-L`, not `?p=ID`. WordPress 301-redirects `?p=<id>` to the canonical slug, without `-L` you get 0 bytes back and falsely conclude the page is broken.

### Bulk-insert position math

`add-container` accepts a `position` param (0 = first, -1 = append). When inserting N sections at sequential positions, each insertion before existing items shifts those items forward by 1.

**Insert backward** (start with the highest target position), safest mental model: each insertion sits at the *current* index of the element it should precede, and earlier insertions don't perturb later math.

**Anchor-stack at one position** (when N sections all stack before one specific existing element): each insert lands at the same anchor index. The N new sections end up in **reverse** order of insertion. Useful when "1, 2, 3, 4 then footer", insert as 4, 3, 2, 1 at the same anchor position.

---

## 12. Diagnostic recipes

When a screenshot looks wrong, the screenshot doesn't tell you *which CSS rule* is responsible. These `agent-browser eval` recipes turn "why is this broken" investigations from a half-hour exercise into a 30-second answer.

```js
// Selector match validation, the most important one.
// Never write a CSS rule to a kit without confirming it matches at least one element.
document.querySelectorAll('.<p>-tier-feats .elementor-icon-list-icon').length

// Computed color of an element + cascade winner
const el = document.querySelector('.<p>-hero-title');
[getComputedStyle(el).color, getMatchedCSSRules?.(el)]

// Elementor global variable resolution
getComputedStyle(document.documentElement).getPropertyValue('--e-global-color-accent')

// CSS-variable definition finder, find every place a var is defined on the page
Array.from(document.styleSheets).flatMap(s => {
  try { return Array.from(s.cssRules); } catch { return []; }
}).filter(r => r.cssText && r.cssText.includes('--e-global-color-text'))
  .map(r => r.cssText.slice(0, 200))

// Full-style sanity blob for a widget, one call, all typography/spacing values
(() => {
  const el = document.querySelector('.<p>-foo');
  const s = getComputedStyle(el);
  return ['fontSize','fontWeight','color','backgroundColor','padding','margin','display','flexDirection']
    .reduce((o,k) => (o[k]=s[k], o), {});
})()
```

**Kit-corruption symptoms** (computed `--e-global-color-text` resolves to `#7A7A7A`, headlines render `rgb(122,122,122)`, system_colors shows `#6EC1E4`/`#54595F`/`#7A7A7A`/`#61CE70`) mean the kit got wiped by someone calling `update-page-settings` on the kit post. Recover via WordPress post revisions:

```bash
wp post list --post_type=revision --post_parent=$(wp option get elementor_active_kit) \
  --fields=ID,post_modified,post_title

wp eval '
  $good = get_post_meta(<REVISION_ID>, "_elementor_page_settings", true);
  update_post_meta(<KIT_ID>, "_elementor_page_settings", $good);
'
wp elementor flush_css
```

Always inspect a few revisions to find the most recent pre-corruption snapshot.

