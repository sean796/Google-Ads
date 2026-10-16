---
name: emcp-plugins/addons
description: >-
  Use this skill when working with Elementor addon plugins through Neo EMCP,
  recognizable by an `emcp-tools-essential-addons-read`,
  `emcp-tools-premium-addons-read`, `emcp-tools-uae-read` or
  `emcp-tools-uae-write` tool being available, or by the user asking to use
  Essential Addons / Premium Addons / Ultimate Addons widgets on a page, or to
  manage Ultimate Addons for Elementor (formerly Header Footer Elementor)
  headers, footers and their display conditions. This domain has TWO different
  shapes, do not assume the usual read/write pair: Essential and Premium Addons
  expose ONE read tool each for discovery only (their widgets are placed with
  the ordinary `add-free-widget` tool), while Ultimate Addons for Elementor is
  both a widget pack AND a data plugin, so it has the normal read/write
  dispatcher pair. Load this from `emcp-plugins` whenever one of those tools is
  present.
---

# emcp-plugins/addons, Elementor addon packs and Ultimate Addons for Elementor

This domain breaks the usual plugin-integration rule, so read this before acting.

| Plugin | Tools | Shape |
|---|---|---|
| Essential Addons for Elementor | `emcp-tools-essential-addons-read` | Discovery only |
| Premium Addons for Elementor | `emcp-tools-premium-addons-read` | Discovery only |
| Ultimate Addons for Elementor (UAE) | `emcp-tools-uae-read` / `emcp-tools-uae-write` | Widget pack **and** data plugin |

> **UAE was renamed.** It used to be "Header Footer Elementor". The
> wordpress.org slug is still `header-footer-elementor` and every internal
> identifier still says HFE (`Header_Footer_Elementor`, `HFE_VER`, the
> `elementor-hf` post type, `ehf_*` meta, the `hfe-` widget prefix). If a user
> says "Header Footer Elementor", they mean UAE.

Each tool still takes `{ operation, arguments }`, and calling it with no
`operation` returns its catalog.

---

## 1. Widget packs (Essential Addons, Premium Addons)

### There is no add tool, and that is deliberate

An addon pack registers its widgets into **Elementor's own widget registry**, so
EMCP can already place them with the standard widget tool. The pack's read tool
exists because those widgets are otherwise **undiscoverable**: `list-widgets`
serves the curated core catalog, so an agent has no way to learn that
`eael-pricing-table` or `premium-addon-banner` exist.

**Workflow: discover, inspect, then place with the ordinary tool.**

```jsonc
// 1. Discover. Filter with `search` or `category`.
{ "operation": "list-widgets", "arguments": { "search": "pricing" } }
// -> { count, widgets: [ { type: "eael-pricing-table", title: "Pricing Table", categories: [...] } ] }

// 2. Inspect the controls that actually carry content.
{ "operation": "get-widget-schema", "arguments": { "type": "eael-pricing-table" } }
// -> params keyed by REAL control names, plus total_controls and a note

// 3. Place it with the NORMAL widget tool, not with this pack's tool.
add-free-widget { post_id, parent_id, widget_type: "eael-pricing-table", settings: { ... } }
```

Do not look for an `add-widget` operation on these tools. There isn't one, and
adding a second placement path would only duplicate `add-free-widget`.

### Why the schema is filtered by default

Addon widgets are enormous: on a stock install `eael-pricing-table` reports
**456 controls**, `eael-adv-accordion` 467, and `premium-addon-banner` 391.
Returning all of them would flood the context window.

So `get-widget-schema` returns only **content-bearing** controls by default
(text, textarea, wysiwyg, media, url, repeater, icons, gallery, select, number,
choose) and caps the list. Everything else is styling chrome (sliders,
switchers, colour pickers, popover toggles, layout dividers).

- Default view: the controls you need to actually populate the widget.
- `{ "full": true }`: every control, including styling. Use only when you
  specifically need a styling control name, and expect a large response.
- Batch several widgets with `{ "types": ["a", "b"] }`.

