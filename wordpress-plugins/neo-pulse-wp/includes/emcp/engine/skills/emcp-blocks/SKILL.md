---
name: emcp-blocks
description: >-
  Load this skill whenever the user wants to create, edit, or manage a custom
  Gutenberg block through the Neo EMCP MCP, recognizable by the tools
  `list-block-control-types`, `validate-block-spec`, `create-custom-block`,
  `update-custom-block`, `get-custom-block`, `list-custom-blocks`,
  `set-block-status`, and `delete-custom-block` being available. It is the
  playbook for the Block Builder: how to shape a block spec (meta, typed
  attributes, an `{{}}` HTML template), which attribute types exist and what
  they render as, the discover -> inspect -> act flow (every block an agent
  creates is an inactive draft; only a site administrator activates it, in
  Neo EMCP -> Sandbox -> Blocks), and how editor preview works via
  ServerSideRender. Trigger for
  "build a custom block", "make a Gutenberg
  block for X", "create a reusable block", or any request to add new block
  types rather than use the built-in Gutenberg block tools.
---

# emcp-blocks, authoring custom Gutenberg blocks over MCP

The Block Builder lets an AI agent describe a brand-new Gutenberg block as a
structured **spec** (JSON, not code) and have the plugin compile it into a
real, dynamic, server-rendered block. The agent never writes PHP or the
block's editor JavaScript; the plugin's own generator does that from the spec,
so its output is auditable and safe by construction.

**Eight Pro tools, all disabled by default.** An admin must turn each one on
from Neo EMCP -> Tools before an agent can call it. If a tool in this family
is missing from your tool list, tell the user to enable it there rather than
trying to work around it.

## Discover -> inspect -> act, then an admin activates

This is the required order. Skipping a step is the most common source of a
rejected spec.

1. **`list-block-control-types`**, read-only. Returns the supported attribute
   types (with their editor control and JSON Schema type) and a description of
   the `{{}}` template syntax. Always call this first when you don't already
   know the exact vocabulary, guessing a type name gets it rejected.
2. **`validate-block-spec`**, read-only. Takes `{ spec }` and dry-runs the same
   generator `create-custom-block` uses, without saving anything. Returns
   `{ valid, error }`. Fix the spec until this passes before creating anything.
3. **`create-custom-block`**, takes `{ spec }`. Generates the block's four
   assets (block.json, render.php, edit.js, style.css) and stores them in an
   isolated sandbox as an **inactive draft**. Returns a summary with the new
   `block_id` and a `note` saying where it is activated.
4. **Activation is admin-only.** Activating a block means WordPress will
   `register_block_type()` it and start executing its generated render.php on
   every page that uses it, so no MCP tool can do it: a site administrator
   reviews and activates the block in Neo EMCP -> Sandbox -> Blocks (where
   they can also deactivate or delete it). `set-block-status` accepts only
   `status: 'draft'` (to take a block back out of use) and refuses
   `'active'` with `activation_requires_admin`. After creating a block, tell
   the user it is waiting for them in Sandbox -> Blocks. The same rule holds
   for the PHP-Snippets sandbox and the Widget Builder.
5. **Once active**, the block appears in the WordPress editor's block inserter
   under a dedicated **"EMCP Custom"** category. When a human inserts it, the
   editor shows a live preview of its PHP output on the canvas (via
   ServerSideRender) and a **Settings** panel in the inspector sidebar with one
   control per attribute, so they can tweak it visually. You can set the user's
   expectation accordingly: once they activate the block, tell them where to find
   it and that its options live in that Settings panel. To place it
   programmatically, use its `block_name` (`emcp/custom-<id>`) with the ordinary
   always-on Gutenberg tools, `add-block` / `update-block` / `insert-pattern`
   etc. The Block Builder only creates the block *type*; you still use the
   standard block tools to put an *instance* of it into a post's content.

Round-trip housekeeping: `get-custom-block` (spec + generated render.php +
status), `list-custom-blocks` (optional `status` filter: active/draft/any),
`update-custom-block` (replace the spec and regenerate assets in place, same
`block_id`), `delete-custom-block` (destructive, removes the record and its
sandbox files).

## The block spec shape

Every call that creates or updates a block takes the same `spec` object:

