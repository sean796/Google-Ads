# Importing an HTML/CSS design into Bricks

Use this when a page was designed as plain HTML/CSS (a common way to iterate on design quality)
and must become a native, editable Bricks page. Verified on Bricks 2.4.2 with two full landing
pages (600+ elements each). The goal is a page that is native in structure *and* styling: widgets
are Bricks elements, styles are class/element/Theme Style settings, and custom CSS is the remainder.

## Tools

Bricks 2.4 ships an importer as abilities (enable them in Bricks > Settings > AI):

- `bricks/convert-html-css-to-bricks-data` (read-only): returns `elements`, `global_classes`,
  `global_variables`, `class_map`. Use this, then fix the tree, then save.
- `bricks/preview-html-css-page-import` / `commit-…` / `apply-…`: one-shot import. Inline SVG
  and iframes are dropped as code, and none of the fixes below are applied, so prefer convert.
- Persist with `bricks/batch-create-global-classes`, `bricks/set-global-variables`, the page tree
  with `emcp-tools/bricks-set-page-elements`, header/footer with `bricks/create-template` +
  `bricks/set-template-conditions`, base typography with `bricks/create-theme-style`.

Convert header + main + footer in **one** call so a class gets one ID everywhere, then split the
tree by root (`tag: header`/`footer` roots become templates, the rest is the page).

## Prepare the source (before converting)

1. **Prefix class names and custom properties** per import (`va-…`, `--va-…`). Classes are global;
   two imports with `.btn` overwrite each other. The converter reuses an existing class by name and
   keeps its old settings, so delete a previous import's classes before re-importing.
2. **Snap media queries to Bricks breakpoints** (default 991/767/478; read them from
   `bricks-get-context`). `max-width: 960px` stays raw CSS; `max-width: 991px` becomes native
   `setting:tablet_portrait` keys.
3. **Expand shorthands.** The converter maps longhands only:
   `font` → weight/size/line-height/family, `background: <color>` → `background-color`,
   `border-bottom: 1px solid c` → `border-width: 0 0 1px 0; border-style; border-color`,
   `inset` → top/right/bottom/left, `flex` → grow/shrink/basis (keep `calc()` intact),
   `place-items` → `align-items` + `justify-items`.
4. **Resolve `font-family: var(--x)`** to the first family name (`DM Sans`). Bricks then maps it to
   Typography and loads the Google Font itself.
5. **Centring-only grids** (`display:grid; place-items:center`, no template) → `display:flex;
   flex-direction:column; align-items; justify-content`. Bricks adds `align-items: initial` to every
   `display: grid` and text elements have no grid-alignment control.
6. **Move bare element rules** (`body`, `h1…h6`, `a`, `:focus-visible`) out of the CSS and into a
   Theme Style scoped to the page: `typographyBody`, `typographyHeadings`, `typographyHeadingH2…`,
   `links.typography`, `focusOutline`, `general.siteBackground`. Otherwise the converter repeats
   them as scoped custom CSS on every root section.
7. **Mark semantic tags** the converter flattens (`dt`, `dd`, `figcaption`, `cite`…) with a data
   attribute so you can restore `tag: custom` + `customTag` afterwards.
8. Inline `<use href="#symbol">` references so every SVG is self-contained.

## Fix the converted tree

| Converter output | Fix |
|---|---|
| `svg` with `source: code` (refused without code permission) | Write the SVG to the media library and use `file: {id, url}`; move its classes to `_cssGlobalClasses`/`_cssClasses`. Strip width/height/class only from the outer `<svg>`, never from `<rect>`. |
| `code` with an iframe map | Native `map` element (`address`, `zoom`). |
| `code` with a `<table>` | Native `text` (rich text). |
| Root `code` element with leftover CSS | Move into the first root's `_cssCustom`. |
| Nested `section` (from `<aside>`) | `div` with `tag: aside`; EMCP rejects nested sections. |
| `<img width height>` → `_width`/`_height` px | Remove; they override the source CSS. |
| `image` with `_importImage` | EMCP turns it into an external `image` (`url`, `external`, `filename`) when `image` is empty, as Bricks' importer does. Swap in a media library image for anything that must not hotlink. |
| `<button>` → button element rendered as `<span>` | `tag: button` so `button` selectors match. |
| `role="tablist"` + `tabpanel`s | `tabs-nested` with `_display: contents`, `tab-title` on the tabs, each panel wrapped in a `tab-pane` div (Bricks forces `.tab-pane.brx-open{display:block!important}`). |
| `<details>/<summary>` | `accordion-nested` (`faqSchema: true`); items are blocks with `accordion-title-wrapper` and `accordion-content-wrapper`; the question becomes an `h3` so FAQ data is generated. |
| Scroll-snap strip + prev/next buttons | `slider-nested`: `height: auto` (default 50vh), `slideAlignHorizontal: stretch` (default centres slide content), remove the custom buttons. Omit `pagination` when the source has no dots. |
| `data-count` numbers | `counter` (integers only). |
| `.reveal` classes | `_interactions` `enterView` → `startAnimation`. |
| Custom nav + overlay | `nav-nested` with `mobileMenu`, links in a `brx-nav-nested-items` ul, open/close toggles, mobile link size as `_typography:<breakpoint>`, phone link `_display: none` + `_display:<breakpoint>: flex`. |
| Native `form` | `showLabels`, label/field/button style from the source rules into `labelTypography`, `fieldTypography`, `fieldBorder`, `fieldBackgroundColor`, `fieldPadding`, `submitButton*`; set `actions`. |
| Root sections | `_display: block` unless a class sets display (Bricks sections are a centred flex column, which shrinks `max-width` wrappers). Root `#id{font-size:16px}` → `_typography.font-size`. |
| Rules scoped to one root's `data-bricks-import-scope-…` | Re-scope to an attribute every imported root carries, or they never reach the other roots. |
| CSS for classes no longer on the page | Prune (replaced widgets, JS-only states like `.is-open`, `.js`). |

## Bricks behaviour to account for

- Checkbox controls are read with `isset()`: a stored `false` means **on**. Omit the key to turn
  an option off (EMCP removes false checkboxes on save).
- `_gridItemColumnSpan`/`_gridItemRowSpan`/`_gridGap`/`_gridTemplate*` exist only on layout
  elements. On a heading or text they are ignored; mirror them as plain CSS.
- Bricks' base styles live in `@layer bricks`; any unlayered custom CSS beats them regardless of
  specificity. Its base styles give `blockquote` a border and serif font, centre `figcaption`, grey
  `cite`, and set `svg:not([height]){min-height:1em}`.
- `bricks/update-global-class` reports success but ignores `_cssCustom`; delete and recreate the
  class, or put the CSS on an element.
- `bricks/update-theme-style` with `replace: true` replaces the settings object. Conditions live in
  `settings.conditions.conditions`, so include them or the style applies nowhere.
- `headerSticky` makes the header fixed and overlay content; for in-flow sticky behaviour use
  `#brx-header{position:sticky;top:var(--wp-admin--admin-bar--height,0px)}`.
- A single CSS syntax error in any element's custom CSS silently drops every later rule in the
  page stylesheet (including Bricks' own mobile-menu rules). Validate generated CSS.

## Verify

Compare against the HTML: page height within ~1–2% at 1440 and 390, no horizontal overflow,
element-by-element sizes for anything that looks off (`getComputedStyle` + matched rules), axe,
interaction tests (tabs, accordion, slider, menu, form, counters, reveals), and a builder load of
the page and templates. Measure the remaining custom CSS and report what it is for.
