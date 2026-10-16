---
name: emcp-skills/recipes
description: >-
  Deep-dive for the Elementor MCP builder: component recipes (pricing/tier
  cards, stat strips, trust bars, slideshow heroes, before/after cards, reels
  carousels, FAQ accordions, decorative footers, how-it-works steps), the
  flex/grid/position layout traps and their fixes, the container-vs-widget
  setting-key split, the singular custom-CSS widget pattern and its
  read-modify-write trap, counter and form widget gotchas, converting
  HTML-soup widgets into native containers/widgets, and the settings-naming
  reference. Load this from `emcp-skills` when building a specific component,
  when converting raw HTML into native elements, or when a layout/CSS/widget
  behaves wrong.
---

# emcp-skills/recipes, component recipes, layout traps, custom CSS, widget gotchas

> Loaded on demand from the core `emcp-skills` skill. Read the core first for the build workflow and core patterns.

## 5. Component recipes

Generic component patterns. Pick a prefix (`<p>`) for the project's class namespace and substitute.

### 5.1 Pricing / tier card

Every editable field is a native widget. Composition:

```
container.<p>-tier                         (CSS: bg, padding, border, hover lift; featured variant flag)
├── heading                ribbon          (e.g. "MOST BOOKED", `_position: absolute` top-center if needed,
│                                            else inline. Widget-controlled bg/padding/border-radius)
├── heading h3             tier name       (display serif/sans, 28-32px)
├── heading                weight/eligibility line (mute color)
├── container              price row       (flex row, baseline align)
│   ├── heading b          "$45"           (display, 60px, line-height 1)
│   └── heading            "/ month"       (mute, smaller)
├── icon-list              features        (5-6 items with checkmark or dot icons.
│                                            Use `selected_icon` per item or an `::before` dot via CSS)
└── button                 CTA             (`_element_custom_width: 100%`, native variant per featured/not)
```

CSS hooks (in the singular bottom widget):
```css
.<p>-tier { background:#fff; border:1px solid var(--<p>-line); border-radius:8px; padding:36px 32px; transition:transform .3s; display:flex; flex-direction:column; }
.<p>-tier:hover { transform:translateY(-4px); }
.<p>-tier-f { background:var(--<p>-accent); color:#fff; transform:translateY(-14px); box-shadow:0 30px 60px rgba(0,0,0,.15); }
```

Use a separate **white-on-accent button** variant for the featured tier, the default primary button is accent-on-white and disappears against the accent bg.

### 5.2 Stats panel (static, not animating)

```
container.<p>-stats         (grid 4-col, white bg, border, border-radius)
├── container.<p>-stat-cell (each: padding 36/28, text-align center, border-right 1px line on first N-1)
│   ├── heading             number (display, 52px, accent color)
│   ├── heading             label (h4, 15px 700)
│   └── text-editor         sub-label (body, 13px muted)
└── ...
```

Use the container's NATIVE hover-bg setting (`background_hover_background: classic` + `background_hover_color`). Don't write `.cell:hover {}` CSS.

### 5.3 Stats strip (animating numbers)

```
container.<p>-stats-strip   (flex row, top border, padding)
├── counter                 ending_number 20, suffix "+", title="Years", title:'' if label goes outside (see §8)
├── counter                 ending_number 5000, suffix "+", title="Customers"
├── counter                 ending_number 4.9, suffix "★", title="Rating"
└── counter                 ending_number 100, suffix "%", title="On-time"
```

See §8, **always pass `title: ''` explicitly** to suppress Elementor's "Cool Number" placeholder.

### 5.4 Trust-bar with vertical dividers

Outer: `container_type: grid`, `grid_columns_grid: 4`, `grid_columns_grid_tablet: 2`. Each of the first N-1 cells:

```json
{
  "border_border": "solid",
  "border_width":        { "top":"0","right":"1","bottom":"0","left":"0" },
  "border_width_mobile": { "top":"0","right":"0","bottom":"1","left":"0" },
  "border_color": "#FFFFFF1F"
}
```

Last cell: omit border. The mobile flip turns the vertical dividers into horizontal ones when cells stack.

### 5.5 Hero with transparent overlapping header + container slideshow

Header: top-level container with `css_classes: "<p>-header"`. CSS class sets `position: absolute !important; top: 0; left: 0; right: 0; z-index: 50; background: rgba(0,0,0,.08)`. Hero needs `padding-top: 160px` to clear it.