```jsonc
{
  "meta": {
    "title": "Callout",            // required
    "category": "ignored",         // accepted but ALWAYS overridden, see below
    "icon": "megaphone",           // dashicon slug shown in the inserter
    "description": "A highlighted callout box.",
    "keywords": ["highlight", "note"]
  },
  "attributes": [
    { "name": "heading", "type": "string", "default": "Hi", "label": "Heading" }
    // one entry per attribute, see the type table below
  ],
  "html_template": "<div class=\"callout\"><h3>{{heading}}</h3></div>",
  "styles": ".callout{padding:16px}",   // optional, becomes the block's own style.css
  "example": { "heading": "Preview text" }  // optional, shown in the inserter preview
}
```

- `meta.category` is **ignored**. Every generated block registers into a
  single, fixed "EMCP Custom" inserter category, regardless of what you pass,
  there is no way to change it.
- Each attribute is `{ name, type, default?, control?, label?, options?, help? }`.
  `name` and `type` are required; `name` must be a unique lowercase identifier.
  `options` is required when `type` is `select`.
- `html_template` is plain HTML using the `{{}}` DSL (below). This is compiled
  into the block's `render.php`, so every output is escaped for you according
  to the attribute's type, you never write `esc_html()`/`esc_url()` yourself.

## Attribute types

| `type` | JSON Schema type | Editor control | What `{{name}}` outputs |
|---|---|---|---|
| `string` | string | TextControl | The escaped text |
| `richtext` | string | a textarea, rendered with `wp_kses_post` | Sanitized HTML (allows basic markup) |
| `number` | number | RangeControl (`min`/`max`/`step` on the attribute) | The escaped number |
| `boolean` | boolean | ToggleControl | Not usually output directly, drives `{{#if}}` |
| `select` | string | SelectControl (needs `options: [{value,label}]`) | The escaped selected value |
| `color` | string | ColorPalette | The escaped color value (hex or CSS color) |
| `media` | object | MediaUpload | The escaped image URL (the stored value is `{id, url}`, `{{name}}` reads its `url`) |
| `url` | string | URLInput/TextControl | The escaped URL, directly |
| `repeater` | array | A list of rows the editor adds, removes, reorders and edits (see "Repeaters" below) | Not output directly, loop over it with `{{#each}}` |

Two of these are easy to get wrong, verified against the actual generator:

- **`url` stores a plain string**, not an object. Unlike Elementor's URL
  control (which stores `{url, is_external, nofollow}`), Gutenberg's
  TextControl for a `url`-type attribute holds the URL itself. Use it directly
  in the template: `<a href="{{link}}">`. Do **not** write `{{link.url}}`,
  there is no sub-key.
- **`media` stores an object** (`{id, url}`) because it comes from
  `MediaUpload`. `{{name}}` already knows to read `.url` off it for you, so in
  the template you still just write `{{image}}` and get the escaped image URL,
  same as any other placeholder.
- **`boolean` is a real PHP `true`/`false`** at render time, not the
  Elementor-style `'yes'`/`''` string, so `{{#if a_boolean_attribute}}` is the
  correct and only way to branch on it.

## The `{{}}` template DSL

- `{{attribute_name}}`, outputs that attribute's value, auto-escaped by its
  type (see the table above).
- `{{#if attribute_name}}...{{/if}}`, conditional block. Works correctly with
  `boolean` attributes (`true`/non-empty shows the body) and with any other
  attribute treated as "set or not" (an empty string/0 hides it).
- `{{#each attribute_name}}...{{/each}}`, loops over a `repeater` attribute,
  reference each row's fields by name inside the loop body. See "Repeaters"
  below.
- Placeholders inside an HTML attribute value (`href="{{link}}"`) are
  automatically `esc_attr`'d instead of `esc_html`'d, you don't have to do
  anything differently, the compiler detects the attribute context from the
  surrounding markup.
- A `media` attribute also exposes `{{name_alt}}` (the image's alt text from
  the Media Library) and `{{name_id}}` (the attachment ID). Always write
  `<img src="{{photo}}" alt="{{photo_alt}}">`, never a hard-coded or empty alt
  for a meaningful image. Don't declare your own attribute with one of those
  names; the spec is rejected.

## Sidebar panels, help text and native style controls

- **`group`** on an attribute puts it in a sidebar panel with that title.
  Attributes sharing a group share a panel, in the order they first appear;
  the first panel opens by default, the others start collapsed. Without a
  group an attribute lands in "Settings". Use 2-4 panels for anything with more
  than ~5 attributes, e.g. Content / Link / Appearance.
