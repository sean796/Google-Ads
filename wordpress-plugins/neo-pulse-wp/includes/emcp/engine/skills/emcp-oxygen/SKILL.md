---
name: emcp-oxygen
description: Build and edit native Oxygen 6 pages with EMCP, including templates, headers/footers, exposed component properties, design transfers, global design, revisions and advanced native elements. Use the oxygen tools for Oxygen 6.1.3–6.1.x; this is not the classic Oxygen shortcode builder or Breakdance integration.
---

# Oxygen 6 with EMCP

Use `emcp-tools/oxygen-*`. Oxygen is a standalone integration; Gutenberg and
independently enabled block packs can remain available beside it.

## Discover first

1. Read `oxygen-get-context` for version, permissions and breakpoints.
2. Read `oxygen-list-elements`, then `oxygen-get-element-schema` for each exact
   type you intend to use. Prefer `OxygenElements\Container`, `OxygenElements\Text`,
   `OxygenElements\TextLink` and `OxygenElements\Image` for ordinary layouts.
3. Read `oxygen-get-design-system` and `oxygen-get-style-schema`. The former
   returns existing classes, collections, variables and a separate design hash.
4. Read `oxygen-get-page` or create a draft with `oxygen-create-page` and `{title}`.

## Native elements and classes

The tree has `root: {id: 1, data: {type: "root", properties: {}}, children: []}`,
`_nextNodeId` greater than all IDs, and `status: "exported"`. Every node has an
integer ID, exact native type, properties object and children array. Containers
accept children; final elements do not. Limits are 2000 nodes and 50 levels.

Text is `properties.content.content.text`. A heading is an Oxygen Text element
with `properties.settings.advanced.tag: "h1"` (or another native tag). Read the
schema's htmlTag options. IDs for anchor links use `settings.advanced.id`.
Read the TextLink/Image schema for their content controls; do not guess their
property names from Elementor, Bricks or Breakdance.

On Oxygen 6.1.3, URL images need both `content.image.alt_when_from_url: "custom"`
and `content.image.alt: "custom"` for the renderer to output
`custom_alt_when_from_url`. This is an installed-renderer quirk; verify the
rendered alt attribute. TextLink uses `content.content.url` as a URL string.
Links have native final-link/container-link nesting rules; never nest links.
The Oxygen theme already supplies a main landmark, so use a div as the page's
outer container when that landmark is present.

Oxygen styles through classes. Create or replace one using `oxygen-save-class`
with `{name, properties, expected_hash}`; add `class_id` to update an existing
unlocked class. Apply returned IDs via `properties.meta.classes: ["class-id"]`.
The class properties use **breakpoint first**, unlike Breakdance controls:

```json
{
  "breakpoint_base": {
    "layout": {"display": "flex", "flex_direction": "column"},
    "typography": {"font_size": {"number": 64, "unit": "px", "style": "64px"}},
    "background": {"background_color": "#f5f1e9"}
  },
  "breakpoint_phone_portrait": {
    "typography": {"font_size": {"number": 40, "unit": "px", "style": "40px"}}
  }
}
```

Use only paths returned by `oxygen-get-style-schema`. Grid columns are
`layout.grid.simple_grid_template_columns`; spacing is
`spacing.spacing.padding.top` (and right/bottom/left). Gaps are
`layout.gap.row` and `layout.gap.column`. Units require matching number, unit,
and style. Use page-specific class names for a new design: editing an existing
class affects every element using it. The save replaces the class's entire
properties object; preserve other breakpoints when making a small change.

## Editing and verification

- `oxygen-set-page-tree` replaces the complete tree.
- `oxygen-add-element` allocates a childless node; pass type, properties,
  parent_id and optional position. Add children separately or use a whole tree.
- `oxygen-update-element` merges properties recursively; lists are replaced.
  Optional label sets `meta.friendlyName`.
- `oxygen-move-element` uses element_id, parent_id and optional position.
- `oxygen-remove-element` removes a node and its descendants.

Each page edit needs `post_id` and the latest **page** content_hash as
expected_hash. Class saves need the **design-system** content_hash. Never mix
them. Re-read after stale-edit or native-save errors. Page edits preserve native
template settings, use prior WordPress revisions and regenerate native caches.
Global class saves use Oxygen's global revisions and stylesheet generation.
Full builder access is required for writes; classes also require
edit_theme_options. Tools ship disabled for writes and honor admin toggles.

Build real elements, then inspect desktop, tablet and phone layout and the
native editor. Check semantic tags, image alt text, real link targets, text
controls, class values and breakpoint inheritance. Keep drafts unpublished
unless publication is requested. Preserve existing headers and global templates
when the task is limited to a page.

## Templates, headers, footers and components

Use `oxygen-list-templates` and `oxygen-get-page` to inspect native trees and
`template_settings`. `oxygen-get-template-schema` returns installed location
slugs. Create with `oxygen-create-template` and `{title, kind}`, where kind is
`template`, `header`, `footer` or `component`. Edit the returned post ID through
the ordinary page/element tools.

Oxygen forces library records to WordPress **publish** status. EMCP creates
new templates/headers/footers with native `disabled: true`; they do not replace
site output until explicitly enabled. Components render only where referenced.
Page copies remain drafts. Never describe library records as WordPress drafts.