Hero container, minimal slideshow config:
```json
{
  "background_background": "slideshow",
  "background_slideshow_gallery": [/* 4 image objects with id+url */],
  "background_slideshow_transition_duration": 1500,
  "background_slideshow_ken_burns": "yes",
  "background_color": "#1A1A1A",
  "overflow": "hidden"
}
```

Skip `background_slideshow_loop`, `background_slideshow_slide_duration`, `background_slideshow_slide_transition`, `background_slideshow_ken_burns_zoom_direction`, defaults handle them.

### 5.6 Before/after hover-reveal card

No native widget exists. The cleanest approach:

```
container.<p>-ba             (the card; overflow hidden, border-radius)
├── html                     <figure class="<p>-ba-pair">
│                              <img class="<p>-ba-before" src="…">
│                              <img class="<p>-ba-after"  src="…">
│                              <span class="<p>-ba-chip <p>-ba-chip-before">BEFORE</span>
│                              <span class="<p>-ba-chip <p>-ba-chip-after">AFTER</span>
│                            </figure>
└── container                caption block (heading + heading for name + breed/desc)
```

CSS:
```css
.<p>-ba-pair { position:relative; aspect-ratio:4/3; overflow:hidden; margin:0; }
.<p>-ba-before, .<p>-ba-after { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.<p>-ba-after { clip-path: inset(0 0 0 50%); transition: clip-path .6s cubic-bezier(.2,.7,.2,1); }
.<p>-ba:hover .<p>-ba-after, .<p>-ba:focus-within .<p>-ba-after { clip-path: inset(0 0 0 0); }
.<p>-ba-chip { position:absolute; top:12px; padding:5px 10px; border-radius:999px; font:800 10px/1 sans-serif; letter-spacing:.16em; text-transform:uppercase; z-index:2; }
.<p>-ba-chip-before { left:12px; background:var(--<p>-cream); color:var(--<p>-ink); }
.<p>-ba-chip-after  { right:12px; background:var(--<p>-gold); color:var(--<p>-ink); }
```

The HTML widget is justified here because the two stacked `<img>` + clip-path interaction has no native equivalent. The caption beneath stays native.

### 5.7 Reels-style infinite-scroll carousel

```
container.<p>-reels-strip       (overflow:hidden, padding)
└── container.<p>-reels-track   (flex_direction: row, gap, css_classes: <p>-reels-track)
    ├── container.<p>-reel-card (320px wide, background_image + radial-gradient overlay)
    ├── ...
```

CSS: keyframe `@keyframes <p>-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }` applied to `.<p>-reels-track`. Strip wrapper gets a `mask-image` fade on the left/right edges. Bottom HTML widget includes a `<script>` that clones the track's children once on `DOMContentLoaded` so `translateX(-50%)` loops seamlessly.

Each reel card: top row with badge heading + 5-star icon-list (both pill-shaped via widget controls), grow column with play-icon + quote, bottom column with image-box (avatar + name + role).

### 5.8 FAQ accordion

```
add-free-widget(parent_id="<wrap>", widget_type="accordion", settings={
  "faq_schema": "yes",
  "selected_icon": { "value": "fas fa-plus", "library": "fa-solid" },
  "selected_active_icon": { "value": "fas fa-minus", "library": "fa-solid" },
  "title_typography_typography": "custom",
  "title_typography_font_family": "Inter",
  "title_typography_font_size": { "unit": "px", "size": 18 },
  ...
})
# Then populate tabs via the widget's `tabs` array setting.
```

Cap width via the widget's `_element_custom_width: 780px` instead of a `.faq-wrap` CSS class. Don't ship `<details>` HTML widgets.

### 5.9 Open-book / hangtag / nameplate decorative footers

For elaborate decorative footers (open-book ledger spreads, hangtag-on-a-string, brushed-metal nameplate with corner rivets), the structure is always:
- Outer dark container (the "backdrop")
- Inner decorative container with the special background (ruled lines via `repeating-linear-gradient`, brushed-metal gradient, paper texture)
- Inside the decorative container: regular grid + text-editor + icon-list widgets for the content (address, link columns, legal row)

The CSS does the decoration, repeating gradients, pseudo-element rivets/holes/strings. The content stays native so the buyer edits each link / address line / phone / email from the panel.

### 5.10 Step / "How it works" cards