- **`help`** is shown under the control. Use it to explain a choice in plain
  words ("Leave empty to use the text color."), not to repeat the label.
- **`color`** controls offer the active theme's palette swatches plus a custom
  color, so prefer leaving a color empty and falling back to `currentColor` in
  the CSS over hard-coding a hex default.
- **`media`** controls show a thumbnail with Replace / Remove. `media_types`
  widens the picker: `["image"]` (default), `["video"]`, `["audio"]`,
  `["application"]` or a mix.
- **`supports`** switches on WordPress's own style panels, which apply on the
  front end too: `color` (`{"text":true,"background":true,"link":true}`),
  `spacing` (`padding`, `margin`), `typography` (`fontSize`, `lineHeight`),
  `border` (`radius`, `width`, `color`, `style`), `shadow` (`true`),
  `dimensions` (`minHeight`), `background` (`backgroundImage`), `align`
  (`["wide","full"]`). Prefer these to home-made color/padding attributes:
  they use the theme's presets and look like every other block.
- **Give the template one root element.** The chosen supports, the editor's
  "Additional CSS class" and alignment are merged into that first element's
  `class` and `style` on the front end (no extra wrapper). With several
  top-level elements only the first one receives them.

## Repeaters (lists the editor can change)

`type: "repeater"` gives a list of rows that the person editing can add,
remove, reorder and edit, each row opening in the sidebar. Use it for menus,
price lists, FAQs, features, team members, logos, steps.

```jsonc
{
  "name": "items", "type": "repeater", "label": "Items", "group": "Items",
  "fields": [
    { "name": "name",  "type": "string", "label": "Name", "default": "New item" },
    { "name": "price", "type": "string", "label": "Price", "default": "$0" },
    { "name": "photo", "type": "media",  "label": "Photo (optional)" },
    { "name": "featured", "type": "boolean", "label": "Highlight" }
  ],
  "default": [ { "name": "Flat white", "price": "$4.50" } ],   // starter rows
  "title_field": "name",   // row title in the sidebar (default: first string field)
  "item_label": "Item", "add_label": "Add item",
  "min_rows": 1, "max_rows": 24
}
```

Template: `{{#each items}}<li>{{name}} {{price}}{{#if photo}}<img src="{{photo}}" alt="{{photo_alt}}">{{/if}}</li>{{/each}}`.
Each row field is escaped by its own type; a media field gives `{{field_alt}}`
and `{{field_id}}`; a top-level attribute can still be read inside the loop.
Fields can use any type except `repeater` (no nested repeaters). This
replaces the old "media-typed array" trick in worked example 2 below, which
gave a fixed list the editor could not change.

**Reserved names.** Don't name an attribute `align`, `className`, `style`,
`backgroundColor`, `textColor`, `gradient`, `fontSize`, `fontFamily`,
`borderColor`, `shadow`, `anchor`, `lock`, `metadata` or `layout`: WordPress
uses those for block supports, and a spec using one is rejected. For a
left/center/right choice use e.g. `content_align`.

## Editor preview: ServerSideRender

A generated block is **dynamic**, its output always comes from PHP
(`render.php`), never from a JS `save()` function (the generated block's
`save()` is a no-op, it returns `null`). The generated `edit.js` therefore
renders the block editor sidebar controls (`ToggleControl`, `RangeControl`,
`TextControl`, `SelectControl`, `ColorPalette`, `MediaUpload`, matched to your
attribute types) and then hands the current attributes to WordPress's
`ServerSideRender` component, which calls `render.php` on every attribute
change and shows the live PHP output inline in the editor canvas. This is why
`edit.js` is **always plugin-generated** and never authored from a spec, you
never pass JavaScript in, the spec only ever describes controls and a
template, and the generator's fixed `ServerSideRender` wiring is what actually
draws the preview.

## Worked example 1: a callout block

Heading text, an optional body toggled with a boolean, and a link, this
exercises `string`, `boolean` with `{{#if}}`, and `url`.

