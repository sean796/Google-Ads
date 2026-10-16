---
name: emcp-visual-composer
description: Build and inspect native Visual Composer Website Builder pages through EMCP, with paired element data and rendered HTML/CSS, staged publication, local template discovery and recovery. Use for Visual Composer 45.16, not WPBakery.
---

# Visual Composer Website Builder

Target the `visual-composer` integration. Gutenberg remains available alongside it. All tools use the `visual-composer-` prefix under `emcp-tools/`.

## Native save contract

Visual Composer 45.16.2 compiles its frontend in JavaScript. Its PHP save endpoint receives both the editor document and rendered HTML/CSS. Changing only `vcv-pageContent` will not update the public page.

1. Read `get-context`, `list-elements` and `get-element-schema` for the installed tags you need.
2. Read `get-page` or use `create-page` with a title. Creation is draft-only.
3. Build a flat `elements` object keyed by ID. Every element has matching `id`, an installed `tag`, `parent` (false at the root), integer sibling `order`, and the native attributes from the schema. Preserve unknown attributes on existing elements. Rows contain columns; content elements belong inside columns. Avoid linked/global, code and dynamic elements until their native behavior is verified.
4. `stage-document` requires the entire `elements` map, matching rendered `html`, page-local `css`, `post_id`, and current `expected_hash`. Every element must have its `el-ID` wrapper in the HTML. This is a paired-artifact API, not a server-side React renderer: callers must keep content and styling consistent in both representations. Use native wrappers and class names from the installed components. Do not represent an entire design as one raw HTML element.
5. Read back, validate the render, and call `publish-page` with the new hash and `confirm:true`. Staging is stored separately and does not appear in the native editor or on the public page until publication. Do not use the native editor to inspect an unpublished EMCP staging document.
6. Open the published document in the native editor and check its element tree. A native save recompiles the content; verify that it preserves the intended layout and styles.

Read `get-page-styles` for page CSS. The document save replaces the page's render artifacts, so include the full CSS required by the element graph. Existing compiled source CSS and assets are returned in `published`; do not rebuild an unfamiliar complex document with incomplete artifacts. Use the native editor when the matching render cannot be produced reliably.

## Library and recovery

`list-library` and `get-library-item` discover accessible installed local templates and optional header/footer/sidebar/layout/popup documents. `apply-template` stages a detached copy of a local custom `vcv_templates` document. It does not download Hub assets or modify global assignments. Optional types absent from `get-context` are not available on that site.

`list-revisions` returns up to ten EMCP snapshots. `restore-revision` restores to staging; publish explicitly afterward. `discard-draft` requires confirmation and retains the native published content. All mutations use the latest content hash and respect native page access, locks, and WordPress capabilities. Global CSS/settings are read-only through `get-design-settings`.

## Credit

Original EMCP integration guidance based on the installed Visual Composer APIs and the vendor's [developer documentation](https://dev.visualcomposer.com/), [services reference](https://dev.visualcomposer.com/public-api/services), and [open-source builder](https://github.com/VisualComposer/builder). Credit to Visual Composer and its contributors.
