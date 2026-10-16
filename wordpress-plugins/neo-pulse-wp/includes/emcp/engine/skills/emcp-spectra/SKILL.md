---
name: emcp-spectra
description: Build and edit Spectra blocks through its independent EMCP integration alongside Gutenberg, with any WordPress theme. Use for native block schemas, insertion, updates, movement and removal. Inspect the installed tool schema before writes and preserve unrelated page content and theme settings.
---

# Spectra

Enable Spectra independently under Page Builders → Gutenberg Block Plugins.
It has its own tools tab; no matching theme is required. Other block packs and
one standalone builder may be enabled simultaneously.

## Current standalone tools

Use `spectra-get-context`, `-list-blocks`, `-get-block-schema`, and
`-get-post-blocks`. New individual tools take arguments directly, without an
`operation` envelope. Every new write requires `post_id` and the latest
`expected_hash` from `get-post-blocks`.

Use `spectra-add-block`, `-update-block`, `-move-block`, and `-remove-block`.
Update requires one complete serialized block in `markup`, including native
saved HTML and children. Read the current markup before changing it. Only a
block belonging to this plugin can be targeted; the surrounding page may mix
core and other plugins' blocks. Moves use index paths and reject cycles.
Insertion returns the updated state under `page`; other edits return it directly.
Re-read after ambiguous errors or edits in another editor.

The older `spectra-read` / `-write` dispatchers remain compatible with the
examples below. Their toggles are separate from the individual tools. New write
tools start disabled; enable only the operations needed in the plugin's tab.
Use WordPress `create-post` for a draft, then build via MCP on the designated
test site. Keep theme settings in Themes and preserve the theme's header/footer.

Theme palette variables in examples only resolve when that theme supplies them. With another theme, use its actual tokens or explicit colors. Validate both frontend and native editor; existing insertion adapters can require block recovery as detailed below.

## RULE #0, build with NATIVE blocks, not `core/html`

Compose the page from **real, individually-editable blocks**. Do **NOT** wrap a
section (or its cards/columns/hero) in one big `wp:html` / Custom HTML block, it is
opaque in the Gutenberg editor (the user can't select or edit the heading, button,
image, or card; they only see "Custom HTML"). Every design element maps to a native
block, use it. `core/html` is a **last resort** for a genuinely bespoke fragment with
no block equivalent (e.g. a one-off inline SVG graphic), never for structural content.