```
container.<p>-how-step                       (relative, overflow hidden, padding 54/36/40)
├── heading "01"                              (huge, low-opacity, position absolute top-end with offsets, the "background number")
├── container.<p>-how-label-row              (flex row: icon + "STEP ONE" heading)
├── icon                step glyph             (view: stacked, primary_color = disc bg, secondary_color = glyph)
├── heading             step title (h4)
├── text-editor         step description
├── divider             (1px line, 100% width)
└── icon-list           1-item meta ("~2 min · …")
```

Per-step accent color is set **directly on each widget** (icon primary_color, heading title_color, icon-list icon_color). Don't rely on `.<p>-step-N .<p>-how-icon` cascade hooks, that complicates the CSS and the buyer can't recolor per-step from the panel.

---

## 6. Layout traps & fixes

### `_css_classes` vs `css_classes`, the underscore trap

**Containers use `css_classes` (no underscore). Widgets use `_css_classes` (with underscore).**

Setting `_css_classes` on a container silently writes to the DB but never renders. The container appears with only its auto-generated `elementor-element-<id>` class. Every CSS rule that depends on the class hook silently fails.

Diagnose: `agent-browser eval "document.querySelector('.<class>')"` returns `null` even though `find-element setting_key=_css_classes` finds the container. Fix: re-call `update-container` with `settings: { css_classes: "<same value>" }`.

**The trap is not limited to classes.** The whole advanced-control family splits the same way, and every mismatch fails silently:

| Intent | Container key | Widget key |
|---|---|---|
| CSS classes | `css_classes` | `_css_classes` |
| Position (`absolute`/`fixed`) | `position` | `_position` |
| Width | `width` | `_element_width` + `_element_custom_width` |
| Gap between children | `flex_gap` | n/a |
| Z-index | `z_index` | `_z_index` |
| Offsets, responsive suffixes | `_offset_x` / `_offset_y` / `_offset_x_end` / `_offset_y_end` (shared) | same |

So a container built with `_position: "absolute"` stays `position: relative` and sits in normal flow, and one built with `gap` keeps Elementor's **default 20px gap** rather than the value you passed. Both look like "the CSS is not applying" when the setting simply never landed. When a container refuses to obey a setting, check the key against `get-container-schema` before debugging CSS.

### Flex children with explicit widths, the `boxed` trap

A 3-column flex row that should sit horizontal collapses to a vertical stack because child containers default to `content_width: "boxed"`, which adds the `e-con-boxed` class. Elementor's CSS forces `e-con-boxed` to 100% width regardless of the child's `width` setting.

**Fix:** flex children with explicit widths must be `content_width: "full"`:

```json
{
  "content_width": "full",
  "width": { "unit": "px", "size": 340 },
  "flex_direction": "column",
  ...
}
```

The parent row stays `content_width: "boxed"`, that's fine for the row's outer wrapper.

### Flex sizing, pair `_flex_grow` with `_flex_size: "none"`

Giving one child `_flex_grow: "1"` is only half the fix. The other children inherit Elementor's default shrink behavior, the fixed-size sibling collapses to zero.

**Always set both sides:**
- Growing child: `_flex_size: "grow"` + `_flex_grow: "1"`
- Fixed sibling(s): `_flex_size: "none"`

Symptom: a fixed-size sibling (badge image, icon column) visually disappears or becomes a sliver after you set grow on its partner.

### Flex-column container defaults `flex_align_items: "center"`, set explicitly

A flex-column container without an explicit `flex_align_items` gets `"center"` injected. That centers each child widget *as a block*, making any `align: "left"` setting inside look like it's doing nothing.

**Always set `flex_align_items: "stretch"`** on column containers whose children should fill the column's width.

Symptom: a heading or text-editor inside a flex-column container appears horizontally centered no matter how many times you set `align: "left"`.

### Pseudo-elements on `.e-con` collide with Elementor's overlay layer

Elementor uses `::before` and `::after` on `.e-con` for background overlay layers (with `inset: 0`). Custom pseudo-elements on containers get overridden silently, `right: 14px` gets interpreted as if the overlay had set `right: 0`, so a corner stamp ends up on the wrong edge.

**Fix:** use `::after` instead of `::before` AND reset inset explicitly:

```css
.<p>-stamped-card::after {
  content: "";
  position: absolute;
  inset: auto;                /* <- explicit reset */
  top: 14px;
  right: 14px;
  left: auto;
  bottom: auto;
  width: 50px; height: 50px;
  background: <decoration>;
  z-index: 2;
}
```

Same applies for any decorative corner badge, hatched stamp, ribbon corner painted via pseudo.

### Absolute children need a positioned ancestor

