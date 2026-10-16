---
name: emcp-kadence-blocks
description: Build and edit Kadence Blocks blocks through its independent EMCP integration alongside Gutenberg, with any WordPress theme. Use for native block schemas, insertion, updates, movement and removal. Inspect the installed tool schema before writes and preserve unrelated page content and theme settings.
---

# Kadence Blocks

Enable Kadence Blocks independently under Page Builders → Gutenberg Block Plugins.
It has its own tools tab; no matching theme is required. Other block packs and
one standalone builder may be enabled simultaneously.

## Current standalone tools

Use `kadence-blocks-get-context`, `-list-blocks`, `-get-block-schema`, and
`-get-post-blocks`. New individual tools take arguments directly, without an
`operation` envelope. Every new write requires `post_id` and the latest
`expected_hash` from `get-post-blocks`.

Use `kadence-blocks-add-block`, `-update-block`, `-move-block`, and `-remove-block`.
Update requires one complete serialized block in `markup`, including native
saved HTML and children. Read the current markup before changing it. Only a
block belonging to this plugin can be targeted; the surrounding page may mix
core and other plugins' blocks. Moves use index paths and reject cycles.
Insertion returns the updated state under `page`; other edits return it directly.
Re-read after ambiguous errors or edits in another editor.

The older `kadence-blocks-read` / `-write` dispatchers remain compatible with the
examples below. Their toggles are separate from the individual tools. New write
tools start disabled; enable only the operations needed in the plugin's tab.
Use WordPress `create-post` for a draft, then build via MCP on the designated
test site. Keep theme settings in Themes and preserve the theme's header/footer.

Kadence also exposes `kadence-blocks-list-patterns` and `kadence-blocks-insert-pattern`. Prefer canonical patterns for complete sections.

Theme palette variables in examples only resolve when that theme supplies them. With another theme, use its actual tokens or explicit colors. Validate both frontend and native editor; existing insertion adapters can require block recovery as detailed below.

## PATTERNS (preferred) — build whole sections from the Design Library

Kadence ships a Design Library of professionally-designed **patterns**. Inserting a
pattern drops in Kadence's **own canonical block markup**, so it is **editor-VALID**
(no "Attempt recovery"), palette-harmonized, and looks finished — the reliable way
to build a page. **Prefer this over assembling `rowlayout`/`column`/… by hand.**

1. `kadence-blocks-read { operation: "list-patterns", arguments: { categories: true } }`
   → the category names (Hero, Testimonials, "Counter or Stats", "Call to Action",
   "Media and Text", Cards, Pricing Table, Form, Gallery, Team, …).
2. `kadence-blocks-read { operation: "list-patterns", arguments: { category: "Hero" } }`
   → free patterns in that category (add `include_pro: true` for Pro patterns;
   `search` filters by name/keyword). Each has an `id` like `ptn-20585`.
