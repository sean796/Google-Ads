---
name: emcp-skills
description: >-
  Use this skill whenever you are building, editing, refactoring, or styling
  any page on a WordPress site through the Elementor MCP, recognizable by
  `mcp__*__emcp-tools-*` tools being available, by `.mcp.json` referencing
  `emcp-tools`, or by the user asking for Elementor page work. The most
  common trigger is converting a static HTML/CSS landing page (or a design
  brief, Figma, PDF, screenshot) into a live Elementor page. Also covers
  one-off page edits, kit/global-settings work, custom-CSS placement, form
  building, slideshow heroes, pricing/feature cards, footer composition,
  responsive controls, and accessibility audits.
  Trigger even when the user doesn't say "Elementor MCP" explicitly, if the
  MCP tools are available in the session, this skill applies to any
  page-building or page-editing task on that site.
---

# emcp-skills, Elementor MCP page building, end to end

The single goal: produce Elementor pages where every visible piece is a native widget the buyer can edit from the panel, the layout matches the design source, and the brand is set once at the kit so edits cascade.

This **core** skill is the build workflow and the essentials. The deeper material is split into two on-demand sub-skills, load one with `get-skill` when you need it:

- **`emcp-skills/recipes`**: component recipes (pricing/tier cards, stat strips, trust bars, slideshow heroes, before/after cards, reels carousels, FAQ accordions, decorative footers, how-it-works steps), the flex/grid/position **layout traps & fixes**, the singular **custom-CSS** widget pattern, **counter/form** gotchas, and the settings-naming reference. Load it when building a specific component or when a layout/CSS/widget behaves wrong.
- **`emcp-skills/audit`**: **responsive** controls, the **WCAG** contrast audit, the **visual-review / live-diff** loop, and **diagnostic** recipes. Load it when finishing, checking, or debugging a page.

Order of work: **0** vertical routing · **1** onboarding · **2** the HTML/CSS → Elementor workflow · **3** core patterns · **4** native-widget substitution table · **5** deep-dive sub-skills · **6** anti-patterns · **7** custom widget builder.

---

## 0. Vertical routing (Pro skill packs)

If the site has a clear industry, from the brief, the business name, existing content, or by asking the user one question, **read the matching `verticals/<slug>.md` before building.** It gives you the brand voice, SEO keywords, page structure, conversion patterns, compliance notes, and the exact **Brand Kit + prompt + template** to use for that trade. Read **only** the one that matches; skip this entirely if the site is generic.

| Vertical | Read | Triggers |
|---|---|---|
| Dental / orthodontics | `verticals/dental.md` | dentist, orthodontist, dental clinic, Invisalign, oral surgeon |
| Med-spa / aesthetics | `verticals/med-spa.md` | med spa, aesthetics, Botox, filler, laser, skincare, cosmetic clinic |
| Therapy / counseling | `verticals/therapy.md` | therapist, counseling, psychotherapy, mental health, massage, chiropractor |
| Fitness | `verticals/fitness.md` | gym, trainer, fitness studio, yoga, pilates, crossfit |
| Automotive | `verticals/automotive.md` | auto repair, mechanic, dealership, detailing, driving school |
| Food & restaurant | `verticals/food-restaurant.md` | restaurant, café, bakery, bar, coffee shop, pizzeria |
| Wedding & events | `verticals/wedding.md` | wedding, venue, planner, florist, bridal |
| Real estate | `verticals/real-estate.md` | realtor, brokerage, property, homes for sale |
| Legal | `verticals/legal.md` | law firm, attorney, solicitor, litigation |
| Photography | `verticals/photography.md` | photographer, studio, portfolio, headshots |

The four Health & Wellness verticals (dental, med-spa, therapy, fitness) share the prompt category but carry distinct voice, kit, structure, and compliance, match the most specific trigger. Each file's **Recommended library combo** section names the exact Brand Kit and prompt slug(s) to apply; follow it rather than guessing. If a named kit/prompt/template isn't available on the site, fall back as the file instructs (next prompt → category → kit category) rather than hard-failing.

> Vertical packs are a Pro feature, these files ship only in the premium build. If `verticals/` isn't present, this is a free install; skip to §1 and build with the general skill.

---

## 1. Onboarding

If `mcp__*__emcp-tools-*` tools are already available, the site is wired up, skip to §2.

If they're not, the user is starting fresh. Detect framework first:

```bash
test -f composer.json && grep -q '"roots/wordpress"' composer.json && echo BEDROCK || echo STANDARD
```