The response reports `total_controls` and `shown` so you can tell when you are
seeing a subset.

### Use the real control names

Control names come straight from the widget, so use them **verbatim**
(`eael_pricing_table_title`, `eael_fancy_text_prefix`). Do not guess or invent
names. Elementor stores any key you send without complaining, so a wrong name
looks like it worked but never drives the widget. If a setting appears to do
nothing, re-read the schema rather than guessing a variant.

### Tier and availability

Each pack's tool registers only when that pack is active, and the catalog comes
from the live registry, so it automatically reflects the pack's own free/pro
tier and any conditionally registered widgets. If a widget you expect is
missing, the addon's own Pro tier is the usual reason.

---

## 2. Ultimate Addons for Elementor (UAE)

UAE is the one plugin in this domain that is **both** shapes. It registers
widgets into Elementor's registry like the packs above, *and* it stores
header/footer/block templates as posts with display conditions in meta. So its
read tool carries both jobs, and it is the only one here with a write tool.

### Read operations (`emcp-tools-uae-read`)

| Operation | Purpose |
|---|---|
| `list-widgets` | UAE's registered widgets (`hfe-*` free, `uael-*` with UAE Pro). Place them with `add-free-widget`, exactly as for the packs above. |
| `get-widget-schema` | Content-bearing controls for a widget by `type` (or `types`). `full: true` for everything. |
| `list-templates` | All templates with type, status and display conditions. Filter with `type`. |
| `get-template` | One template by `template_id`, adds user-role targeting and whether it has content yet. |

The widget half behaves exactly like Essential/Premium Addons: **discover here,
place with `add-free-widget`.** There is no add-widget operation.

### Write operations (`emcp-tools-uae-write`, off by default)

| Operation | Purpose |
|---|---|
| `create-template` | `title` + `type` (`header`, `footer`, `before_footer`, `custom`). |
| `update-template` | Change `title`, `status` or `type`. |
| `set-display-conditions` | `include`, optional `exclude`, optional `user_roles`. |
| `delete-template` | Needs `confirm: true`. `force: true` bypasses trash. |

### The template record and its content are separate steps

`create-template` makes the record. It does **not** build the header. Build the
content with the ordinary Elementor tools, using the returned `template_id` as
the `post_id`:

```jsonc
// 1. Create the record.
{ "operation": "create-template", "arguments": { "title": "Main Header", "type": "header" } }
// -> { template_id: 812 }

// 2. Target it.
{ "operation": "set-display-conditions",
  "arguments": { "template_id": 812, "include": ["entire-website"] } }

// 3. Build the actual header with the normal tools.
add-container   { post_id: 812, ... }
add-free-widget { post_id: 812, parent_id: "...", widget_type: "nav-menu", ... }
```

### Safety

`uae-write` renders **site-wide**: a bad header or footer affects every page. It
ships **disabled by default** and must be enabled on the Tools tab. `delete-template`
additionally requires `confirm: true`. Prefer `status: "draft"` while building,
and confirm the display conditions with `get-template` before publishing.

### Relationship to Neo EMCP Themer

Neo EMCP Themer is EMCP's own builder-agnostic theme builder and does the same job.
The two are deliberately **not** wired together, because two systems claiming the
same header or footer slot fight at render time. Use UAE tools on sites that
already run UAE; use Themer where it is the site's theme-building system. Do not
try to mirror templates between them.

If both are active, Neo EMCP shows a conflict notice and gives **Themer
priority** per slot: where Themer resolves a template, UAE's render for that slot
is suppressed. Any slot Themer does not claim still renders from UAE.

---

## Quick reference

- Widget packs: discover with the pack tool, place with `add-free-widget`.
- Never invent a control name; read it from `get-widget-schema`.
- Expect a filtered schema by default; pass `full: true` only when needed.
- UAE is both: discover/place its widgets, AND manage its templates.
- UAE templates: create the record, target it, then build content against `template_id`.
- Anything destructive or site-wide is off by default and confirm-gated.
