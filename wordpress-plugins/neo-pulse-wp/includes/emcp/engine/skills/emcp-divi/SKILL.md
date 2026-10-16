---
name: emcp-divi
description: Build and edit native Divi 5 pages, library layouts, Theme Builder templates and assignments, and theme options through EMCP's standalone Divi integration. Use when Divi is the selected builder and emcp-tools/divi tools are available; discover installed module schemas before authoring.
---

# Divi 5 through EMCP

Start with `divi-get-context`. Confirm the target URL, installed version and
permissions. The tested adapter targets Divi 5.13.x. Discover available tools
and their input schemas; use the standalone Divi tools for Divi layouts.

## Native layouts

Read `divi-get-element-schema` before authoring a module. Schemas come from the
installed theme. Read the design system before referring to existing presets,
colors or variables; never invent their IDs. Unavailable modules are marked
discovery-only. Legacy Divi 4 shortcodes and mixed layouts are not rewritten.

`divi-get-page` returns `tree` and `content_hash`. Supply this as `expected_hash`
to every edit, then use the new response hash and IDs. A tree has a root node
with ID 1, type `divi/placeholder`, and `_nextNodeId` above all unique integer IDs.
Every node has `data.type`, `data.properties.attributes` and `children`.
The adapter serializes native WordPress block comments and stamps builderVersion.

Standard nesting is placeholder → section → row → column → modules. Nested rows,
groups and compound modules use their schema's allowed parents. Row column
structure and responsive widths must match the actual child columns. Prefer
native decoration controls to custom HTML/CSS layouts.

Examples of native attribute paths:

- Heading text: `title.innerContent.desktop.value` (plain text).
- Heading tag: `title.decoration.font.font.desktop.value.headingLevel`.
- Text HTML: `content.innerContent.desktop.value` (safe, raw HTML).
- Button: `button.innerContent.desktop.value` with `text`, `linkUrl`, `linkTarget`.
- Responsive styles use `desktop`, `tablet`, `phone` by default. Extra breakpoints
  only emit styles when enabled; inspect `divi-get-design-system`.

Create drafts with `divi-create-page`. Library and Theme Builder layouts are
unattached native layout posts; editing uses the same page/tree tools. Writes
preserve page status and create revisions. Do not fall back to raw database
writes after validation or stale-hash failures. Inspect the error and re-read.

## Tested landing-page patterns

These settings were exercised on a native Divi 5.13 landing page. Read the
installed schema before reusing them on another version.

### Responsive rows and columns

For a two-column desktop row, set
`module.advanced.flexColumnStructure.desktop.value` to `equal-columns_2`
and each column's `module.decoration.sizing.desktop.value.flexType` to `12_24`.
Three equal columns use `equal-columns_3` and `8_24`.

To stack at tablet and phone sizes, configure **both breakpoints explicitly**:

- Row: `module.decoration.layout.{breakpoint}.value` with
  `flexDirection: "column"` and `alignItems: "stretch"`.
- Row: `module.advanced.flexColumnStructure.{breakpoint}.value` as
  `equal-columns_1`.
- Each column: `module.decoration.sizing.{breakpoint}.value` with
  `flexType: "24_24"` and, where needed, `width: "100%"`.

Phone-only overrides leave tablet columns at their desktop widths. Changing
row direction alone can also leave narrow columns. Inspect both widths in the
native editor. Set heading sizes separately at tablet and phone; a desktop
76px hero heading needs a smaller responsive size. Desktop card rows can use
`alignItems: "stretch"` to align their card backgrounds.

### Buttons, images and FAQ

- Custom button styling requires
  `button.decoration.button.desktop.value.enable: "on"`. Set its font in
  `button.decoration.font.font`, background in `button.decoration.background`,
  and padding in `button.decoration.spacing`, each using the usual
  `desktop.value` wrapper. To hide the icon, set
  `button.decoration.button.desktop.value.icon.enable: "off"`.
- Reuse Media Library images first. Set `image.innerContent.desktop.value`
  with `src`, `id`, and meaningful `alt`. A full-width image can use
  `module.advanced.forceFullwidth.desktop.value: "on"`.
- A native `divi/accordion` contains `divi/accordion-item` children. Each item
  takes `title.innerContent.desktop.value` and safe HTML in
  `content.innerContent.desktop.value`. Set the heading level on the parent
  through `title.decoration.font.font.desktop.value.headingLevel`. Verify
  expansion by clicking an actual question on the frontend.
- Section anchors live in `module.advanced.htmlAttributes.desktop.value.id`.
  Every button using a fragment such as `#pricing` needs a matching section ID.

### Saves and rendering

The current adapter requires string values to survive `wp_kses_post` unchanged.
Bare ampersands can therefore cause an unsafe-HTML validation error: use
`&amp;` in HTML text, or plain wording such as "and" where appropriate. Do not
double-encode already escaped content or loosen validation to force a save.

Prefer targeted `divi-update-element` patches once a large page exists. Carry
forward each response's hash and IDs. Large whole-tree requests can exceed a
client's approval-review payload limit; the observed limit belongs to that
client, not Divi. Inspect the actual rejection. Do not retry unchanged requests
or bypass approval; use a permitted narrower edit when the error allows it.

Reload the frontend after saving and let its styles finish loading before
judging the design. Confirm computed heading sizes and background colors if
the first render looks unstyled. Reload an already-open Visual Builder after
MCP edits; never save a stale editor over the new page.

## Theme Builder

Read `divi-get-theme-builder` and `divi-list-template-conditions` first.
`divi-create-theme-layout` creates a header/body/footer layout without assigning
it. `divi-create-template` creates a disabled custom template. Use
`divi-update-template` to set layout references, explicit `use_on` and
`exclude_from` conditions, and enabled state. Supply the current
`theme_builder_hash` as `expected_hash` to every template write.

Layout references must have the correct native post type. Inspect existing
assignments before enabling a template: assignments affect all matching pages.
Respect user/project rules about existing headers or templates. Divi's unsaved
Theme Builder draft or an active edit lock blocks MCP writes until resolved.
Removing a custom template preserves the shared layout posts. The default
template cannot be removed through this tool.

A custom body layout wrapping `divi/post-content` can constrain the entire
landing page. For a full-width design, inspect that wrapper's section padding
and row sizing. On the page-scoped body layout, a row width/maxWidth of `100%`
and zero vertical padding allows the page's own sections to control the layout.
Check assignment scope before changing a shared body layout.

## Theme Options

`divi-get-theme-options` returns current safe values, native controls/choices and
`settings_hash`. Patch only requested keys using `divi-update-theme-options`;
use that hash as `expected_hash`. Native checkbox values are `on`/`off`.
Credentials and executable integration fields are redacted and unavailable for
writes. Unrelated settings remain untouched. A successful response contains
previous values for a deliberate, hash-checked reversal if needed.

## Verify

Read back saved content through MCP. Inspect frontend and native Visual Builder,
check heading hierarchy, links, images and interactive modules, then inspect
desktop/tablet/phone layouts. HTTP 200 alone is not proof of a working module:
some modules require source data, companion plugins or frontend scripts.
Test new assignments against a narrowly scoped test page before broader use.

## Credit and sources

Divi authoring research: **Shashank Gupta (@shashankgupta-dev), DiviLove**,
[divilovewp/divi5-skill](https://github.com/divilovewp/divi5-skill), MIT-licensed.
Its modular Divi 5 references informed this integration. This EMCP-specific
skill is independently written and checked against installed Divi 5.13 source;
it does not require Divi Connect or its tool names.
Official reference: https://dev.elegantthemes.com/.