Install path differs:
- **Standard WP**: `wp-cli` + plugin zip from GitHub Releases
- **Bedrock**: `composer require` with VCS repo

Both flows require:
1. The `wordpress/mcp-adapter` foundation plugin (provides the MCP transport)
2. The Elementor MCP plugin (registers the `emcp-tools-*` tools)
3. Verify with `wp mcp-adapter list`, the `emcp-tools` server should be registered
4. Write `.mcp.json` in the project root using STDIO (preferred for local) or HTTP (for cloud)

**First-session checklist**, run once per site:
- Plugins active (`wp plugin list --status=active`)
- If you'll upload SVG icons: `wp option update safe_svg_upload_roles '["administrator"]' --format=json`, `safe-svg` 2.4+ ships with the role gate empty, blocking all SVG uploads
- Kit ID known: `wp option get elementor_active_kit`
- `agent-browser set viewport 1280 800`, default is mobile-width and will make every flex row look broken

---

## 2. The HTML/CSS → Elementor conversion workflow

**The common case.** The user hands you a folder with `index.html`, `styles.css`, optional `script.js`, and wants it as a live Elementor page where every piece is buyer-editable. This is the workflow that works. Use it as the default.

### 2.1 Decide the build pace

Two viable approaches, pick by complexity:

| Approach | When | What you do |
|---|---|---|
| **Per-section incremental** | First time on a site, complex hero / multi-step interactions | `create-page` (draft) → for each section: `add-container` → child widgets (`add-free-widget` / `add-pro-widget`) → `update-element` styling → save → visual check → next section |
| **One-shot declarative build** | You've done a few pages on the site, design is simple, you want one big POST | Build the whole tree as a JSON spec → `build-page` (or POST to the build-page REST ability) → live audit → fix per-section deltas via `update-*` |

Both end at the same visual-review loop. Incremental is safer for iteration; one-shot is faster for repeats. Start incremental until you've built the same pattern twice on this site.

**For one-shot builds of large pages** (10+ sections, 200+ widgets) the skill ships with a declarative pipeline in [`scripts/`](scripts/README.md): author a single `templates/<slug>.mjs` config using widget factory helpers, run `node build.mjs <slug>` → `node ship.mjs <slug>`, and the JSON is POSTed directly to the `build-page` REST ability, never round-tripped through your context window. See [`scripts/templates/example.mjs`](scripts/templates/example.mjs) for the shape of a complete config. Use the pipeline for full-page work; use the raw MCP `add-free-widget` / `add-pro-widget` / `update-element` calls for one-section iteration and audit fixes.

### 2.2 Read the source thoroughly first

Before any MCP call:
1. **Read `index.html` end-to-end.** Map sections in order. Note every distinct UI atom (cards, badges, ribbons, hover states, accordions, sliders, forms, maps).
2. **Read `styles.css` end-to-end.** Note the `:root` variables (palette + fonts), every `@media` breakpoint, every `::before`/`::after` decoration, every keyframe animation, every hover/focus state.
3. **Decide the prefix.** Pick a 2-4 char namespace for class hooks (`hp` for "Healthy Paws", `cf` for "Coffee Farm", anything short). All custom classes will be `<prefix>-<purpose>` so the CSS doesn't collide with the theme.
4. **Narrate the layout in prose** before any `add-*` call. Decompose into sections → containers → widgets → settings. Catches design mistakes before they're 20 calls deep, and turns the build into a transcription rather than a design exercise.

### 2.3 Placing widgets: the catalog model, then the two-step pattern

**There are no per-widget tools.** As of v3.0.0 the old `add-heading` / `add-button` / `add-form` / `add-icon-box` / universal `add-widget` calls are **gone**. Every widget is placed by passing a `widget_type` to one of two catalog-backed tools:

- **`add-free-widget`**: any free/core widget (`heading`, `text-editor`, `image`, `button`, `icon`, `icon-box`, `icon-list`, `counter`, `accordion`, `tabs`, `star-rating`, `google_maps`, `social-icons`, `image-carousel`, `html`, `divider`, `spacer`, `menu-anchor`, …).
- **`add-pro-widget`**: any Elementor Pro / WooCommerce widget (`form`, `slides`, `posts`, `nav-menu`, `loop-grid`, `loop-carousel`, `price-table`, `price-list`, `call-to-action`, `portfolio`, `nested-tabs`, `nested-accordion`, `woo*`, …). Registered only when Elementor Pro is active.