Setting `_position: absolute` on a widget anchors it to the nearest positioned ancestor. Elementor containers have implicit `position: relative` once you give them their own `min-height` + `overflow`. If your absolute child anchors to the wrong ancestor (jumping to the section instead of the card), explicitly set `position: relative` on the intended parent container.

### Absolute containers default to full-width

`position: absolute` on a container makes it stretch edge-to-edge unless you give it an explicit pixel width. `_element_custom_width` is a widget key and does nothing on a container. Set the container's own `width` (`{size: 280, unit: 'px'}`, with `content_width: 'full'`) for floating pills/cards.

### An HTML widget's inner `position:absolute` element resolves against the widget's OWN wrapper

Elementor wraps every widget in `position:relative .elementor-element`. A `<span style="position:absolute;top:-26px">` inside an HTML widget lands relative to that widget wrapper, not the section. Fix: either place the decorative HTML widget as the **first child** of the positioned container (its 0-height wrapper sits at the container origin), or give the **widget itself** `_position: absolute` + offsets.

### Grid containers default to 2 rows

Elementor's grid `grid_rows_grid` defaults to `{size: 2, unit: "fr"}`. For single-row grids (leaderboard rows, comparison cells), explicitly set `{size: 1, unit: "fr"}` or row height doubles silently.

`fr` rows are also **equal-height**, which stretches every cell to the tallest. When you want content-sized rows (the CSS `grid-template-rows: auto`), pass a raw value instead: `grid_rows_grid: { unit: "custom", size: "auto auto" }`. Symptom of getting this wrong: a 3-item, 2-column grid where all cells are the same tall height instead of hugging their content.

### Heading widgets force `line-height: 1`, which breaks inherited ratios

Elementor emits `.elementor-widget-heading .elementor-heading-title { line-height: 1 }`. Any nested `<small>` or `<strong>` inside a heading title therefore inherits `1`, not the ratio your stylesheet set on the parent. A `.value { line-height: 1.35 }` wrapper that renders 18.9px for its `<small>` in plain HTML renders 14px through a heading widget, so rows come out several px short.

Fix by setting the ratio on the widget, and **use a unitless value**:

```json
{ "typography_typography": "custom",
  "typography_line_height": { "unit": "custom", "size": 1.35 } }
```

`{ "unit": "em", "size": 1.35 }` is wrong here. `1.35em` computes to a **fixed px length** (24.3px at 18px) that then inherits literally into the `<small>`, making it too tall. Only a unitless line-height inherits as a ratio and re-computes per font-size.

### The icon widget forces `fill: currentColor` on uploaded SVGs

Elementor styles inline icon SVGs with `fill: currentColor`, which **overrides the `fill="none"` presentation attribute** on the SVG element (CSS beats presentation attributes). A stroke-based outline icon therefore renders as a filled blob.

Fix at upload time by putting the fill in an **inline style**, which outranks Elementor's rule:

```
<svg viewBox="0 0 24 24" style="fill:none;stroke:currentColor"
     stroke="currentColor" stroke-width="2">…</svg>
```

Pass that to `upload-svg-icon`. Filled icons (a star, a solid glyph) need the opposite: leave `fill="currentColor"` and set the widget's `primary_color`. Verify with `getComputedStyle(svg).fill`, it should read `none` for outline icons.

### Mobile resets: containers go full-width and stack

At the mobile breakpoint a container ignores its desktop `width` and `flex_direction` unless you set the responsive variants. A 28px avatar becomes 100% wide, a row of chips stacks vertically, and an inline pill stretches across the card.

Always pair the desktop value with its mobile twin for anything that must hug or stay horizontal:

```json
{ "width": { "size": 28, "unit": "px" },
  "width_mobile": { "size": 28, "unit": "px" },
  "flex_direction": "row",
  "flex_direction_mobile": "row" }
```

Use `width_mobile: { "size": "auto", "unit": "px" }` for wrappers that should shrink-to-fit (icon clusters, rating groups). Symptom: a row that is pixel-perfect on desktop but stacks into a tall column on a phone.

### Image widget letterboxes, use bg-image container for cover-cropped cards

For full-width cover-cropped card images with hover scale, use a bg-image container (`min_height` + `background_size: cover` + `background_position: center`) inside an `overflow: hidden` parent card. The image widget respects intrinsic aspect ratio and letterboxes; a bg-image container fills.

### Newer FA6 icons may not render

