---
name: emcp-beaver
description: Build and edit native Beaver Builder pages through EMCP using module schemas, row and column node maps, draft staging, responsive styles, local templates and recovery snapshots. Use for Beaver landing pages, individual module edits and native editor publication checks.
---

# Beaver Builder through EMCP

Start with `beaver-get-context`. Tool names use `emcp-tools/` when dispatched through `emcp-tools-call-tool`. The adapter targets Beaver Builder 2.11.1–2.11.x and reports optional Beaver Themer availability separately. Test pages belong on the designated test site and must be created and edited through MCP.

## Draft and publication workflow

1. Discover installed modules with `list-modules`. Read `get-module-schema` and `get-node-schema` before choosing setting names. The editable flag distinguishes verified authoring modules from discovery-only modules.
2. Create a draft with `create-page`, or read an existing page with `get-page`.
3. Use `set-page-layout` for a native node map, or `add-node`, `update-node`, `move-node`, `remove-node` for focused edits. Every mutation needs the latest `content_hash` as `expected_hash`. Read again after each change or conflict.
4. `set-page-styles` stages page CSS, preserving other layout settings. Edits remain in the native draft; published data and WordPress status must stay unchanged.
5. Call `publish-page` explicitly when ready. It copies the native draft to published data, creates fallback editor content, regenerates Beaver assets and publishes the WordPress page.
6. Open the native editor and verify its Done/Publish cycle. Inspect the public page at desktop and mobile widths and read back through MCP.

## Native nodes and settings

Beaver uses a flat ID-keyed map. Every node has `node`, `type`, `parent`, `position`, and `settings`. Native hierarchy:

```text
row (parent null)
  column-group (settings empty string)
    column (settings.size is a percentage)
      module (settings.type is the registered module slug)
```

Columns may also hold a nested column-group. Module containers such as Box and Themer/shared/dynamic node references are outside the verified writer. Never remove an unsupported node just to make validation pass.

IDs must match their keys and contain only letters, digits, underscores or hyphens. Positions are nonnegative integers, unique among siblings. A move needs an unused target position; replacing the full node map is useful when reordering multiple siblings together. Removing a node removes all descendants.

`update-node` merges top-level setting names; a nested typography, border or repeater value replaces that whole setting. Preserve keys by reading before editing. Native defaults are merged on save. Typography structures remain arrays; native repeater forms are converted using Beaver's own defaults API. Do not serialize the whole settings tree into PHP objects yourself.

Use native responsive fields from schemas, commonly `_medium` and `_responsive` variants, plus native row/column spacing controls. Prefer heading, rich-text, button and photo modules to one large HTML module. For photos use a valid existing attachment ID and native photo settings; the native module update caches attachment details. If `photo_src` is missing, EMCP resolves it from the attachment and requested size; when changing an existing photo, clear or update `photo_src` too. Scope page CSS to page/node classes. CSS child selectors are allowed; HTML style tags are rejected.

## Library and recovery

`list-library` discovers saved layouts, rows, columns, modules and optional Themer documents. `get-library-item` requires document access and theme-editing permission. `save-template` creates a local non-global full-layout template from the current draft, with native new node IDs. It does not publish the source page. `apply-template` supports accessible local, non-global full-layout templates and stages a detached copy. Shared references, global components, Themer assignments and remote library imports are not writable.

The last ten EMCP writes retain the previous draft node map and layout settings. `list-revisions` returns these snapshots. `restore-revision` restores to the draft; publishing is a separate action. These snapshots are not the entire native WordPress revision history.

`get-design-system` exposes selected layout defaults and breakpoints read-only. Global CSS, service accounts and theme settings are not page settings and should not be altered as a side effect of building a page.

Writes require WordPress `unfiltered_html`, page capability checks, native builder access and unrestricted editing. Respect disabled modules and integration toggles.

## Sources and credit

Original EMCP integration guidance based on Beaver Builder's installed native APIs and [official data storage documentation](https://docs.wpbeaverbuilder.com/beaver-builder/developer/how-to-tips/data-storage/), [field reference](https://docs.wpbeaverbuilder.com/beaver-builder/developer/custom-modules/setting-fields-reference/) and [layout settings](https://docs.wpbeaverbuilder.com/beaver-builder/user-interface/layout-settings/). Credit to the Beaver Builder team for the builder and documentation; no external skill copied.