| Need | Native block(s) to use |
|---|---|
| Section band / colored panel / rounded card | **`uagb/container`**: bg color/gradient/**image**, padding, `containerBorder*Radius`, `boxShadow*` (all native attributes) |
| Multi-column / bento layout | **`uagb/container` row** (`directionDesktop:'row'`, `columnGapDesktop`) with **nested `uagb/container` columns** (`widthDesktop` + `widthSetByUser:true`). This is the right choice for a Spectra page: `widthDesktop` DOES generate CSS headless (with `block_id`+`variationSelected`), and only the container has **Equal Height** (`alignItemsDesktop:'stretch'`) so columns stretch to full/equal height, `core/columns` cannot do that. Use `core/columns` only for a quick simple grid where equal height doesn't matter |
| Heading (+ sub-heading) | **`uagb/advanced-heading`** (`headingColor`, `headFontSize`, `headFontWeight`, `headingAlign`) |
| Body text | **`core/paragraph`** (attribute-backed text color survives) |
| Button(s) | **`uagb/buttons` + `uagb/buttons-child`** (Spectra-native, theme-inheriting, what real Astra templates use) or **`core/buttons` + `core/button`** |
| **Feature card / stat counter / testimonial / section heading / CTA panel** | **`uagb/info-box`**: the Spectra **workhorse**, used for nearly every text unit in real Astra templates. It is a **STATIC** block, so author the FULL save markup (see cookbook); the toggles `showTitle`/`showDesc`/`showPrefix`/`showIcon`/`source_type`/`ctaType` reshape the same block into a hero, a numbered service card, an icon-stat, a testimonial (text + round avatar), or a heading+desc. **It IS hand-authorable**: the earlier "invalid content" was from authoring it as a *void* block; give it its inner HTML and it's valid + editable. |
| Icon | **`uagb/icon`**: a **DYNAMIC** block: author as a **void** `<!-- wp:uagb/icon {…} /-->` with **no inner HTML** (icon slug + size/color/border/padding). This is exactly how real templates do it. (An **emoji in `core/paragraph`** also works for a quick badge.) |
| Star rating | **`uagb/star-rating`** (static, 5 `<span class="uag-star">★</span>`, `rating`/`size`/`align`) |
| Social icons | **`uagb/social-share` + `uagb/social-share-child`** (children are **void** dynamic blocks) |
| Image gallery / carousel | **`uagb/image-gallery`** (void dynamic; `mediaGallery[]`, `feedLayout:'carousel'|'grid'|'masonry'`) |
| Subscribe / contact form | **`uagb/forms` + field blocks** (`uagb/forms-email`, …), static; `add-block` is easiest |
| Image | **`uagb/image`** (native, custom size + radius + objectFit) or native container **background image**, or `core/image` |
| FAQ / accordion | **`core/details`** (+ summary) |
| Bulleted list | **`core/list`** |

Styling lives in **block attributes** (which survive editor saves and stay editable),
never inline `style=""` on a Spectra/core block (stripped on save). Everything below
still applies; this rule governs *which blocks* you assemble.

**Preferred layout for a Spectra page, Spectra container rows (verified against a
hand-built page):** three nesting levels, and the key that everyone misses, **`alignItemsDesktop:'stretch'` on EVERY container in the layout path** (Spectra's
container default align-items is NOT stretch, so a heading/paragraph inside a container
without it shrinks to content width and wraps **letter-by-letter**: a common cause of a
broken Spectra layout; the other, and the real #1 headless cause, is the root-only
inner-blocks-wrap rule documented below).
- Section **band / row** → `uagb/container` root (alignfull), `directionDesktop:'row'`,
  `columnGapDesktop`, **`alignItemsDesktop:'stretch'` + `equalHeight:true`** (the Equal
  Height toggle → columns stretch to equal/full height, which `core/columns` can't do).
- **Column** → `uagb/container`, `widthDesktop:<n>` + `widthSetByUser:true`, **also
  `alignItemsDesktop:'stretch'`** so its child panel fills the column width. A pure layout
  wrapper, no visual styling. `widthDesktop` generates width CSS **headless** (with
  `block_id`+`variationSelected`; the old "only on save" belief was wrong).
- **Panel** → `uagb/container` inside the column: bg color/gradient/image, `containerBorder*Radius`,
  `minHeightDesktop`+`minHeightType` for height (NOT giant padding), padding, and the CONTENT.
- **Headings** → `uagb/advanced-heading` with `headingTag:'h2'` (it IS a real attribute) +
  the matching `<hN>` in the inner HTML, `headingColor`, `headFontFamily`(+`headLoadGoogleFonts:true`
  for a Google font like Poppins), `headFontSize`, `headFontWeight`.
- **Buttons** → `uagb/buttons` + `uagb/buttons-child` (each child's `label` is a plain
  attribute, so it IS hand-authorable, unlike info-box/icon).
- **Colors** → prefer Astra globals `var(--ast-global-color-N)` over hardcoded hex.
All native, all editable, equal-height.

**CRITICAL, the `uagb-container-inner-blocks-wrap` div is ROOT-CONTAINERS-ONLY.** This is
the #1 cause of the letter-by-letter wrap when building headlessly, and it was verified by
diffing a hand-built page against a headless build. Spectra's editor `save()` emits the
inner wrapper **only** for a **root** container (`isBlockRootParent` / `uagb-is-root-container`):

```html
<!-- ROOT container -->
<div class="wp-block-uagb-container uagb-block-<id> alignfull uagb-is-root-container">
  <div class="uagb-container-inner-blocks-wrap"> …columns… </div>
</div>
<!-- NESTED container (column / panel / card): children are DIRECT, NO wrap div -->
<div class="wp-block-uagb-container uagb-block-<id>"> …children… </div>
```

Why a wrong extra wrap breaks it: the base rule is `.wp-block-uagb-container{display:flex}`
with **no** `flex-direction`, so the CSS-initial value `row` applies unless Spectra's
*per-block generated* rule overrides it. For a **nested** container Spectra generates
`flex-direction:column` on `.uagb-block-<id>` **itself**. If you wrongly wrap that nested
container's children in an extra `uagb-container-inner-blocks-wrap` div, the column rule
lands on the container (whose only flex child is now the wrap div), while the wrap div has
**no** direction rule → defaults to `row` → real children (headings) shrink to min-content
and wrap one glyph per line. **Fix: emit the inner-blocks-wrap div ONLY for root
containers; every nested container holds its children directly.** With this correct, an
all-`uagb/container` layout (row → column → panel, 3 levels) renders perfectly headless via
`update-post`, **with** Equal Height, no core-block fallback needed. (`alignItemsDesktop:'stretch'`
+ `equalHeight:true` on the row/column is still required for equal-height columns; the wrap
rule above is what fixes the wrap.)

**Gotcha, do NOT nest `core/columns` inside a `uagb/container`.** A Spectra container's
`.uagb-container-inner-blocks-wrap` is `display:flex`, so a `core/columns` inside it
collapses (text wraps letter-by-letter). If you must use core layout, keep it in a
`core/group` subtree (core/group band + core/columns) with no Spectra container in the
path. But for a Spectra page, prefer the Spectra container rows above, they render
headless and are the only way to get Equal Height.

## Discover → inspect → act (Spectra blocks)

- `spectra-read` → `list-blocks`, the site's Spectra blocks (name/title/category/doc),
  `category`/`search` filters. Sourced live from Spectra's registry.
- `spectra-read` → `get-block-schema`, a block's **real attributes (names + defaults,
  read from Spectra's own `includes/blocks/<slug>/attributes.php`)**, plus an example
  and doc link. `full:true` = whole attribute set. **Never hand-guess attribute
  names**, WordPress stores any `uagb/*` attribute silently, so a wrong name looks
  like it "works" but never drives the block. Always confirm names here.
  - **BUT `get-block-schema` / `attributes.php` is INCOMPLETE.** A whole class of
    common container attributes is registered via a shared helper
    (`UAGB_Block_Helper`), not as literal keys in `attributes.php`, so they DO NOT
    appear in the schema, yet they are real, native, editable attributes you should
    use. These include the **background Image** (Style → Background → Type → Image),
    **border radius** and **box shadow**. If the block's editor Style panel has a
    control, the attribute exists even when the schema doesn't list it. Names below.
- `spectra-write` → `add-block`, insert a block at a position; it generates the
  `block_id` for you and Spectra applies its own defaults. Container blocks get their
  inner-block template. This tool does the ID/structure correctly, the traps below
  mostly bite hand-authored markup sent through `create-post`/`update-post`.

## CRITICAL rules for hand-authored Spectra markup

These are the failure modes that cost hours. Apply every one.

1. **`block_id` MUST be in the attributes JSON, not just the CSS class.** Spectra
   keys every per-block CSS rule (background, padding, gap, colors) off
   `$attr['block_id']`. `<!-- wp:uagb/container {"block_id":"a1b2c3d","backgroundColor":"#142440",...} -->`
   with a matching `class="... uagb-block-a1b2c3d"`. Omit it from the JSON and the
   block renders with **no per-block styling** (backgrounds/padding silently missing).

2. **Every `uagb/container` needs `"variationSelected":true`.** Without it the block
   **editor** shows Spectra's "Select a container layout to start with" picker instead
   of your content (the front end still renders). Root/section containers also want
   `"isBlockRootParent":true` and the classes `alignfull uagb-is-root-container`.

3. **Static blocks store their text as RichText in the saved HTML, not as attributes.**
   `uagb/advanced-heading` has **no** `headingTitle` / `headingTag` attribute, the
   heading text AND its `<h1>`/`<h2>` tag live in the inner HTML:
   `<div class="wp-block-uagb-advanced-heading uagb-block-ID" id="uagb-adv-heading-ID"><h2 class="uagb-heading-text">Text</h2><p class="uagb-desc-text">Sub</p></div>`.
   So `add-block` (attrs + block_id only) cannot set a static block's visible text, author the full markup via `create-post` when you need text. The heading's
   color/align CSS is keyed on the element **id** `#uagb-adv-heading-<block_id>`, so
   that `id` must be on the wrapper div.

4. **`widthDesktop` DOES generate column widths headlessly** (verified), set
   `widthDesktop` (+ `widthSetByUser:true`) on each column container and it renders at the
   right width via `update-post`, no editor save needed. Do **not** double-nest widths (a
   `col(28)` wrapping another container that also sets `widthDesktop:28` = 28% of 28%).
   Full-bleed section: root container `alignfull`; the root's inner-blocks-wrap is auto
   centered by Spectra's own `.uagb-is-root-container .uagb-container-inner-blocks-wrap` rule.

5. **Asset generation (Spectra → Settings → Asset Generation).** Default is **inline
   CSS** (best for headless, regenerates from content every load). The **File
   Generation** toggle switches to cached `.css` files; those go **stale** during
   iterative headless edits and browsers pin the `?ver`, so a page keeps loading old
   CSS. For AI building keep it **inline**, or after edits clear caches
   (`UAGB_Helper::delete_uag_asset_dir()` + bump `__uagb_asset_version`, i.e. the
   "Regenerate Assets" button). A fresh `create-post` gets a new post id → new CSS
   URL → no stale cache, the cleanest way to re-test.

6. **core/button markup must match core's serializer** or the editor flags "Block
   contains unexpected or invalid content" (and an invalid block also disrupts
   Spectra's CSS generation). Use the filled pattern:
   `{"style":{"color":{"background":"#fff","text":"#0f5132"},"border":{"radius":"8px"}}}`
   → `<a class="wp-block-button__link has-text-color has-background wp-element-button" style="border-radius:8px;color:#0f5132;background-color:#fff">`.
   Avoid `border:2px solid` shorthand (core expects border longhand + `has-border-color`).

## Spectra block cookbook, verified save markup (from real Astra templates)

Each block is **static** (needs its full inner save HTML, like advanced-heading) or
**dynamic** (a **void** `<!-- wp:name {…} /-->`, no inner HTML). Get this wrong and the
editor flags "Block contains unexpected or invalid content". Attribute values below are
the meaningful ones; drop the responsive `…Tablet`/`…Mobile` + margin noise unless needed.
Colors are Astra globals `var(--ast-global-color-N)` (see the color-role map at the end).

### `uagb/info-box`, STATIC, the workhorse (heros, cards, stats, testimonials, CTAs)

One block, reshaped by toggles. **Always** `classMigrate:true` + `block_id`. Outer div is
`uagb-block-<block_id> uagb-infobox__content-wrap <layout-classes>` (NOT `wp-block-uagb-info-box`).
Common attrs: `headingTag` (h1–h6/p → the `<hN class="uagb-ifb-title">` tag), `headingColor`,
`subHeadingColor`, `headingAlign`, `headSpace`/`subHeadSpace`, `showTitle`/`showDesc`/`showPrefix`/`showIcon`.

**A. Heading + description** (hero or section title). `showIcon:false`; optional uppercase prefix:
```html
<!-- wp:uagb/info-box {"classMigrate":true,"headingColor":"var(--ast-global-color-2)","subHeadingColor":"var(--ast-global-color-3)","prefixHeadingTag":"p","headingTag":"h1","showPrefix":true,"prefixTransform":"uppercase","prefixLetterSpacing":2,"showIcon":false,"block_id":"cnplylxk"} -->
<div class="uagb-block-cnplylxk uagb-infobox__content-wrap  uagb-infobox-icon-above-title uagb-infobox-image-valign-top "><div class="uagb-ifb-content"><div class="uagb-ifb-title-wrap"><p class="uagb-ifb-title-prefix">Empower Your Journey</p><h1 class="uagb-ifb-title">Welcome to our World</h1></div><p class="uagb-ifb-desc">Step into a realm where imagination knows no bounds.</p></div></div>
<!-- /wp:uagb/info-box -->
```
(A numbered service card is the same with `prefixHeadingTag:"p"` and the prefix set to `01`/`02`/`03`.)

**B. Icon-stat card**: `showIcon` on, `icon:"check"` (Spectra icon slug), `iconView:"Stacked"`,
`iconBackgroundColor`, `iconColor`, `iconSize`, `iconimgPosition:"left"`. Layout classes gain
`uagb-infobox-icon-left uagb-infobox-left`; the icon SVG is emitted inside
`.uagb-ifb-icon-wrap > .uagb-iconbox-icon-wrap.uagb-infobox-shape-circle`. The `<hN class="uagb-ifb-title">`
holds the number (e.g. `92%`), `.uagb-ifb-desc` the label.

**C. Testimonial (text)**: `showTitle:false`; only `.uagb-ifb-desc` has the quote; `.uagb-ifb-title-wrap` is empty.

**D. Testimonial author (round avatar + name)**: `source_type:"image"`, `iconImage:{id,url}`,
`iconimgBorderRadius:100`, `showDesc:false`, `headingTag:"p"`. Inner:
`<div class="uagb-ifb-image-content"><img src="…" width="60" height="60"/></div>` then
`<div class="uagb-ifb-title-wrap"><p class="uagb-ifb-title">Your Client 1</p></div>`.

**E. With a text CTA link**: `ctaType:"text"`, `ctaIcon:"chevron-right"`, `ctaLink`, `ctaLinkColor`,
`ctaText`. Adds after the desc: `<div class="uagb-ifb-button-wrapper wp-block-button"><a href="#" class="uagb-infobox-cta-link"><span class="uagb-inline-editing">Read More</span><svg …>…</svg></a></div>`.

### `uagb/icon`, DYNAMIC, void
```html
<!-- wp:uagb/icon {"icon":"arrow-right","iconSize":10,"iconColor":"var(--ast-global-color-3)","iconBorderColor":"var(--ast-global-color-3)","iconBorderStyle":"solid","iconBorderTopWidth":3,"iconBorderLeftWidth":3,"iconBorderRightWidth":3,"iconBorderBottomWidth":3,"iconBorderTopLeftRadius":100,"iconBorderTopRightRadius":100,"iconBorderBottomLeftRadius":100,"iconBorderBottomRightRadius":100,"iconTopPadding":12,"iconRightPadding":12,"iconBottomPadding":12,"iconLeftPadding":12,"block_id":"1c0f4dcb"} /-->
```
`icon` is a slug (`arrow-right`, `quote-left`, `check`, `chevron-right`, …). Border radius 100 + equal
border widths = the circular-outline icon. **No inner HTML**: void `/-->`.

### `uagb/buttons` + `uagb/buttons-child`, buttons-child STATIC, `label` is an attribute
```html
<!-- wp:uagb/buttons {"block_id":"xs7uupaw","classMigrate":true,"childMigrate":true,"gap":0} -->
<div class="wp-block-uagb-buttons uagb-buttons__outer-wrap uagb-btn__default-btn uagb-btn-tablet__default-btn uagb-btn-mobile__default-btn uagb-block-xs7uupaw"><div class="uagb-buttons__wrap uagb-buttons-layout-wrap "><!-- wp:uagb/buttons-child {"inheritFromTheme":true,"block_id":"hhc8mxa5","label":"Get Started","link":"#","color":"#ffffff","background":"var(--ast-global-color-0)","hColor":"#ffffff","hBackground":"var(--ast-global-color-1)","btnBorderStyle":"none","btnBorderTopLeftRadius":4,"btnBorderTopRightRadius":4,"btnBorderBottomLeftRadius":4,"btnBorderBottomRightRadius":4} -->
<div class="wp-block-uagb-buttons-child uagb-buttons__outer-wrap uagb-block-hhc8mxa5 wp-block-button"><div class="uagb-button__wrapper"><a class="uagb-buttons-repeater wp-block-button__link" aria-label="" href="#" rel="follow noopener" target="_self" role="button"><div class="uagb-button__link">Get Started</div></a></div></div>
<!-- /wp:uagb/buttons-child --></div></div>
<!-- /wp:uagb/buttons -->
```
Outline/secondary button: child `buttonType:"secondary"`, `backgroundType:"transparent"`,
`btnBorderStyle:"solid"` + `btnBorderColor`, and the `<a>` gets class `ast-outline-button`.

### `uagb/star-rating`, STATIC
```html
<!-- wp:uagb/star-rating {"block_id":"fslrq0d4","rating":5,"size":20,"align":"center","displayTitle":false} -->
<div class="wp-block-uagb-star-rating uagb-block-fslrq0d4"><div class="uag-star-rating" title="5/5"><span class="uag-star">★</span><span class="uag-star">★</span><span class="uag-star">★</span><span class="uag-star">★</span><span class="uag-star">★</span></div></div>
<!-- /wp:uagb/star-rating -->
```

### `uagb/image`, STATIC (figure markup)
Key attrs: `url`, `id`, `width`/`height`, `sizeSlug:"custom"`, `objectFit:"cover"`,
`imageBorderTopLeftRadius`…(radius), `customHeightSetDesktop:true`, `className:"alignleft"`.
Inner: `<div class="wp-block-uagb-image alignleft uagb-block-<id> …"><figure class="wp-block-uagb-image__figure"><img src="…" class="uag-image-<id>" width height loading="lazy"/></figure></div>`.
(For a section background prefer the container background image instead.)

### `uagb/social-share` (static wrapper) + `uagb/social-share-child` (DYNAMIC void)
```html
<!-- wp:uagb/social-share {"classMigrate":true,"childMigrate":true,"block_id":"f25a72a1","social_layout":"vertical","size":22,"gap":27,"iconColor":"var(--ast-global-color-2)"} -->
<div class="wp-block-uagb-social-share uagb-social-share__outer-wrap uagb-social-share__layout-vertical uagb-block-f25a72a1"><!-- wp:uagb/social-share-child {"block_id":"c12d9848","icon":"linkedin-in","icon_color":"var(--ast-global-color-2)","icon_hover_color":"var(--ast-global-color-0)","parentSize":22} /-->
<!-- wp:uagb/social-share-child {"block_id":"7609ecbe","icon":"instagram","icon_color":"var(--ast-global-color-2)","icon_hover_color":"var(--ast-global-color-0)","parentSize":22} /--></div>
<!-- /wp:uagb/social-share -->
```
Each child is a **void** `/-->`; `icon` is the network slug, `parentSize` mirrors the parent `size`.

### `uagb/image-gallery`, DYNAMIC, void
`mediaGallery:[{id,url,sizes,…}]` + `mediaIDs:[…]`, `feedLayout:"carousel"|"grid"|"masonry"`,
`galleryImageSize:"full"`, `columnsTab`/`columnsMob`, `gridImageGap`, `imageBorder*Radius`,
`readyToRender:true`. Void `/-->`. Prefer `add-block` here, the media objects are large.

### `uagb/forms` (static) + field blocks (`uagb/forms-email`, …)
A full `<form>` is serialized (hidden inputs, submit button, success/fail message divs). Field
blocks nest inside. `submitButtonText`, `buttonAlign:"full"`, `displayLabels:false`,
`inheritFromTheme:true`, field border/padding. **Use `add-block`/`insert-pattern`** for forms, the save markup is intricate and easy to get invalid by hand.

### `uagb/advanced-heading`
Covered above (static; tag+text are RichText inner HTML). Note the responsive-hide attrs seen on
real blocks: `UAGHideTab:true`, `UAGHideMob:true`, `UAGResponsiveConditions:true` (+ wrapper
classes `uag-hide-tab uag-hide-mob`) to hide a block per breakpoint, available on most Spectra blocks.

## SAVE-SAFETY (the big one)

**Inline `style="…"` on Spectra/core blocks is STRIPPED when the block editor saves.**
The editor only knows a block's *attributes*; on save it re-serializes each block from
its `save()` and drops any inline styles that aren't attribute-backed. So a page styled
with inline styles on Spectra containers looks unstyled in the editor **and breaks on
the front end after the user opens & saves it**. Two save-safe places to put styling:

- **Spectra/advanced-heading native attributes** (survive + editable in Spectra's UI).
- **`core/html` blocks**: the editor stores raw HTML verbatim and never rewrites it.

**Recommended architecture for a custom design that must survive editing:**
- **Section wrappers → native `uagb/container`**: `backgroundType`+`backgroundColor`,
  or a gradient via `backgroundType:'gradient'`+`selectGradient:'advanced'`+`gradientColor1/2`+`gradientLocation1/2`
  (see the gradient note in the reference, NOT `gradientValue`, which is overlay-only); padding via `topPaddingDesktop` /
  `bottomPaddingDesktop` / `leftPaddingDesktop` / `rightPaddingDesktop`; `directionDesktop`,
  `rowGapDesktop`/`columnGapDesktop`, `alignItemsDesktop`/`justifyContentDesktop`.
- **A hero / section with a BACKGROUND IMAGE → native container background image, NOT
  a `core/html` block with an inline `background-image`.** Set `backgroundType:'image'`,
  `backgroundImage:{ id, url }` (also set `backgroundImageDesktop:{ id, url }` to be safe),
  and a dark overlay with `overlayType:'color'` + `backgroundImageColor:'rgba(18,32,58,0.7)'`.
  Position/size/repeat default to center/cover/no-repeat. This is editable in Spectra's
  Background panel and survives saves. (Use `list-media`/`sideload` to get the `{id,url}`.)
  A `core/html` hero with inline `background-image` renders but is NOT a native editable
  container, reserve `core/html` for inner markup Spectra genuinely can't express.
- **Section titles → native `uagb/advanced-heading`**: `headingColor`, `subHeadingColor`,
  `headingAlign`, `headFontFamily`, `headLoadGoogleFonts:false`, `headFontSize`+`headFontSizeType`,
  `headFontWeight` (string).
- **Cards / shadows / rounded boxes → native container attributes** when you want them
  individually editable: `boxShadowColor`/`boxShadowBlur`/`boxShadowHOffset`/`boxShadowVOffset`/`boxShadowSpread`/`boxShadowPosition`,
  and border radius `containerBorderTopLeftRadius` / `…TopRightRadius` / `…BottomLeftRadius` /
  `…BottomRightRadius` (+ `containerBorderRadiusUnit`). (These register via a shared border
  helper, so they are NOT literal keys in the container's `attributes.php`, read them
  from `get-block-schema` `full:true` or the block's editor Border panel.)
- **Intricate components Spectra can't express (icon tiles, overlapping badges, forms,
  step rows) → `core/html`** with inline styles (survives verbatim).
- **Buttons / paragraphs → core/button, core/paragraph** (their color/border inline
  styles ARE attribute-backed, so they survive).

Verify save-safety by running the REST save pipeline (`POST /wp/v2/pages/<id>` with the
current content) and confirming the native attributes + `core/html` are still present.

## Quick reference, verified container attributes

`block_id`, `variationSelected`, `isBlockRootParent`, `directionDesktop` (row|column),
`backgroundType` (color|gradient|image|video), `backgroundColor`, `backgroundOpacity`,
`topPaddingDesktop`/`bottomPaddingDesktop`/`leftPaddingDesktop`/`rightPaddingDesktop` (+ `…Tablet`/`…Mobile`),
`topMarginDesktop`/… , `rowGapDesktop`/`columnGapDesktop`, `alignItemsDesktop`/`justifyContentDesktop`/`wrapTablet`,
**`minHeightDesktop`+`minHeightType`** (px|vh|vw, the container's native **Minimum Height**;
use this to size a panel/hero, NOT giant padding), **`equalHeight`** (bool, makes a row's
child containers equal height),
`widthDesktop` (+`widthSetByUser:true`), **`innerContentCustomWidthDesktop`** (px, boxed content
width for a root container, e.g. 1140) / `innerContentWidth` (`full`|`alignwide`|`alignfull`),
box shadow `boxShadow{Color,Blur,HOffset,VOffset,Spread,Position}`,
border `containerBorder{Top,Left,Right,Bottom}Width`+`containerBorderStyle`+`containerBorderColor`,
radius `containerBorder{TopLeft,TopRight,BottomLeft,BottomRight}Radius`+`containerBorderRadiusUnit`.

**Container GRADIENT background (real-template form).** `backgroundType:'gradient'` with the
**advanced** picker: `selectGradient:'advanced'`, `gradientColor1`, `gradientColor2`,
`gradientLocation1`, `gradientLocation2` (+ `gradientType`/`gradientAngle`). Two color stops at the
same location (e.g. both `27`) = a hard 2-color split. (The `gradientValue` CSS-string form is only
for an image **overlay** gradient, see below, not the container's own gradient background.)

**Background image/video (shared-helper attrs, NOT in attributes.php).** `backgroundType`
supports `color | gradient | image | video`.
- **image**: `backgroundType:'image'`, `backgroundImage:{id,url}` + `backgroundImageDesktop:{id,url}`,
  `backgroundPosition(Desktop)` (default center), `backgroundSize(Desktop)` (default cover),
  `backgroundRepeat(Desktop)` (default no-repeat), `backgroundAttachment(Desktop)`. Overlay:
  `overlayType:'color'` + `backgroundImageColor:'rgba(...)'` **or** a global like `var(--ast-global-color-7)`,
  plus a separate **`overlayOpacity`** (0–1, e.g. `0.7`) to dim the image, the real-template way to
  darken a hero photo; OR a **gradient overlay** with
  `overlayType:'gradient'` + **`gradientValue`** (the overlay gradient is read from `gradientValue`,
  NOT `gradientOverlayColor1/2`, set those and you'll get Spectra's default blue→purple). E.g. a
  left-dark hero: `gradientValue:'linear-gradient(90deg,rgba(11,23,40,0.93) 0%,rgba(11,23,40,0.1) 100%)'`.
- **video**: `backgroundType:'video'`, `backgroundVideo:{url}`, `backgroundVideoFallbackImage:{id,url}`,
  overlay via `backgroundVideoColor` + `backgroundVideoOpacity`.
- Tablet/Mobile variants use the `…Tablet`/`…Mobile` suffixes.

> **Rule of thumb:** if Spectra's container Style panel exposes a control (Background
> color/gradient/**image**, Border **radius**, **Box Shadow**, Spacing), there is a native
> attribute for it, prefer it over `core/html`. The schema from `get-block-schema` lists
> only `attributes.php` keys, so confirm shared-helper names from this skill or the panel.

advanced-heading: `headingColor`, `subHeadingColor`, `headingAlign`, `headFontFamily`,
`headLoadGoogleFonts`, `headFontSize`+`headFontSizeType`, `headFontWeight`,
`subHeadFontSize`+`subHeadFontSizeType`, `separatorColor`, `seperatorStyle` (Spectra's
spelling). The heading tag + text are RichText in the inner HTML, not attributes.

## Optional Astra theme color roles (`var(--ast-global-color-N)`)

Real Astra templates style **everything** with these seven vars, never raw hex, do the same so a
site palette change reflows the whole page. Observed convention (confirm on the site via
`astra-read` → `get-settings` group `colors`):

| Var | Typical role |
|---|---|
| `--ast-global-color-0` | **Primary / brand** (button backgrounds, accents, links) |
| `--ast-global-color-1` | **Primary hover** (button hover bg, link hover) |
| `--ast-global-color-2` | **Heading text** (dark) |
| `--ast-global-color-3` | **Body text** (muted) |
| `--ast-global-color-4` | **Section background** (light/tinted) |
| `--ast-global-color-5` | **Surface / white** (cards, alternate section bg) |
| `--ast-global-color-6` | **Borders / dividers** (subtle) |
| `--ast-global-color-7` | **Dark overlay / inverse** (image overlays, dark panels) |

In hand-authored JSON the `-` is unicode-escaped: `"var(--ast-global-color-0)"` (both
hyphens). Buttons: `background:var(--…-color-0)`, `hBackground:var(--…-color-1)`. Info-box:
`headingColor:var(--…-color-2)`, `subHeadingColor:var(--…-color-3)`. Sections alternate
`-color-4` / `-color-5`.

## Real-template section patterns (reference architecture)

The three analyzed Astra Starter Templates (`docs/spectra/spectra-{1,2,3}.json`) all follow the same
skeleton, every **section** is a root `uagb/container` (`alignfull`, `isBlockRootParent`, big
responsive vertical padding `112/80/64`), and inside it:
- **Hero** → root container (gradient or bg-image) → info-box (h1 + desc, `showIcon:false`) +
  `uagb/buttons` + optional image row.
- **Services / features grid** → root → inner **row** container (`directionDesktop:'row'`,
  `equalHeight:true`) → N **column** containers (`widthDesktop:33`, bg `-color-5`, radius 6, padding
  32) each holding one info-box (numbered prefix `01`/`02`/`03`).
- **Stats bar** → a bordered/shadowed card container holding a row of icon-stat info-boxes.
- **Testimonials** → row of three column containers, each = `uagb/star-rating` + a text info-box +
  an avatar info-box (`source_type:'image'`, round).
- **CTA** → root container with `backgroundType:'image'` + `overlayType:'color'` + `overlayOpacity`
  → centered info-box (prefix + h2 + desc) + button.
Reuse these skeletons; swap copy, colors (global vars), and images.
