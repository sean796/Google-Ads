---
name: emcp-breakdance
description: Build and edit native Breakdance pages through EMCP's standalone Breakdance integration. Load for Breakdance draft creation, nested element trees, native controls, responsive styling, or existing template content. Start with runtime discovery; this skill covers the initial adapter tested on Breakdance 2.8.3.
---

# Breakdance with EMCP

Use the `emcp-tools/breakdance-*` tools. The first adapter supports Breakdance
2.8.3–2.8.x in Breakdance mode, with one standalone builder selected at a time.
Gutenberg and its block packs remain available alongside it.

## Discover before authoring

1. Call `breakdance-get-context` for the installed version, permissions and actual
   breakpoints. Structural edits require full Breakdance access and enabled tools.
2. Read `breakdance-list-elements` and `breakdance-get-element-schema` with the
   exact namespaced `type`, such as `EssentialElements\Heading`. The response
   includes native controls, universal controls, defaults and nesting rules.
3. Read `breakdance-get-design-system` to reuse existing colors and design settings.
   Do not request arbitrary WordPress options or account/license data.
4. Read an existing page with `breakdance-get-page`, or create a draft using
   `breakdance-create-page` with `{title}`. Keep its returned content hash.

## Native nested tree

Breakdance uses nested children, unlike Bricks' flat element list:

```json
{
  "root": {
    "id": 1,
    "data": {"type": "root", "properties": {}},
    "children": [
      {
        "id": 100,
        "data": {"type": "EssentialElements\\Section", "properties": {}},
        "children": [
          {
            "id": 101,
            "data": {
              "type": "EssentialElements\\Heading",
              "properties": {
                "content": {"content": {"text": "Your heading", "tags": "h1"}},
                "design": {"typography": {"color": {
                  "breakpoint_base": "#2447a8",
                  "breakpoint_phone_portrait": "#ae304a"
                }}}
              }
            },
            "children": []
          }
        ]
      }
    ]
  },
  "_nextNodeId": 102,
  "status": "exported"
}
```

IDs are unique positive integers; root is 1. `_nextNodeId` must exceed every node
ID. Sections belong at root, containers accept children, and final elements do
not. Limits: 2000 nodes and 50 nesting levels. Specialized nesting rules are
outside the initial adapter; consult the returned rule before planning a layout.

Native control paths matter: heading text is `content.content.text`, and heading
color is `design.typography.color`. Advanced controls live under
`settings.advanced`; existing CSS class names use `settings.advanced.classes`.
Typography is a composite control: custom font sizes use
`design.typography.typography.custom.customTypography.fontSize`, whose breakpoint
values are unit objects such as `{"number":48,"unit":"px","style":"48px"}`.
Never substitute Elementor or Bricks setting names.

## Responsive layout recipes

These paths were verified with a native landing page on Breakdance 2.8.3.
Read the runtime schema first; these examples are not a substitute for discovery.

- Unit values use `{number: 24, unit: "px", style: "24px"}`. Responsive values
  wrap the value in breakpoint keys, for example
  `{breakpoint_base: {number: 64, unit: "px", style: "64px"},
  breakpoint_phone_portrait: {number: 46, unit: "px", style: "46px"}}`.
- Set typography size at the composite path above. `fontWeight` and `lineHeight`
  are siblings of `fontSize`; line height can use a unit object with an empty
  unit and a style such as `"1.1"`. `fontFamily` accepts a native font value such
  as `"Arial"`. Keep font choices local to the page unless global changes are asked for.
- Sections use `design.spacing.padding`; Div uses
  `design.container.padding.padding`. Each contains `top`, `right`, `bottom`,
  and `left`, with breakpoint-wrapped unit values. Set phone padding explicitly.
- A grid container uses `design.layout_v2.layout: "grid"`,
  `g_items_per_row` with responsive numbers (e.g. 3 desktop, 2 tablet, 1 phone),
  and `g_space_between_items` with responsive units. Use
  `design.container.width` for Div width, e.g. a responsive 100% unit.
- Horizontal layouts use `layout: "horizontal"`, `h_align`, `h_vertical_align`,
  and `h_gap`. `h_vertical_at` is a breakpoint ID string for stacking, not a
  breakpoint map. Vertical containers use `layout: "vertical"` and `v_gap`.
- Section width uses `design.size.width: "custom"` with `container_width`;
  background color uses `design.background.color` on both Section and Div.
- Button text and link live at `content.content.text` and
  `content.content.link`. A URL link is `{type: "url", url: "#contact"}`;
  set the target section's `settings.advanced.id` to `contact`. Custom buttons
  use `design.button.style: "custom"` and `design.button.custom` controls such
  as responsive `background`, `color`, and `size.size: "large"`.

Test intermediate widths as well as desktop and phone. A two-column hero can
overflow on tablet even when its phone layout stacks correctly. Long words need
enough room inside the card padding. Verify heading sizes, card stacking, actual
link targets, and editable text/tag controls in the native editor. Breakdance's
responsive toolbar provides previews at its configured breakpoint widths.

## Delivery through EMCP

This skill is bundled with Neo EMCP. With Agent Skills enabled, its description
is injected into MCP discovery and eligible AI Chat prompts; `get-skill` with
slug `emcp-breakdance` loads this full body. Both downloadable skill formats
include this same SKILL.md. The instructions are self-contained so injected
clients do not need access to local reference files.

## Edit and verify

- `breakdance-set-page-tree`: `{post_id, expected_hash, tree}` replaces the tree.
- `breakdance-add-element`: `{post_id, expected_hash, type, properties, parent_id,
  position}` adds one childless node and allocates its ID. Parent defaults to 1.
- `breakdance-update-element`: `{post_id, expected_hash, element_id, properties}`
  recursively merges named groups; lists are replaced. Optional `label` sets the
  friendly name. Preserve values you do not intend to change.
- `breakdance-move-element`: use `element_id`, `parent_id`, optional `position`.
- `breakdance-remove-element`: removes the node and its descendants.

Supply the latest `content_hash` as `expected_hash` on every mutation. Re-read
after each write, especially after a stale-edit or native-save error. Saves create
a prior WordPress revision and use native CSS/dependency generation. Do not bypass
disabled tools, full-access requirements or edit locks through direct metadata.

Verify the returned tree, desktop/mobile frontend and native editor controls.
Leave drafts unpublished unless asked to publish. Report any cache/save error
and the returned prior revision before retrying.

For an existing page, prefer small `update-element` requests for isolated
responsive or text changes. Reserve full-tree replacement for structural work;
large trees can exceed a client's request or approval-review limits. If a
request is rejected, follow the reported restriction, preserve the existing
draft, and use a smaller edit only when it is an allowed safer alternative.

## Boundaries

Discovery includes registered elements, but this first adapter excludes code,
forms, global block instances and specialized nesting from structural writes.
It reads existing templates, headers, footers, popups and blocks; it does not
create templates or modify display conditions. Global settings, selectors,
presets and variables are read-only. Oxygen mode is not supported.

Maintained by EMCP from the installed Breakdance 2.8.3 APIs. Breakdance documentation:
https://breakdance.com/documentation/ and https://github.com/soflyy/breakdance-developer-docs.
