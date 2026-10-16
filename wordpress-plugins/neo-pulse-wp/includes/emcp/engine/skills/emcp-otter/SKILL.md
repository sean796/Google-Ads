---
name: emcp-otter
description: Build and edit native Otter Blocks Free and Pro pages through EMCP. Covers discovery, Gutenberg markup, local patterns, responsive CSS, visibility and Pro block structure. Otter is an independent Gutenberg pack, not a theme or exclusive standalone builder.
---

# Otter Blocks

## Discovery

Use `otter-get-context`, `otter-list-blocks`, `otter-get-block-schema` and `otter-get-features` before authoring. The installed registry is authoritative: Free, Pro, disabled modules and WooCommerce dependencies change what is available. Verified with Free and Pro 3.2.5. The EMCP integration requires Neo EMCP; Otter Pro itself is optional.

Otter lives alongside Gutenberg and other independently enabled block packs. Do not switch the active theme or standalone builder. Tool writes are disabled by default; respect the administrator's enabled tools.

## Native save contract

Otter static blocks save BOTH Gutenberg comment attributes and native HTML. Attributes alone produce missing or invalid content. The write tools take complete serialized markup, including children. Read an existing page, `otter-get-pattern`, or the schema's `example_markup` before editing. Do not wrap the page in a Custom HTML block.

- Classic names use `themeisle-blocks/`, not `otter/`.
- A Section is `advanced-columns`; its children are `advanced-column`. Preserve the overlay and `innerblocks-wrap` containers plus the responsive layout classes.
- Advanced Heading stores rich text in its HTML, not just a comment attribute. Its wrapper has the native block class AND its ID as a class. Native `fontSize`, `fontSizeTablet`, and `fontSizeMobile` attributes drive generated styles.
- Pro Business Hours wraps `business-hours-item` children in `otter-business-hour__container` and `otter-business-hour__content`. Labels and times live in their own native span wrappers. The schema tool returns a complete example.
- Accordion Item is a native `details` element, with `summary` and a content wrapper. Preserve the parent Accordion and `data-has-schema`. Test actual open/close behavior.
- Generate unique IDs for new blocks. Replace references in attributes, HTML and custom CSS together. Do not duplicate example IDs within one page.
- `atomic-wind/*` is Otter's experimental block family. It has a separate browser-generated utility CSS cache. The classic PHP style rebuild does not compile Atomic Wind classes; verify these in the native editor and frontend before relying on them.

## Editing sequence

1. `otter-create-page` creates a draft. Read its result or `otter-get-post-blocks` for the current `content_hash` and zero-based paths.
2. Use `otter-add-block`, `otter-update-block`, `otter-move-block` or `otter-remove-block`. Supply `expected_hash` from the latest read. Update replaces one complete Otter block, including its children.
3. For a complete page, use `otter-set-page-blocks` with `confirm:true`. Include native Otter blocks and preserve any core blocks deliberately retained. Published pages change immediately; there is no separate staging layer.
4. Each write regenerates classic Otter CSS through the native compiler. Read `otter-get-page-styles`; `otter-rebuild-page-styles` repairs generated styles without changing content.
5. Open Gutenberg and check for invalid-block/recovery notices, then save and inspect the frontend again. PHP schema validation cannot prove JavaScript save-markup validity. Check responsive layouts, images, heading order, links and interactions.
6. Publish a reviewed draft with `otter-publish-page`, the latest hash and `confirm:true`.

Writes require edit access to the target and `unfiltered_html`. Publication needs the native publish capability. Content/status changes make old hashes stale; reread rather than repeatedly retrying an old payload. Locks prevent concurrent EMCP block saves. WordPress revisions remain available in the native editor.

## Patterns, styles and features

`otter-list-patterns` / `otter-get-pattern` discover locally registered native patterns, including Pro patterns when registered by the vendor. `otter-insert-pattern` regenerates Otter IDs and compiles styles. It does not download remote images or fetch the cloud library. Inspect content and dependency availability first. Adapt vendor examples to the user's design preferences.

Per-block custom CSS uses `hasCustomCSS:true` and `customCSS`, as returned by the live schema. Use page/block selectors and avoid changing unrelated pages. Typography, spacing, responsive sizes and colors belong in native attributes when possible.

Visibility uses `otterConditions`: an array of rule-group arrays. Rules within a group use AND; groups use OR. Example for logged-out visitors: `[[{"type":"loggedOutUser"}]]`. Pro adds conditions such as cookies, query strings and time ranges. Verify the installed native rule format and public output; do not infer that a frontend-only condition also hides content in the editor.

Dynamic text, links, images, sticky controls and animations are part of native saved block markup/attributes. Preserve their exact native representation in whole-block updates. Do not invent field names. Form blocks can be authored through their schemas; these tools do not expose submission records, credentials, payment execution or form-provider account management. WooCommerce blocks require the correct product context; template assignment is outside this adapter.

`otter-get-settings` / `otter-update-settings` cover a boolean allowlist of feature switches and require `manage_options`. Use the returned `settings_hash` as `expected_hash`. Changed module switches take effect on the next request. Avoid disabling features that existing pages need.

## Attribution

Original EMCP integration guidance, based on the installed Otter source and documentation by **ThemeIsle**, creators of Otter Blocks. Vendor source is not bundled in this skill.

- [Otter documentation](https://docs.themeisle.com/otter-page-builder-blocks-extensions/)
- [Otter Pro documentation](https://docs.themeisle.com/otter-page-builder-blocks-extensions/otter-pro-documentation)
- [Otter Blocks source](https://github.com/Codeinwp/otter-blocks)