```jsonc
{
  "meta": {
    "title": "Callout",
    "icon": "megaphone",
    "description": "A highlighted callout with an optional body and link."
  },
  "attributes": [
    { "name": "heading",  "type": "string",  "default": "Heads up",      "label": "Heading" },
    { "name": "show_body", "type": "boolean", "default": true,           "label": "Show body" },
    { "name": "body",     "type": "richtext", "default": "Read this.",   "label": "Body text" },
    { "name": "link",     "type": "url",      "default": "",             "label": "Learn more link" }
  ],
  "html_template": "<div class=\"emcp-callout\"><h3>{{heading}}</h3>{{#if show_body}}<div>{{body}}</div>{{/if}}{{#if link}}<a href=\"{{link}}\">Learn more</a>{{/if}}</div>",
  "styles": ".emcp-callout{border-left:4px solid #2271b1;padding:12px 16px;background:#f0f6fc}"
}
```

Call order: `list-block-control-types` (confirm the vocabulary) ->
`validate-block-spec({ spec })` (fix anything it flags) ->
`create-custom-block({ spec })` (creates the draft) -> tell the admin to
activate it in Neo EMCP -> Sandbox -> Blocks -> once active, place it with
`add-block` using `emcp/custom-<block_id>`.

Note `{{#if link}}` here treats an empty string as falsy, the same `{{#if}}`
syntax works for both a `boolean` attribute and a "did the user fill this in"
check on a `string`/`url` attribute.

## Worked example 2: a feature list the editor can change

Use a `repeater` attribute for any list. The person editing the page adds,
removes and reorders rows in the block's sidebar, per block instance.

```jsonc
{
  "meta": { "title": "Feature List", "icon": "list-view" },
  "attributes": [
    { "name": "title", "type": "string", "default": "What you get", "label": "Title" },
    {
      "name": "items",
      "type": "repeater",
      "label": "Features",
      "group": "Features",
      "fields": [
        { "name": "label", "type": "string", "label": "Feature", "default": "New feature" },
        { "name": "link",  "type": "url",    "label": "Link (optional)" }
      ],
      "default": [
        { "label": "Fast setup" },
        { "label": "No code required" },
        { "label": "Works with any theme" }
      ],
      "title_field": "label", "item_label": "Feature", "add_label": "Add feature",
      "min_rows": 1, "max_rows": 12
    }
  ],
  "html_template": "<div class=\"emcp-feature-list\"><h4>{{title}}</h4><ul>{{#each items}}<li>{{label}}{{#if link}} <a href=\"{{link}}\">Learn more</a>{{/if}}</li>{{/each}}</ul></div>"
}
```

Inside `{{#each items}}...{{/each}}`, `{{label}}` refers to the current row's
`label` field, and each field is escaped by its own type: the `url` field is
scheme-checked like a top-level `url` attribute. The `default` rows are the
starting rows. WordPress stores rows only once someone edits the list, so a
block whose list was never edited follows a later change to `default`, and an
edited block keeps its own rows.

Blocks made before 3.20.0 sometimes used a `media`-typed attribute with an
array `default` as a fixed list. That still renders, but the editor cannot
change it; move such a list to a `repeater` when you next update the block.

## Export / import (cloud-ready)

A custom block (like a custom widget or a PHP snippet) can be exported as a
portable, checksum-verified bundle with `export-sandbox-artifact`
(`{ kind: "block", id }` -> `{ bundle }`) and brought onto another site as a
new draft with `import-sandbox-artifact` (`{ bundle }` -> `{ id }`). This is
the same mechanism used for widgets and snippets, `kind` is the only thing
that differs. Exporting/importing a block still requires Neo EMCP on
both ends, `kind: "block"` resolves to nothing (a `pro_required` error) on a
site without the Block Builder.

## Common rejection reasons (`validate-block-spec` / `create-custom-block`)

- Missing `meta.title`, missing `attributes` (at least one is required), or
  missing `html_template`.
- An attribute missing `name` or `type`, a duplicate `name`, or a `type` not
  supported by `list-block-control-types`.
- `type: "select"` without an `options` array.
- Passing hand-written JavaScript in `scripts`, this field is reserved and
  currently has no effect, the editor script is always plugin-generated.

> Handing the site over without EMCP: an admin can package every ACTIVE block (with widgets and snippets) as a standalone plugin from Sandbox > Export as plugin once the Sandbox Plugin Export module (Pro) is enabled. Block names (`emcp/custom-{id}`) are preserved, so existing posts keep rendering after Neo EMCP is deactivated. Activate a block before the export or it stays behind.