Elementor's inline-SVG icon map lags Font Awesome. `fa-bowl-rice`, `fa-fish-fins` may render nothing while `fa-fish`, `fa-utensils`, `fa-wine-bottle` (older glyphs) work. Stick to long-established FA icons or sideload SVGs (see `emcp-tools-upload-svg-icon`).

### Converting an HTML widget into native elements

Pages inherited from a hand-built design often carry "HTML soup" widgets: whole sections authored as raw markup. Converting them to containers and widgets makes the content editable in the editor. The reliable procedure:

1. **Read the markup and its CSS first.** `get-element-settings` for the HTML, then pull the rules for each class out of the page's `<style>` block. The class list tells you what the native structure must be.
2. **Keep the stylesheet, re-apply the classes.** Build containers and widgets that carry the *same* class names (`css_classes` on containers, `_css_classes` on widgets). The existing CSS then styles the native elements and the design is preserved without re-authoring styling into widget settings.
3. **Build alongside the original, never delete first.** Add the native version as a sibling, then compare. Two absolutely-positioned versions overlay exactly, which is itself a strong signal.
4. **Verify with computed geometry, not eyeballing.** Compare each part's `getBoundingClientRect()` *relative to its own wrapper*, so the comparison is position-independent:

```js
const rel = (a,b) => { const A=document.querySelector(a), B=document.querySelector(b);
  const ra=A.getBoundingClientRect(), rb=B.getBoundingClientRect();
  return {dx:Math.round(ra.x-rb.x), dy:Math.round(ra.y-rb.y),
          w:Math.round(ra.width), h:Math.round(ra.height)}; };
```

Also diff the computed values the traps above bite on: `fill`, `lineHeight`, `gap`, `gridTemplateRows`, `flexDirection`.
5. **Delete the original only once the numbers match**, then re-check at the mobile breakpoint before moving on.

**Cache warning.** Post CSS is regenerated on save but can be served stale. If a change appears not to apply, reload with a cache-busting query (`?cb=123`) before concluding the setting is wrong. This costs several wasted debugging rounds otherwise.

**When NOT to convert.** Leave it as HTML when the markup carries behaviour or is the styling itself:
- The `<style>` block that powers the page's classes.
- Interactive widgets: sliders/carousels (`data-*` + `.active` swapping), tab filters, off-canvas drawers, inline `<form onsubmit>`. These need a real Elementor Pro widget (Testimonial Carousel, Tabs, Off-Canvas, Form), which is a behaviour swap, not a markup conversion. Read the markup before promising a conversion: four stacked `<img data-review>` tags is a slider, not an image.
- CSS that depends on markup Elementor cannot reproduce: `:nth-child` over direct `<span>`s, negative margins on direct children. Elementor wraps every widget in its own divs, so those selectors stop matching. Rebuild those few pieces with **explicit native settings** (width, background, border-radius, negative `margin`) instead of relying on the class.

## 7. Custom CSS

### The singular CSS HTML widget, the pattern

All custom CSS for a page lives in **one HTML widget at the bottom of the page** wrapped in `<style>…</style>`. Contains:
- `:root` block declaring all page-scoped CSS variables (the brand tokens from the source)
- Class hooks for every visual not expressible through widget controls
- Pseudo-elements, hover states, keyframes, responsive overrides

Other HTML widgets carry only structural HTML with class hooks, **zero `style=""` attributes**.

Wrong:
```html
<div style="display:flex;align-items:baseline;gap:10px">
  <span style="font-size:18px;text-decoration:line-through">$49.99</span>
</div>
```

Right:
```html
<div class="<p>-price-row">
  <span class="<p>-price-strike">$49.99</span>
</div>
```

Why: the buyer pastes the single CSS block into Page Settings → Custom CSS in one move. Every inline `style=""` is something they can't restyle from the panel.

### `update-widget settings.html` is read-modify-write

`update-widget` merges top-level settings keys, but `settings.html` is a single string, there's no way to "append a few lines" through the MCP. When extending the singular CSS widget:

1. `get-element-settings(element_id=<css-widget-id>)` → read the current full `<style>…</style>` block
2. Edit the string in-process (append rules before `</style>`, or modify existing rules)
3. `update-widget(element_id=<css-widget-id>, settings={ "html": "<full new string>" })` with the WHOLE new block

Same applies to any widget whose primary content is one large string: `html`, `text-editor` (`editor` field), `shortcode`, `code-snippet`.

Symptom of skipping step 1: every prior CSS rule disappears, the page loses its brand kit, sections render unstyled. There is no revision UI for HTML widget content, only recovery is git history or rebuilding from a screenshot.

