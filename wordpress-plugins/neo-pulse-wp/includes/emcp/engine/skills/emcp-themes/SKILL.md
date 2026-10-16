---
name: emcp-themes
description: Discover and manage the active WordPress theme and its settings through EMCP theme tools. Use for theme colors, typography, layout, theme mods and child themes. Inspect the installed tool schema before writes and preserve unrelated page content and theme settings.
---

# Theme settings through EMCP

The Themes tab contains active-theme context and framework settings. Call
`theme-read` with `operation: get-theme-context` to identify the active theme.
Theme dispatchers accept `{operation, arguments}`; omitting `operation` lists
supported operations. Writes retain their own tool toggles and permissions.

- Astra: `astra-read` / `astra-write`; load `emcp-themes/astra`.
- Kadence: `kadence-read` / `kadence-write`; load `emcp-kadence`.
- GeneratePress: `generatepress-read` / `generatepress-write`; load `emcp-generatepress`.
- General theme mods: `theme-read` / `theme-write`. Inspect current values and
  supported shapes before changing them. Child-theme creation changes the active
  theme and requires the tool's explicit confirmation argument.

## Independent block integrations

Spectra, Kadence Blocks and GenerateBlocks each have a separate tools tab and
independent toggle under Page Builders → Gutenberg Block Plugins. They work
with Gutenberg and do not require their matching theme. Load `emcp-spectra`,
`emcp-kadence-blocks`, or `emcp-generateblocks` for page authoring. Multiple block
plugins may be enabled together alongside one standalone builder.

Keep page content changes in the relevant builder tools. Preserve theme-managed
headers and footers unless the user requests changes to those theme elements.
