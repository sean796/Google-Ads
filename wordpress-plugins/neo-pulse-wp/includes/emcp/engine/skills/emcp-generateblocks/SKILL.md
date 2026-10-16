---
name: emcp-generateblocks
description: Build and edit GenerateBlocks blocks through its independent EMCP integration alongside Gutenberg, with any WordPress theme. Use for native block schemas, insertion, updates, movement and removal. Inspect the installed tool schema before writes and preserve unrelated page content and theme settings.
---

# GenerateBlocks

Enable GenerateBlocks independently under Page Builders → Gutenberg Block Plugins.
It has its own tools tab; no matching theme is required. Other block packs and
one standalone builder may be enabled simultaneously.

## Current standalone tools

Use `generateblocks-get-context`, `-list-blocks`, `-get-block-schema`, and
`-get-post-blocks`. New individual tools take arguments directly, without an
`operation` envelope. Every new write requires `post_id` and the latest
`expected_hash` from `get-post-blocks`.

Use `generateblocks-add-block`, `-update-block`, `-move-block`, and `-remove-block`.
Update requires one complete serialized block in `markup`, including native
saved HTML and children. Read the current markup before changing it. Only a
block belonging to this plugin can be targeted; the surrounding page may mix
core and other plugins' blocks. Moves use index paths and reject cycles.
Insertion returns the updated state under `page`; other edits return it directly.
Re-read after ambiguous errors or edits in another editor.

The older `generateblocks-read` / `-write` dispatchers remain compatible with the
examples below. Their toggles are separate from the individual tools. New write
tools start disabled; enable only the operations needed in the plugin's tab.
Use WordPress `create-post` for a draft, then build via MCP on the designated
test site. Keep theme settings in Themes and preserve the theme's header/footer.

Theme palette variables in examples only resolve when that theme supplies them. With another theme, use its actual tokens or explicit colors. Validate both frontend and native editor; existing insertion adapters can require block recovery as detailed below.

## The blocks — V2 model

Use the **V2** blocks (the legacy container/grid/headline/button are editor-only
shims): `element` (generic container — use `display:flex`/`grid` for layout),
`text` (headings/paragraphs/inline — the tag is `tagName`), `media` (image),
`shape` (SVG), and `looper`/`query` (dynamic). `list-blocks` shows them;
`get-block-schema` explains each block's attributes + the styles model + the flat
style keys.

## RULE #1 — all styling goes in a `styles` object; add-block compiles the CSS for you

Every GB V2 block stores its styling in a **`styles` object** (camelCase CSS keys)
and renders a **pre-compiled `css` string** — GB does NOT compile styles on the
server. `add-block` handles this: pass a **friendly flat `styles`** map and it
builds the `styles` object AND compiles the matching `css`, keyed to the block's
`.gb-<type>-<uniqueId>` selector. You do not write CSS.

Flat keys: `background_color`, `color`, `font_size`, `font_weight`, `line_height`,
`text_align`, `padding_top|right|bottom|left`, `margin_*`, `width`, `max_width`,
`min_height`, `border_radius`, `display`, `flex_direction`, `justify_content`,
`align_items`, `gap`, `grid_template_columns`, … (bare numbers on size keys get
`px`). For anything not covered, pass a `raw_styles` object (camelCase). Verified:
an `element` with `{ background_color:"#1e73be", padding_top:48, display:"flex",
gap:16 }` renders `.gb-element-<id>{background-color:#1e73be;padding-top:48px;
display:flex;gap:16px}`.

## RULE #2 — text content, and nesting

- **text** blocks take `tag_name` (h1..h6, p, span, a) + `content` (the text is
  rendered into the saved HTML).
- **element** is a container: insert it first, then add children INSIDE it —
  `add-block { block:"text", position:{ mode:"inside", path:[0] } }` (the first
  top-level block is `[0]`). `add-block` builds the element as an open/close
  wrapper so children nest correctly. Verified: element → h2 + p inside renders as
  a styled flex column.
- **media** takes a `media_id` (Media Library attachment) and renders the `<img>`.

## RULE #0 — front end is authoritative

GB compiles the `css` in the **editor** from the styles object. A headlessly
inserted block renders correctly on the **front end** (content + our compiled css),
but opening it in the block editor may prompt **"Attempt recovery"** once — that
regenerates GB's own css from the styles and preserves your content. So build
headlessly and preview on the front end; tell the user about the one-time recovery
if they'll edit in Gutenberg.

## Gotchas
- **Use V2 blocks** (element/text/media), not the legacy container/grid.
- **Don't hand-write css** — pass flat `styles`; add-block compiles + keys it to the
  uniqueId. Use `raw_styles` (camelCase) for uncovered properties.
- Keep this a **living doc** — append findings as more GP/GB pages are built.