### `add-custom-css`, the per-element escape hatch

For per-element CSS that doesn't belong in the page-wide singular widget (one-off scoped overrides during iteration), use `emcp-tools-add-custom-css`. **Pass `replace: true`** to overwrite the element's existing CSS block; default is append, which compounds across iterations and bloats the saved settings.

Prefer placing it back into the singular bottom widget once the rule is stable, keeps all the page's CSS in one place the buyer can copy.

---

## 8. Counter & form widget gotchas

### Counter widget, explicit `title: ''` to suppress "Cool Number"

The counter widget animates `starting_number` → `ending_number` on scroll-into-view. The trap: omitting the `title` setting makes Elementor render its default placeholder "Cool Number" beneath every counter.

```js
counter({
  endingNumber: 15400000,
  prefix: '$',
  suffix: '',
  title: '',                  // ← REQUIRED to suppress "Cool Number" placeholder
  duration: 2200,
  thousandSeparator: 'true',
  numberColor: '#1B5E20',
  numberFont: 'Petrona', numberSize: 46, numberWeight: 600,
})
```

If you want the label above or below the counter, render it as a **separate heading widget** in the parent flex column rather than relying on the counter's built-in `title`. Gives explicit ordering control and keeps the counter clean.

`thousandSeparator: 'true'` is a string, not a boolean.

### Form widget, `submitText` not `buttonText`

The form widget factory's submit button text key is `submitText`. Passing `buttonText` (intuitive misnomer) makes the button render the Elementor default "Send".

```js
form({
  fields: [
    { type: 'email', field_label: 'Email', placeholder: 'you@example.com', required: 'true', _id: 'email', width: '75' },
  ],
  submitText: 'Sign me up',        // ← not `buttonText`
  submitWidth: '25',
})
```

Field shape:
- `type`, `text`, `email`, `tel`, `select`, `textarea`, `checkbox`, `date`, etc.
- `field_label`, label above the field (style via `.elementor-field-label`)
- `placeholder`, placeholder text
- `required`, `'true'` string (not boolean)
- `_id`, unique form-field id (also becomes the email submission key)
- `width`, `'25'` | `'50'` | `'75'` | `'100'`, column width within the form's row
- `field_options`, for `type: 'select'`, newline-separated options

Style the submit button via `.elementor-widget-form button[type=submit]` (or `.elementor-widget-form .elementor-button`).


---

## 13. Settings naming reference

| Don't write | Write |
|---|---|
| `justify_content` | `flex_justify_content` |
| `align_items` (on flex containers) | `flex_align_items` |
| `gap` (object form) | `flex_gap` |
| icon-box `position: "left"` | `position: "inline-start"` |
| `rgba(255,255,255,0.12)` borders | `#FFFFFF1F` (8-digit hex) |

Both forms often work, but matching the canonical form keeps merges clean.

**Widget advanced controls (`_*` prefix)**, let you skip wrapper containers:
- `_padding`, `_margin` (and `_padding_mobile` / `_margin_mobile`)
- `_background_background`, `_background_color`, `_background_image`
- `_border_border`, `_border_width`, `_border_color`, `_border_radius`
- `_element_width: "auto" | "initial"`, `_element_custom_width`, `_element_custom_width_mobile`
- `_offset_orientation_h: "start" | "end" | "center"`, `_offset_x`, `_offset_x_end`, `_offset_y` (and mobile/tablet variants)
- `_flex_size: "grow" | "shrink" | "none"` (and `_flex_size_mobile`)
- `_z_index`
- `_css_classes`

Typography group activators: set `typography_typography: "custom"`, `title_typography_typography: "custom"`, etc. **before** setting individual font properties, without the activator, the individual props are ignored.

Background group activator: backgrounds use **FLAT** keys, never a nested `background: { … }` object. Set `background_background: "classic"` **first**, then `background_image: { "id": <attachment_id>, "url": "<url>" }` (a single object, NOT an array `[{…}]`) and/or `background_color: "#hex"`, plus `background_size: "cover"`, `background_position`, `background_repeat`. Without the `classic` activator (or `gradient`/`slideshow`), the background never renders. This is the #1 reason a sideloaded photo "doesn't show", the tools now auto-coerce the nested/array form, but emit the flat form to be safe.

**Element ID tracking.** Every `add-*` returns a 7-character random `element_id`. Keep a running map, you'll need them for `update-element`, `add-custom-css`, `remove-element`, `find-element`. If you lose one, recover via `get-page-structure` or `find-element`.