`oxygen-update-template-settings` accepts `{post_id, expected_hash, settings}`.
Settings patch `type` (native location), integer `priority`, boolean `disabled`,
`ruleGroups` (OR groups of AND rules), and `parentId` (template inheritance).
Read the condition catalog and use `oxygen-get-condition-values` for selectable
values. Preserve the native operand and value shapes; conditions are not SQL.
Matching changes affect site output. Keep new templates disabled until their
location and conditions have been verified against the intended pages.

Create a component master, then expose a control using
`oxygen-define-component-property` with `post_id`, `expected_hash`, `element_id`,
`key`, `path`, `label` and optional `enabled`. Paths must be native control paths;
child visibility uses `settings.conditions.visible` when present in its schema.
Read `oxygen-get-component-properties` for exposed keys/defaults. Insert with
`oxygen-insert-component` and optional `overrides: {key: value}`. Masters stay
shared, nested references are supported, and cycles or forged targets fail.
Verify overrides in the native Component panel and on the frontend.

`oxygen-manage-document` supports rename, trash and restore with the current
hash. `oxygen-list-revisions` reads native tree revisions; `oxygen-restore-revision`
requires a revision belonging to that document. By default it preserves current
template settings. Use `restore_template_settings: true` only for revisions
created by EMCP template-setting writes; older native revisions lack that snapshot.

## Design Library

`oxygen-get-design-library` reports registered design sets and sharing/import
flags without fetching remote content or returning stored passwords.
`oxygen-copy-library-item` uses `{source_id, expected_hash, title}` to copy a
supported local page or library item to the same native type. Read the source
hash immediately before copying. Classes and component references remain shared;
this is not an isolated export with all dependencies duplicated. Template copies
start disabled, preserving their location and conditions.

`oxygen-configure-design-library` patches known sharing flags, registered `sets`
URLs and an optional password using the library `content_hash`. Returned URLs
omit query strings and passwords. `oxygen-browse-design-library` fetches a
registered `provider_index` through WordPress safe HTTP. Private/local providers
may be refused by that policy; do not disable the protection to force an import.

`oxygen-export-design-library` takes `post_ids`, includes component/template
references plus variables/selectors, and returns `bundle` and `bundle_hash`.
For a remote provider pass `provider_index`; list remote template/header/footer/
component IDs in `template_ids`. Review the bundle before importing: native
advanced trees can contain executable controls.

`oxygen-import-design-library` requires the bundle/hash, current `variables_hash`
and `selectors_hash` from get-design-state, and a unique `request_id`. It creates
new records, remaps dependencies/design IDs, namespaces class/variable names,
and keeps matching templates disabled. Replaying the request ID returns its
original result, including a partial failure; it does not create duplicates.
Inspect `post_map` and `design_revisions` to recover a partial import before
starting another request. Imports are not atomic. Remote media URLs stay remote.
Global CSS selectors require a separate explicit design save; imported bundles
must contain class selectors only. This transfers Oxygen designs, not a full
WordPress migration: custom fields, attachments, menus, homepage assignment and
WordPress post content are outside the bundle. Imported conditions referencing
other WordPress records need review before enabling template matching.

## Global design and advanced authoring

Read `oxygen-get-design-state` for one of `variables`, `selectors`, `settings`,
`preferences`. Save the complete `data` with `oxygen-save-design-state` and its
scope-specific hash, preserving unrelated records. It handles collections,
nested/pseudo selectors, native selector CSS, custom breakpoints/fonts and
preferences. Read `oxygen-get-global-schema` for native defaults/control mapping.
Oxygen core disables Breakdance global settings; only installed extensions may
supply those controls. Never invent settings merely because a scope exists.

These writes require `edit_theme_options` and `unfiltered_html`, affect all
usages, and retain complete prior documents including collections/preferences.
Use `oxygen-list-design-revisions` and `oxygen-restore-design-revision` with the
current hash for that revision's scope. Twenty complete snapshots are retained.

`oxygen-get-dynamic-schema` returns installed fields and interaction actions/
triggers. Use `oxygen-set-native-document` for a full native tree containing
loops, dynamic bindings, interactions, code and extension elements. It requires
`unfiltered_html` in addition to full builder access. Read exact native element
controls first. For example, PostsLoop references its component through
`content.repeated_block.global_block` and uses `content.query.query` for its
native query. Code runs with site privileges. The ordinary page/element tools
remain restricted; advanced editing must explicitly use the advanced tool.

Installed extensions must register their own elements and controls; EMCP does
not install extensions or author Element Studio plugin source. Unsupported native
nesting rules return an error. A schema's presence is not proof of end-to-end
behavior: verify the specific dynamic field, interaction or extension in the
native editor and frontend. Keep test-only changes scoped to the test site.

This self-contained guide is available through Agent Skills injection,
`get-skill` with slug `emcp-oxygen`, and both bundled download formats.

Maintained by EMCP from the installed Oxygen 6.1.3 APIs and renderer.
Official documentation: https://oxygenbuilder.com/documentation/.
Related public workflow: Respira Core's Build an Oxygen 6 Page by
Mihai Dragomirescu (https://www.respira.press/skills/build-oxygen6-page).
That workflow requires Respira tools; these instructions were independently
written for EMCP and do not bundle its skill text.
