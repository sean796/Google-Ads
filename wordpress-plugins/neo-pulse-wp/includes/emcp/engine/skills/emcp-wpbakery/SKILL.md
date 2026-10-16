---
name: emcp-wpbakery
description: Build and edit native WPBakery Page Builder pages through EMCP, using installed element schemas, shortcodes, page CSS, local templates and recovery snapshots. Use for WPBakery landing pages, responsive layouts, editor roundtrips and safe changes to existing native shortcode content.
---

# WPBakery Page Builder

Use for WPBakery 9.0.1–9.0.x. This is a separate product from Visual Composer.
Start with `wpbakery-get-context`, `wpbakery-list-elements` and the relevant `wpbakery-get-element-schema` tools. Tool names have the `emcp-tools/` prefix when dispatched through `emcp-tools-call-tool`.

## Workflow

1. Confirm the site and selected integration. Create test pages only on the designated test site through MCP.
2. Read schemas before authoring; use installed values and defaults, especially links, widths, responsive offsets and CSS editor parameters.
3. Create a draft with `wpbakery-create-page`. Read existing pages before editing.
4. Save native shortcodes using `wpbakery-set-page-content`. Every write needs the latest `content_hash` as `expected_hash`. Re-read after every successful edit; a stale hash is a conflict, not permission to retry blindly.
5. Use `wpbakery-replace-fragment` for small changes. The find string must occur exactly once; the full result is validated. Use an empty replacement to remove a complete element or row.
6. Save page-local CSS with `wpbakery-set-page-styles`. Existing status is preserved, so editing an already published page updates its live content immediately. New pages stay drafts until `wpbakery-publish-page`.
7. Check rendered desktop/mobile output and open the native editor. Save in the editor and read back over MCP to verify compatibility.

## Native shortcodes and styles

Layouts live in WordPress post_content, not an HTML widget or a separate JSON tree.

```text
[vc_row el_class="studio-hero"][vc_column width="1/1"][vc_custom_heading text="Build something lasting." font_container="tag:h1|text_align:left" use_theme_fonts="yes"][vc_column_text]<p>Thoughtful spaces for everyday life.</p>[/vc_column_text][vc_btn title="Explore our work" link="url:%23work|title:Explore%20our%20work"][/vc_column][/vc_row]
```

Rows contain columns. A column can contain inner rows, which contain inner columns. Text HTML belongs inside `vc_column_text`. The native text editor may remove unstyled spans; use separate classed paragraphs for text that needs independent typography and check the result after a native Save. Rows, columns, inner variants and text require closing tags. Other supported elements use native single opening shortcodes. Literal square brackets in text must be HTML entities. Do not nest unknown shortcodes in text.

Authoring supports the types reported in context. All permitted installed element schemas can be discovered; advanced and addon elements outside the verified subset remain readable. Never replace an existing unsupported layout without preserving its native content and explicit user intent.

Use native attributes for layout, responsive column widths/offsets, buttons, headings, images, icons and CSS editor controls. Native `css` attributes generate element CSS on save. Page CSS is stored in `_wpb_post_custom_css`; scope it to page element classes. Use media queries for typography and spacing, and check horizontal overflow. Do not write global theme CSS for a page-specific change.

## Templates and recovery

`list-templates` and `get-template` expose installed user/default templates. Inspect `editable` before applying. Template application replaces page content and preserves page CSS; unsupported templates are rejected. Remote downloads, saved-template creation/deletion, Grid Builder editing and global settings writes are outside this adapter.

The last ten EMCP writes retain native content plus page CSS in recovery snapshots. Use `list-revisions` then `restore-revision` with the current hash. These are EMCP snapshots, not the full WordPress revision history. Recovery preserves the current publication status.

Permissions honor WordPress page ownership/capabilities and WPBakery editor, element and template restrictions. Writes additionally require native and WordPress unfiltered HTML permission. Do not bypass disabled tools or role restrictions.

## Sources and credit

Implementation and guidance use WPBakery's installed native APIs and [official developer documentation](https://kb.wpbakery.com/devs/category/element-development/), including [nested elements](https://kb.wpbakery.com/devs/element-development/nested-content-elements/) and [parameter types](https://kb.wpbakery.com/devs/element-development/parameter-types/). WPBakery is the original author of the builder and documentation. This EMCP adapter skill is original project documentation; no external skill was copied.