**Throughout this skill, when a recipe names a widget ("heading", "counter", "form"), that name is the `widget_type`**: route it to `add-free-widget` (free/core) or `add-pro-widget` (Pro/Woo) by tier.

**Discover → inspect → act** whenever you're unsure of a widget's name, tier, or accepted settings:
1. **Discover**: `list-widgets` (filter by `tier` / `category` / `search`) returns the catalog index, including each widget's `tier` (free / pro / woo).
2. **Inspect**: `get-widget-schema(widget_type="…")` returns that widget's curated params (pass `types: [...]` to batch several, or `full: true` for the raw control schema).
3. **Act**: `add-free-widget` / `add-pro-widget` with `widget_type` + `settings`; the catalog merges in sane defaults automatically.

For the common widgets in the recipes below you can skip discovery and call `add-free-widget` / `add-pro-widget` directly, reach for `list-widgets` / `get-widget-schema` only when a widget is unfamiliar or a setting gets rejected.

**Then the two-step pattern is non-negotiable, the add call for content, `update-element` for styling.** The `add-free-widget` / `add-pro-widget` schema validators are strict and reject most styling args. Don't waste calls trying styling args inside the add call and recovering from rejections. Go straight to `update-element` after every add.

```
# Step 1: add the widget with content only (free widget → add-free-widget)
add-free-widget(post_id=1537, parent_id="abc123", widget_type="heading",
                settings={"title": "Pricing", "header_size": "h2"})
→ returns element_id "64bfc7a"

# A Pro widget is the identical call shape, via add-pro-widget:
# add-pro-widget(post_id=1537, parent_id="abc123", widget_type="form", settings={...})

# Step 2: apply the styling via update-element
update-element(post_id=1537, element_id="64bfc7a", settings={
  "align": "center",
  "title_color": "#366FFE",
  "typography_typography": "custom",
  "typography_font_family": "Inter",
  "typography_font_weight": "700",
  "typography_font_size": {"unit": "px", "size": 56, "sizes": []},
  "_margin": {"top": "24", "right": "0", "bottom": "16", "left": "0", "unit": "px", "isLinked": false}
})
```

This applies to every widget type. The reason it matters: styling stored in element settings appears in the Elementor Style tab and is panel-editable. Styling stored in Custom CSS is not. The buyer shouldn't have to dig into code to change a color.

### 2.4 Translate per section, not per element

For each source `<section>`:
1. Read the section's HTML + the CSS rules that touch its classes.
2. Look at the rendered design (screenshot, browser preview).
3. Build the Elementor section to match what the design **looks like**, not what the HTML literally is. Elementor's wrappers (`.elementor-element` → `.elementor-widget-container` → widget output) break naive class translation. Pick native widgets whose Style-tab controls reach the look (see §4 substitution table); use class-hook CSS only for things widgets can't express.
4. After building, save and look. Compare to the source. Fix deltas with `update-element`/`update-container`. Move on when it matches.

### 2.5 The singular CSS HTML widget, for any custom CSS

All custom CSS for the page lives in **one HTML widget at the bottom of the page**, wrapped in `<style>…</style>`. Contents:
- `:root` block declaring the `--<prefix>-*` color/font tokens from the source
- Class-hook rules (`.<prefix>-*`) that widget controls can't express
- Hover states, `::before`/`::after`, keyframes
- Responsive overrides if widget responsive controls fall short

Everything else is in widget settings, not CSS. See the `emcp-skills/recipes` sub-skill (Custom CSS) for full mechanics + the `update-widget` read-modify-write trap.

### 2.6 Source-folder cleanup

Once the page is live and approved, delete the source `index.html` / `styles.css` / `script.js` (and any screenshots). The Elementor page is the deliverable. Keeping the source folder invites drift between "the design" and "the live page."

---

## 3. Core patterns

### Native widgets over HTML, the cardinal rule

HTML widgets defeat Elementor's value proposition: once content is in an HTML widget (`add-free-widget` with `widget_type: "html"`), the editor can't drag, recolor, or reorder pieces from the panel.

