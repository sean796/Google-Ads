---
name: emcp-blocksy
description: Use EMCP to edit Blocksy Gutenberg blocks, manage Companion Pro Content Blocks and extensions, and inspect or update Blocksy theme layout settings. Routes theme, block editor and Companion tasks to their separate integrations.
---

# Blocksy through EMCP

Verified against Blocksy theme and Companion Pro 2.1.57. Blocksy Blocks is an independently toggled Gutenberg extension, alongside the selected standalone page builder. Native Blocksy theme and Companion availability still determine whether its blocks register.

## Choose the correct tools

- **Blocksy Blocks tab:** `blocksy-blocks-get-context`, `list-blocks`, `get-block-schema`, `get-post-blocks`, `add-block`, `update-block`, `move-block`, `remove-block`. Names after the first share the `blocksy-blocks-` prefix. Existing `blocksy-blocks-read/write` dispatchers remain compatible.
- **Themes tab:** `blocksy-theme-read/write`. Read operations: `get-context`, `get-settings`, `get-design-settings`. `update-settings` accepts bounded native layout sliders and the latest `settings_hash` as `expected_hash`. Saved palette, typography, responsive spacing and header/footer placements are read-only; null indicates native defaults rather than an explicit override.
- **Plugins tab, Companion:** `blocksy-extensions-read/write` for extension discovery and activation; `blocksy-content-read/write` for Pro Content Blocks.

Dispatcher input is `{operation, arguments}`. Call a dispatcher without an operation to discover its operation catalog. Tool names use `emcp-tools/` when invoked through `emcp-tools-call-tool`.

## Gutenberg block workflow

Read the schema and the full mixed page tree before editing. Every individual block mutation takes `post_id` and the latest `content_hash` as `expected_hash`. Read again after each save. Preserve other plugins' and core blocks.

`add-block` takes `block`, optional `attributes`, and `position`. Query and taxonomy-query blocks get a unique ID and a native `post-template` or `tax-template` child. Populate that child with content; a scaffold alone is not a finished loop design. `update-block` replaces a whole block with serialized Gutenberg markup, including its children.

The catalog includes the Pro `content-block` embed. Its native renderer expects `content_block` with an accessible `ct_content_block` post ID, although that field is absent from the server registry in 2.1.57. The editor requires saved inner markup <div>Blocksy: Content Block Filter</div> between opening and closing block comments, even though rendering is dynamic. A self-closing block renders on the front end but fails editor validation. The referenced document must be published and enabled to render. Discovery exposes registered attributes and defaults. Some Blocksy fields are registered only in the JavaScript editor; inspect native editor markup for those rather than inventing server schemas. Core style support is present on several blocks, so do not assume all blocks have no styling controls.

## Companion Pro Content Blocks

`blocksy-content-read` discovers types, supported conditions, hooks and documents. Types: hook, header, footer, single, archive, 404, nothing_found, popup, maintenance. Native content is a `ct_content_block` post; type is `template_type` metadata; settings live in `blocksy_post_meta_options`.

1. `create-content-block` with `title` and `template_type` creates a **disabled draft** with no display conditions.
2. Build content with Gutenberg or Blocksy Blocks tools, or `update-content-block` with serialized `content`. Read back its current hash after any content tool save.
3. `update-content-block` accepts `post_id`, `expected_hash`, optional `title`, `content`, and a settings patch. Supported settings: `is_hook_enabled` (`yes`/`no`), `conditions`, and hook-only `location`/`priority` (1 through 100). Other saved native settings are preserved.
4. Conditions are a list of `{type: include|exclude, rule, payload: []}`. Supported rules: everywhere, singulars, archives, 404, search, blog, front_page. Advanced conditions and popup-specific controls remain native-editor tasks.
5. Review display impact, enable deliberately, then `publish-content-block` with current hash and `confirm:true`. Publication does not automatically enable a disabled block.
6. To edit through these Companion tools after publication, first use `unpublish-content-block` with current hash and `confirm:true`. This takes the template out of service until republished. Gutenberg tools have their ordinary immediate-save behavior, so explicitly unpublish before using those on a live template as well.

Writes respect native CPT capabilities, edit permission, unfiltered HTML, locks and stale hashes. No PHP/code mode or arbitrary metadata writes. Maintenance and replacement header/footer templates affect the site when activated; do not publish as a side effect of creating a draft.

## Extensions

`list-extensions` reports available extensions and active state. `activate-extension` / `deactivate-extension` take `slug` and use the native manager and its capability gate. Pro features remain subject to native Blocksy availability/licensing. Discovery and toggles do not imply support for every extension's internal configuration, account credentials, fonts upload or remote starter-site imports.

## Credit

Original EMCP guidance based on the installed APIs and CreativeThemes' [Blocksy documentation](https://creativethemes.com/blocksy/docs/), including [header templates](https://creativethemes.com/blocksy/docs/modules/content-blocks-header-template/) and [footer templates](https://creativethemes.com/blocksy/docs/modules/content-blocks-footer-template/). Credit to CreativeThemes for Blocksy and its documentation.
