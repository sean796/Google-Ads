---
name: emcp-avada
description: Build and edit Avada Builder pages through EMCP's standalone Avada integration. Use for native element discovery, draft layouts, shortcode trees, responsive field settings, or editing basic Avada content elements. Read runtime context first to check the installed version and supported authoring scope.
---

# Avada with EMCP

Use `emcp-tools/avada-*`. This adapter targets Avada Builder 3.16.1–3.16.x.
Discover the installed theme, Builder and Core versions with `avada-get-context`.
The active Avada theme is required. Core adds companion display elements when
installed and enabled in Avada settings. Tested with theme 7.16.1 and Core 5.16.1.
Only the selected standalone builder exposes tools; Gutenberg stays available.

## Discover

1. `avada-list-elements` returns native types and authoring availability.
2. `avada-get-element-schema` takes a shortcode type such as `fusion_title`.
   Read its fields, defaults, responsive hints and dependencies before writing.
   A listed element is not necessarily supported for authoring.
3. `avada-get-design-system` reads allowlisted typography, colors, width and
   breakpoint settings. Do not invent global tokens or change global options.
4. Read an existing page, or use `avada-create-page` with `{title}` for a draft.

## Storage and tree

Avada stores its layout as nested shortcodes in WordPress `post_content`.
EMCP exposes a tree representation; this is not an Avada JSON import format.

- Root: `{id: 1, data: {type: "root", properties: {}}, children: [...]}`.
- Nodes: `{id: 2, data: {type: "fusion_builder_container", properties:
  {attributes: {hundred_percent: "yes"}, content: ""}}, children: [...]}`.
- Tree envelope: `{root: ..., _nextNodeId: 3, status: "exported"}`.
- Structure: container → row → column → content elements. Nested rows use
  `fusion_builder_row_inner` inside a column, then `fusion_builder_column_inner`.
- Attributes are strings. Use the exact native field names; `fusion_title`
  uses `size: "1"` for an h1. Text/heading/button content goes in `content`.
- Composite typography and dimension controls expose individual fields such as
  `font_size` and `margin_top`. Do not serialize UI groups marked
  `remove_from_atts`. For a specific heading size, set `font_size`, e.g. `48px`.
- Responsive fields indicated by the schema can have `_medium` and `_small`
  variants. These are strings, not Breakdance breakpoint objects.
- IDs are temporary, assigned during parsing. Use the returned tree and hash
  after every write; previous element IDs can refer to different nodes after
  an insertion, move or removal. `_nextNodeId` must exceed every node ID.

## Edits

Every mutation requires `post_id` and the latest `expected_hash` from `get-page`.

- `set-page-tree`: replace the tree for structural changes.
- `add-element`: `type`, optional `properties`, `parent_id`, `position`.
- `update-element`: `element_id`, `properties`; named property groups merge.
- `move-element`: `element_id`, `parent_id`, optional `position`.
- `remove-element`: `element_id`; removes that subtree.

Prefer small edits to existing pages. Revisions preserve previous content;
WordPress saves trigger native Avada cache invalidation. Preserve the returned
revision ID if a save reports an error, re-read, and inspect before retrying.
Writes must be enabled and respect WordPress permissions, Avada's role manager,
edit locks and the currently selected integration.

## Scope and verification

Basic containers, rows, columns, titles, text, buttons, image frames, separators,
icons and menu anchors are supported. Core's Portfolio, FAQ and Avada Slider
display elements are supported too. Forms, executable code, global instances,
dynamic values, arbitrary embedded shortcodes and specialized nesting are not
authored. Existing mixed or malformed content returns a parse error; do not
replace it through a different tool to bypass validation. Library discovery
does not authorize changing global elements or template conditions.

## Avada Core

Use `avada-list-core-content` with `kind: portfolio`, `faq` or `slider` before
referencing existing content. Results include IDs, status and category slugs for
portfolio/FAQ items, or slider group slugs and slide counts. Pagination uses
`page` and `per_page`. This tool does not create or modify the source items.

- `fusion_faq`: use `cats_slug` to filter FAQ categories.
- `fusion_portfolio`: use `cat_slug` to filter portfolio categories.
- `fusion_fusionslider`: use the slider group slug in the `name` attribute.
- Core display elements query published items. Creating or modifying FAQ,
  Portfolio or Slider source content requires a separate authorized workflow.
- These elements are childless nodes inside a column; native Core queries render
  their content. Read schemas for current options rather than inventing values.
- Respect `enabled` and `authoring_supported`; global Avada settings may disable
  individual Core features. An empty query does not prove rendering works: use
  authorized existing items or disposable fixtures for visual verification.
- Legacy Elastic Slider, source slide settings and contact/privacy elements are
  outside this adapter's authoring scope.

Check the frontend and native Live Builder, actual text/design controls, links,
and small/medium layouts. A successful save does not prove the Live Builder can
load; report native dependency errors. Leave drafts unpublished unless asked.

Maintained by EMCP using installed Avada Builder APIs. Documentation:
https://avada.com/documentation/