3. `kadence-blocks-write { operation: "insert-pattern", arguments: { post_id, pattern: "ptn-20585", localize_images?: true } }`
   → inserts the section. Repeat to compose the page (hero → stats → media/text →
   testimonials → CTA). `localize_images: true` downloads the pattern's images into
   the Media Library (else they load from Kadence's CDN).
4. **Patterns ship with placeholder copy** ("Write a brief title", "Briefly and
   concisely explain…"). Replace the **RichText** text (headings, info-box
   title/text) with the client's copy — those edits stay editor-valid. Read back
   with `get-post-blocks` and edit via the Gutenberg block tools or `update-post`.

The library is Kadence's cloud "Design Library", cached locally the first time it is
opened in a block editor. If `list-patterns` returns empty, open Kadence → Design
Library once to prime the cache.

### Worked example — a landing page from patterns

```
create-post { title: "Solar Co", status: "publish", type: "page" }            → post_id
list-patterns { categories: true }                                            → pick categories
list-patterns { category: "Hero" }            → insert-pattern { post_id, pattern: <hero id> }
list-patterns { category: "Counter or Stats" }→ insert-pattern { post_id, pattern: <stats id> }
list-patterns { category: "Media and Text" }  → insert-pattern { post_id, pattern: <m+t id> }
list-patterns { category: "Testimonials" }    → insert-pattern { post_id, pattern: <testi id> }
list-patterns { category: "Call to Action" }  → insert-pattern { post_id, pattern: <cta id> }
get-post-blocks { post_id }                    → find the heading/text blocks
# swap placeholder copy for real copy (RichText edits stay valid):
update-block / update-post with the client's headings + body
```

## The block flow: discover → inspect → act (for custom / one-off blocks)

Use this when a pattern doesn't fit and you need a specific block. Note **RULE #0**
below — hand-built blocks render on the front end but the editor flags them.

1. `kadence-blocks-read { operation: "list-blocks" }` — the catalog of the 32
   top-level Kadence blocks (optional `category`: layout|content|media|embed|form|
   dynamic|header). Titles/descriptions are curated.
2. `kadence-blocks-read { operation: "get-block-schema", arguments: { name: "rowlayout" } }`
   — the block's key attributes with **real names + defaults read live from the
   block registry** (`full:true` for every attribute), plus `content_attributes`
   (RULE #2), `inner_blocks` (containers), an `example`, and any `structure_note`.
3. `kadence-blocks-write { operation: "add-block", arguments: { post_id, block, attributes?, position? } }`
   — inserts the block. A `uniqueID` is generated for you; container children are
   scaffolded. `position: { mode: append|prepend|before|after|inside, path?: [..] }`.

## RULE #0 — hand-built blocks: front end is authoritative; the editor auto-repairs

Kadence blocks use **static JS `save()` functions**. A server-side `add-block`
can't run that JS, so the stored markup won't byte-match `save()`. This is
expected and **not a failure**: the **front end renders correctly** (Kadence's
PHP extracts the content from the markup), and since 3.12.2 EMCP **auto-repairs
the inserted blocks the next time the post is opened in the block editor** — it
runs the editor's own block recovery (content preserved, regenerated by Kadence's
own `save()`), shows one notice, and the human clicks **Update** once to store the
canonical markup. No per-block "Attempt recovery" clicking. PATTERNS (above) don't
need any of this: their markup is Kadence's own save() output and is valid at rest.

**So always finish a hand-built page with this instruction to the user:** *"Open
the page in the block editor once and click Update."* That single visit does two
jobs: it repairs the inserted blocks, **and** it materializes the editor-built
children of the blocks that have no server-side template (RULE #3). Verified at
scale: a 29-call page (50 blocks, 28 distinct types, incl. nested info boxes)
auto-repaired 23 blocks on open, and after one Update reloaded with zero invalid
blocks and a fully rendered front end.

## RULE #1 — every block self-styles from a uniqueID; pass real attributes

Every Kadence block carries a `uniqueID` and a render callback that emits inline
CSS keyed to it. So a headless-inserted block styles itself from its attributes —
you do **not** write CSS. Colors reference the theme's **global palette** slugs
`palette1`..`palette9` (e.g. `"bgColor": "palette8"`, `"color": "palette3"`), or a
literal CSS color. Spacing/size attributes are usually arrays or
`{size,unit}`/responsive objects — read the exact shape from `get-block-schema`
(don't guess). Verified: `rowlayout` with `{ columns:2, align:"full",
bgColor:"palette8", padding:["80","24","80","24"] }` renders
`#kt-layout-id…{background-color:var(--global-palette8)}` + the padding + a 2-col grid.

## RULE #2 — RichText text lives in the saved HTML, not the attributes

Some fields are `source: html`/`rich-text` attributes — their value is stored in
the block's saved markup, **not** the attrs JSON. `get-block-schema` lists them in
`content_attributes` (e.g. Advanced Heading `content`; Info Box `title`,
`contentText`, `learnMore`; Advanced Image `caption`). **You still pass them as
attributes** — `add-block` renders each into the correct element (from the
attribute's own registry selector) so it displays. Example that works:

- `advancedheading` `{ content: "Build faster", htmlTag: "h1", color: "palette3" }`
- `infobox` `{ title: "Headless-built", contentText: "…", mediaType: "icon" }`

Plain (non-source) text attributes — e.g. `countup` `title`, `progress-bar`
`label` — are ordinary attributes and just render from the JSON.

## RULE #3 — containers + nesting

`add-block` scaffolds a container's children automatically. Verified server-side
(inspected before any editor visit): `rowlayout → column` (count from the `columns`
attribute), `advancedbtn → singlebtn`, `icon → single-icon`,
`iconlist → listitem ×3`, `testimonials → testimonial ×2`.

**No server-side children** (verified): `tabs`, `accordion`, `table`, `countdown`,
`show-more`, `posts`, `form`. `add-block` inserts the container only and
`get-block-schema` flags it in `structure_note`. Their inner structure
(`tab`, `pane`, `countdown-timer`, …) is created by **Kadence's own editor JS the
first time the post is opened in the block editor**, and the RULE #0 Update
persists it, so "insert → open once → Update" completes these blocks too. Set tab
titles via the `titles` attribute.

To fill a column, insert INTO it by path: add the `rowlayout` first, then
**`get-post-blocks` to read the real index path** of the column (the first row's
first column is `[0,0]`), then `add-block` with
`position: { mode: "inside", path: [0,0] }`. Verified nesting: hero `rowlayout`
(columns=2) → heading + subheading + button in `[0,0]`, info box in `[0,1]`; and a
3-column feature row with an info box in each of `[N,0]`, `[N,1]`, `[N,2]`.

**Always derive `path` from `get-post-blocks`, never by counting yourself.** The
path indexes the block tree exactly as `get-post-blocks` returns it (whitespace
between blocks is not a block and is not counted). A path that does not resolve is
rejected with an `invalid_position` error naming the problem. Since 3.12.2 it is a
loud failure, but before that the block was silently dropped while the call still
reported success, so treat any `invalid_position` as "re-read the tree, don't retry
blindly".

`rowlayout` is seeded with `colLayout: "equal"` automatically — **it must be
non-empty** or the block editor shows Kadence's "Select Your Layout" picker instead
of your columns (the front end renders either way). Override it for non-equal
splits (`left-golden`, `right-golden`, `left-half`, …).

## Gotchas learned live

- **Prefer patterns for whole sections** — editor-valid + designed; hand-built
  blocks trip the editor's validation (RULE #0).
- **Don't guess attribute names or shapes** — Kadence blocks have 40–300
  attributes each; always `get-block-schema` first (the highlighted subset covers
  the common cases; `full:true` for the rest).
- **Colors are palette slugs**, not hex, in most Kadence attributes/settings
  (`"palette3"`), resolved to `var(--global-palette3)`. A literal hex also works.
- **Button / list-item text** is on the child block (`singlebtn`/`listitem`), which
  `add-block` scaffolds empty — set that text by editing the child in the editor or
  via the Gutenberg block tools on the child's path.
- **A whole page in one pass works.** Field-tested: 29 `add-block` calls covering
  28 distinct block types (hero heading/button/spacer, 3-col `rowlayout` with a
  nested `infobox` per column, `countup`, `progress-bar`, `iconlist`, `icon`,
  `image`, `advancedgallery`, `testimonials`, `accordion`, `tabs`, `table`,
  `tableofcontents`, `show-more`, `countdown`, `videopopup`, `posts`, CTA) built a
  complete landing page that rendered fully on the front end and came back clean
  from the editor after one Update. Build top-down and insert nested blocks right
  after their container while you still know its path.
- Keep this a **living doc** — append new field-tested Kadence findings as more
  pages are built.
