---
name: emcp-thrive
description: Build and edit native Thrive Architect pages through EMCP's standalone Thrive integration. Use when Thrive Architect is selected and emcp-tools/thrive tools are available, including native element discovery, HTML and responsive CSS editing, page reads, and local library discovery.
---

# Thrive Architect through EMCP

Start with `thrive-get-context` to verify the target site and version. The
adapter is checked against Architect 11.0.x. Thrive Theme Builder is a separate
product; do not assume it is covered by Architect tools.

## Discover before authoring

Use `thrive-list-elements` and `thrive-get-element-schema`. The native registry
contains internal and advanced elements as well as authorable ones. Inspect
`authoring_supported`, `available`, `identifier`, `controls`, and `starter_html`.
Preserve native classes and structural children. Do not replace a native page
with an HTML-code element or invent classes based on another builder.

Basic native patterns include:

- Text: `div.thrv_wrapper.thrv_text_element` containing paragraphs or headings.
- Section: `div.thrv_wrapper.thrv-page-section` containing
  `.tve-page-section-out` and `.tve-page-section-in`; insert children into the
  inner container, not the background layer.
- Content box: `.thrv-content-box` with a background and `.tve-cb` content area.
- Button: `.thrv-button` containing `.tcb-button-link`, `.tcb-button-texts`,
  and `.tcb-button-text`. Read the installed starter for current classes/palette.
- Image: inspect the native image schema and supply descriptive alt text; reuse
  existing Media Library images before uploading duplicates.

### Tested layout recipes

Columns use `.thrv_wrapper.thrv-columns > .tcb-flex-row > .tcb-flex-col >
.tcb-col`. Put content inside `.tcb-col`, with a unique key on each editable
wrapper and inner container. Empty column schemas may have no starter HTML.
A populated image uses `.thrv_wrapper.tve_image_caption > .tve_image_frame >
img.tve_image`; give the image a Media Library URL, dimensions and alt text.
Do not submit the image schema's empty SVG placeholder to the content tool.

Use explicit row wrapping and column widths at your responsive breakpoints.
Thrive's native responsive defaults can also stack columns at tablet sizes;
check its actual preview. Section-specific background/padding rules must match
the specificity of the base section selector, for example
`[data-css="my-section"].thrv-page-section`. Otherwise the base rule can win.
Style the `.tve-page-section-out` layer when the native section has its own
background configuration. Check computed styles as well as the editor canvas.

## Read, change, save

Create drafts with `thrive-create-page`. `thrive-get-page` returns native HTML,
`inline_css`, `custom_css`, page settings, stable element keys and `content_hash`.
Elements are addressed as `data-css:some-key` or `id:some-id`. Give new editable
wrappers unique simple `data-css` values. Use `root` only as an insertion parent.

Use `thrive-add-element`, `thrive-replace-element`, `thrive-move-element`, and
`thrive-remove-element` for focused changes. Replacement requires one outer
element and includes its descendants: copy the current fragment and preserve
children you are not changing. Moves append to the selected container.

`thrive-set-page-content` accepts full native HTML and optional `inline_css` /
`custom_css`. Omitted CSS is preserved. Styles can target native `data-css`
selectors and use media queries for responsive layouts. Keep page styles scoped
to those selectors. The adapter rejects imports, CSS URLs/escapes, scripts,
shortcodes, form actions, event payloads and unsupported markup. An `edit_error`
means the existing layout is readable but cannot safely be rewritten here.

Every save requires the latest hash. Carry forward each response's hash and
keys; stop and re-read on stale content or ambiguous failures. Prefer targeted
edits over repeatedly sending a large page. Never fall back to raw meta writes.

The adapter uses Thrive's canonical save pipeline, preserving omitted globals,
template selection, feature flags, and header/footer references. Native revisions
and bounded per-page recovery snapshots support review. Page status is preserved.
The current tools discover shared library items but do not edit shared symbols,
change landing templates, or configure forms, payments, scripts, or Theme Builder.

## Verify in the actual builder

Read the saved page through MCP and inspect both frontend and native Architect.
Check that text remains editable, wrappers are recognized, images load, links
resolve, and columns stack on desktop/tablet/phone. Native editor selection and
computed frontend styles are stronger evidence than an HTTP-success response.
Reload an open editor after MCP saves before interacting with its saved state.
Open the returned `editor_url`: Architect's main UI uses the WordPress admin
`action=architect` route. Adding `tve=true` to a frontend URL alone does not open
the full editor. Text selection should show the native Text breadcrumb and
formatting toolbar; image selection should show Replace image and Alt text.
Use the user's designated test site for test pages; never infer permission to
create test content on a development or production site instead.

## Sources

Independently written EMCP integration guidance, based on the installed Thrive
Architect 11.0.0.1 element templates and save controller, plus
[Thrive Themes' official REST API documentation](https://thrivethemes.com/docs/accessing-and-updating-thrive-architect-content-through-the-wordpress-rest-api/).