**The decomposition rule:** prefer more widgets over fewer.
- Three native widgets (icon, title, description) in a column container > one icon-box
- One icon-box > one HTML widget
- One HTML widget is the last resort when the design needs markup with no native equivalent (custom inline SVG, embeds, specific semantic HTML the widgets can't produce)

When in doubt, ask: **can the buyer edit each visible field via the Elementor panel?** If no, refactor.

### Kit / globals

Before placing the first container, call `emcp-tools-get-global-settings`. It returns:
- `system_colors`, Primary/Secondary/Accent/Text
- `system_typography`, h1/h2/body
- `custom_css`, kit-level CSS already in place

**Use globals via `__globals__` references** rather than redefining colors per element:

```json
"title_color__globals__": "globals/colors?id=accent"
```

So kit edits cascade. Per-element brand colors hard-coded in widget settings = the user has to re-edit every widget when the brand changes.

### Kit's baseline CSS

Look at `settings.custom_css` from the global settings response. If it doesn't contain `skill-baseline: applied` or `skill-baseline: opt-out`, propose adding these defensive overrides:

```css
/* skill-baseline: applied */
.elementor-widget-text-editor > p:last-child,
.elementor-widget-text-editor > .elementor-widget-container > p:last-child { margin-bottom: 0; }
.elementor-widget-text-editor > p:first-child,
.elementor-widget-text-editor > .elementor-widget-container > p:first-child { margin-top: 0; }
.elementor a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
```

Two selectors per margin rule because Elementor's "Optimized DOM Output" setting toggles whether `<p>` is direct child of the widget or nested in `.elementor-widget-container`.

**Apply only via `wp eval` read-modify-write, NEVER `update-page-settings` on a kit post:**

```bash
KIT_ID=$(wp option get elementor_active_kit)
wp eval '
  $kit_id = '"$KIT_ID"';
  $settings = get_post_meta($kit_id, "_elementor_page_settings", true) ?: [];
  $existing = $settings["custom_css"] ?? "";
  $baseline = "/* skill-baseline: applied */\n.elementor-widget-text-editor > p:last-child,\n.elementor-widget-text-editor > .elementor-widget-container > p:last-child { margin-bottom: 0; }\n.elementor-widget-text-editor > p:first-child,\n.elementor-widget-text-editor > .elementor-widget-container > p:first-child { margin-top: 0; }\n.elementor a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }";
  $settings["custom_css"] = trim($existing) . "\n\n" . trim($baseline) . "\n";
  update_post_meta($kit_id, "_elementor_page_settings", $settings);
'
wp elementor flush_css
```

> ⚠️ `update-page-settings` does a **full replace** on the kit's `_elementor_page_settings` meta. Passing `{"custom_css": "..."}` to a kit post_id wipes `system_colors`, `system_typography`, every `__globals__` reference, the brand kit is gone. Only `wp eval` is safe for kit-level writes. The MCP path is safe for regular `page`/`post` post types only.

### Page template choice

| Use case | Setting |
|---|---|
| Standalone landing page (no theme header/footer) | `template: "elementor_canvas"` |
| Full-width within site chrome | `template: "elementor_header_footer"` |
| Content page integrated with site nav | omit or `template: "default"` |

Set via `emcp-tools-update-page-settings` on the page (NOT the kit) after creation.

---

## 4. Native widget substitution table

Before reaching for an HTML widget, check this table:

| What you might build as HTML | Native widget | Key settings |
|---|---|---|
| `<nav>` with `<a>` links | **icon-list, `view: inline`** | `text_color`/`text_color_hover`, typography group, `hide_tablet`/`hide_mobile` |
| Header phone + sub-line | **2× heading** in flex column | Display font for the number, body font for "Call Today" |
| Animating numbers (years, customers, rating) | **counter widget × N** in flex row | See `emcp-skills/recipes` (counter & form gotchas), `ending_number`, `prefix`/`suffix`, **always set `title: ''` explicitly** |
| Static stats panel (cells with label + sub) | **grid container parent (4 cols) → 4 child containers → heading + heading + text-editor per cell** | Use container's **native** `background_hover_color` (Normal/Hover tabs), never write `.cell:hover { background: ... }` CSS |
| Centered ribbon ("Most Popular") on a card | **flex wrapper container** holding a single heading widget | Wrapper is the absolute element (`position: absolute`, `_offset_y`, `content_width: 'full'` + `width: {size: 100, unit: '%'}`, `flex_justify_content: center`; `_element_width` / `_element_custom_width` are widget keys and do nothing on a container). The heading sits at natural width and is centered by the wrapper's flex. Putting `_offset_orientation_h: center` on the heading itself stretches it |
| Off-corner badge (NOT centered), hearts, "NEW", "Editor's Pick" | **heading or icon widget** with `_position: absolute` directly | Skip the wrapper. Widgets accept the full positioning family: `_position: absolute`, `_offset_orientation_h: end` + `_offset_x_end`, `_z_index`, `_padding`, `_background_color`, `_border_radius`, `_box_shadow_*`, `_element_width: initial` + `_element_custom_width: auto`. Parent needs `position: relative` |
| Floating overlay info card (with icon + title + sub) | **container** with `position: absolute` + offsets, holding an **icon-box** widget | Container is the absolute layer; icon-box (`position: "inline-start"`) draws the icon-pill + title + description |
| Plain styled link list (footer columns, legal links) | **icon-list** with `selected_icon: {value: "", library: ""}` per item | Empty icon object removes the glyph entirely, no `icon_color: rgba(0,0,0,0)` or `hide_*` hacks |
| Multi-line label/value list (address, hours) | **single icon-list** with HTML in `text` | `<span class="label">…</span><br><span class="value">…</span>` styled via class hooks; `icon_self_align: center`, `icon_self_vertical_align: center`, `icon_vertical_offset` for proper centering against multi-line content |
| Footer social row | **social-icons widget** | `shape: circle/rounded/square`, `icon_color: "custom"` to enable per-state colors. **Set strong contrast** between `icon_primary_color` (background disc) and `icon_secondary_color` (glyph), close values make the glyph invisible |
| Section eyebrow ("WHAT WE DO") | **heading, `header_size: div`** | Body font, ~14-16px, 600 weight, uppercase, letter-spacing 0.2em |
| Section head (eyebrow + h2 + lead) | **heading + heading + text-editor** in a capped container | `flex_align_items: stretch`, max-width ~720-800px. NEVER one HTML block |
| Star ratings | **star-rating widget** | `stars_color: <accent>`. Note: Elementor renders FA icons as inline SVG and never loads the FA font, so `<i class="fa-star">` doesn't render, the native star-rating widget works |
| Embedded map | **google_maps widget** | `address`, `zoom`, `height` |
| Booking / contact form | **form widget** (Elementor Pro) | Each field is `{type, field_label, placeholder, required, _id, width, ...}`. Multi-select via `field_options` newline-separated |
| Background image fill on a column / card | **container `background_image`** + `background_overlay_background: gradient` for darkening | NOT an image widget. `background_position`, `background_size: cover`. Use the native overlay control, never write `::after` CSS for a dim |
| Hero/carousel multi-image fade | **container `background_background: slideshow`** | Minimal config: gallery, `transition_duration: 1500`, `ken_burns: yes`, fallback `background_color`, `overflow: hidden`. Skip loop/slide_duration defaults |
| Feature card (icon + title + description) | **icon-box widget** | Single widget, not three separate. `position: "inline-start"` puts icon to the left |
| Tabbed content | **nested-tabs widget** (free) | Supports containers/widgets inside each tab, populate by parent_id + position index |
| FAQ collapsible | **accordion widget** (free) | `faq_schema: yes`, `selected_icon` (plus) + `selected_active_icon` (minus/times), title/content typography groups |
| Hover-reveal before/after image cards | **container.card** with two stacked `<img>` in an HTML pair + clip-path CSS hover | Currently no native before/after widget. The clip-path-on-hover pattern in `emcp-skills/recipes` is the cleanest approach |
| Pricing / plan / tier card | **container.tier** with native composition (badge ribbon + heading + price + feature list + button) | See `emcp-skills/recipes` (§5.1) |

**HTML widget legitimate use cases** (still valid):
1. Brand mark with custom inline SVG (header + footer brand block)
2. Bespoke price decoration that needs `<small>` for cents, but the **wrapper is a heading widget** with a class hook, not pure HTML
3. Hero eyebrow `<span>` with leading horizontal accent line
4. Decorative SVG that's truly bespoke (a hand-drawn rosette with `<textPath>`, a brushed-metal nameplate pattern)
5. Marquee strip with `<script>`-driven JS clone for seamless looping

---
## 5. Deep-dive sub-skills

Load these with `get-skill` the moment the task goes past the core workflow above, don't guess a recipe or a trap from memory when the exact pattern is one call away:

| Load | When |
|---|---|
| `get-skill("emcp-skills/recipes")` | Building a pricing card, stat strip, slider hero, accordion, reels carousel, decorative footer, etc.; OR a flex/grid/position layout renders wrong; OR you're writing custom CSS or placing a counter/form widget |
| `get-skill("emcp-skills/audit")` | Adding responsive controls; auditing colour contrast (WCAG); running the visual-review / live-diff loop; or debugging *which* CSS rule is responsible for a broken render |

Both are always available when this skill is. Build from the core; pull a sub-skill for depth.

---

## 6. Anti-patterns

| Anti-pattern | What to do instead |
|---|---|
| Falling back to an HTML widget after one `add-free-widget`/`add-pro-widget` styling rejection | Go straight to `update-element` with the styling keys |
| Skipping `get-global-settings` before the first container | Read the kit first; reference colors/fonts via `__globals__` |
| Defining brand colors per-element | Use `__globals__` references: `"title_color__globals__": "globals/colors?id=accent"` |
| Re-uploading images already in Media Library | Check `wp media list` first |
| Building a whole section through one `build-page` JSON when you've never built it on this site before | Build incrementally; iterate per-section |
| Forgetting `agent-browser set viewport` | Always set to 1280×800 (or wider) before screenshotting desktop layouts |
| Giving a flex child `_flex_grow: "1"` without `_flex_size: "none"` on its fixed sibling | Pair them. Symptom: fixed sibling disappears |
| Flex-column container without explicit `flex_align_items` | Set `flex_align_items: "stretch"`, Elementor injects `"center"` otherwise, breaking `align: "left"` on children |
| Calling `emcp-tools-update-page-settings` on a kit post | NEVER. Full replace on kit meta wipes the brand. Use `wp eval` read-modify-write |
| `update-widget settings.html` without reading current content first | Round-trip: `get-element-settings` → edit string → `update-widget` with full new string |
| Verifying a saved page with `curl https://site/?p=<ID>` (no `-L`) | Use `curl -sL https://<site>/<slug>/?bust=N`, slug, follow redirects, cache-bust |
| Inserting multiple top-level sections at hard-coded `position` indices computed from the original tree | Each insertion shifts subsequent indices by 1. Insert backward or anchor-stack |
| Setting `_css_classes` on a container | Containers use `css_classes` (no underscore). `_css_classes` silently writes to DB but never renders |
| Decorative pseudo-element via `::before` on a container | Elementor's `.e-con::before` overlay layer wins. Use `::after` with explicit `inset: auto` reset |
| Counter widget without explicit `title: ''` | Renders Elementor's "Cool Number" placeholder beneath every counter |
| Form widget with `buttonText` | Submit reads "Send" (Elementor default). The key is `submitText` |
| Image widget for full-bleed cover-cropped card images | Use a `background_image` container with `min_height` + `background_size: cover` |
| Faking vertical dividers via CSS on a parent | Bordered cell containers (each owns its `border_width.right: 1`) so mobile can flip to bottom borders |
| Centered ribbon using `_offset_orientation_h: center` on the heading itself | Stretches the heading. Use a flex wrapper container with `flex_justify_content: center` containing the heading at natural width |


---

## 7. Custom widget builder (Pro)

Need a **reusable, panel-editable widget type** the buyer will reuse and edit themselves (pricing card, stat callout, team-member card, feature tile)? Build it as a real custom Elementor widget from a spec. The MCP tools compile your spec into a `Widget_Base` class in an isolated sandbox and register it under **"Custom (EMCP)"** in the panel. You submit controls + an HTML template with `{{placeholder}}`s; the plugin writes and escapes **all** the PHP, there is no raw-PHP path.

Flow: `create-custom-widget(spec)` saves the widget as an inactive draft and returns a `widget_name` (e.g. `emcp_custom_42`) → ask the user to activate it in **Neo EMCP → Sandbox → Widgets** (no MCP tool can) → then place it with `add-free-widget` (`widget_type` = that name, `settings` keyed by your control names). Manage with `update-custom-widget` / `get-custom-widget` / `list-custom-widgets` / `set-widget-status` / `delete-custom-widget`, or the **Neo EMCP → Sandbox → Widgets** screen.

**Read [`widget-builder.md`](widget-builder.md) before building one.** It has the full spec shape, every control type and how its `{{name}}` renders, the `{{#if}}`/`{{#each}}` template syntax, styling via `selectors` (`{{WRAPPER}}`/`{{VALUE}}`), a complete worked example, and the gotchas. Build a custom widget only when a reusable editable component is genuinely warranted, for one-off sections, keep using native containers + widgets.

If the `*-custom-widget` tools aren't available in the session, they're disabled by default: have the user enable them on **Neo EMCP → Tools → Widget Builder**.
