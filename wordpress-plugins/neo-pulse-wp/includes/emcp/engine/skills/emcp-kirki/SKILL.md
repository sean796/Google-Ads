---
name: emcp-kirki
description: Build and edit native Kirki 6 canvas pages through EMCP, with responsive styles, staged versions and local library discovery. Use for the Kirki visual builder formerly called Droip, including page graph edits, publication, version restoration, design tokens and CMS field discovery.
---

# Kirki 6 through EMCP

Read `kirki-get-context` first: it reports the site, installed version and supported scope. Select Kirki in Page Builders and enable the required write tools. Gutenberg and its block packs can coexist.

## Native graph and styles

- Read `kirki-get-element-schema` for verified starters. Supply a unique string `id` and matching `parentId`.
- `blocks` is a flat object keyed by element ID. The `root` node has `name: root`; its ordered `children` list references other IDs. Preserve parent links, inline content references and unknown native properties.
- Text lives in `properties.contents`, usually an array of strings. Use native headings, paragraphs, buttons, images and layout nodes; do not wrap an entire page in custom HTML.
- Text leaves omit `children`; an empty children list suppresses their frontend text. Buttons are containers with a child `text` node and `properties.type: href`; put the label on that child and the URL in the button's `properties.attributes.href`.
- `styles` is a map of `{id, type: class, name, variant: {md: "CSS declarations", tablet: "...", mobile: "..."}}`. Use `styleIds` on elements. Read the installed viewports through `kirki-get-design-system` before adding responsive variants. `md` is the base desktop variant.
- `set-page-content` replaces the graph, preserving styles when omitted. `set-page-styles` replaces local styles. `update-element` merges top-level properties; a nested value replaces that nested object, so read and preserve its other keys.
- The adapter validates references, reachability and nesting. Native advanced properties require WordPress `unfiltered_html` and Kirki full access. Starter discovery is a verified subset, not a catalog of every Kirki feature.

## Save, verify and publish

1. Create a draft with `kirki-create-page` or read an existing Kirki page with `kirki-get-page`.
2. Pass its latest `content_hash` as `expected_hash` to each mutation. Use the returned hash for the next call; reread after native-editor changes.
3. Saves go to an unpublished native stage and preserve WordPress status. Inspect readback and the native editor before publishing.
4. `kirki-publish-page` makes the staged content and page public. Use it when publication is authorized.
5. `kirki-restore-version` creates an unpublished stage from a version returned by `get-page`. It does not publish the restoration.
6. Verify desktop/mobile layout and do a native-editor Save round trip. Check that text, hierarchy, styles and links survive.

`set-page-canvas` chooses Kirki's full-canvas template. That native template can still include the active theme's header and footer; do not assume it is a blank shell. Any page-specific adjustment should stay scoped to that page.

## Discovery boundaries

`list-library` and `get-library-item` expose local templates, utility pages, popups and symbols, including header/footer components. Symbols have their own `data/root/styleBlocks` envelope; do not pass it as a page graph. Shared component editing and global template assignments are not supported by this adapter.

Design-system discovery returns classes, variables, fonts and breakpoints. CMS tools discover collections and fields. Global design writes, CMS mutations, marketplace imports, collaboration, app installation and form submission are outside the current tools. Customizer theme controls remain theme territory.

## Provenance

Original EMCP integration guide, based on the installed Kirki 6.3.1 source contracts and [Kirki releases](https://kirki.com/releases/). Kirki/Droip are products of their respective authors; this guide is not an official Kirki skill.
