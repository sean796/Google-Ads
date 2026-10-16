---
name: emcp-generatepress
description: Read and change GeneratePress theme settings through EMCP. Use for theme colors, typography, layout and header/footer settings when GeneratePress is active. Inspect the installed tool schema before writes and preserve unrelated page content and theme settings.
---

# GeneratePress theme settings

Theme settings remain in the Themes tab. For page content using GenerateBlocks, load `emcp-generateblocks`; that block plugin has its own independent toggle and tools tab and does not require this theme.

## Theme settings — `generatepress-read` / `generatepress-write`

`generatepress-read { operation:"get-settings" }` returns a curated allowlist with
a `shape` hint, grouped: **palette** (`global_colors` — array of {name,slug,color}),
**colors** (`background_color`, `text_color`, `link_color`, `link_color_hover` —
values reference the palette as `var(--slug)`, e.g. `var(--accent)`), **layout**
(`container_width`, `content_layout_setting`, `container_alignment`), **typography**
(`body_font_size`). Filter with `{ group }` or `{ keys:[...] }`.

`generatepress-write { operation:"update-settings", arguments:{ values:{ key:value } } }`
writes the `generate_settings` option; non-allowlisted keys come back in
`skipped[]`. Each value is checked the way GeneratePress's Customizer checks it,
and a refused one comes back in `rejected` (key => reason) with nothing written:
colors are `""` (reset), `#fff` / `#ffffff`, `rgb()`, `rgba()` or a palette var
(`"var(--accent)"`); `content_layout_setting` is `separate-containers` or
`one-container`; `container_alignment` is `boxes` or `text`; numbers are whole
pixels; palette slugs use a-z, 0-9 and hyphens. GeneratePress caches its generated
CSS; the write clears that cache so changes take effect on the next load.

`body_font_size` follows GeneratePress's typography mode: with dynamic typography
(the default since GeneratePress 3.1) it sets the body rule of the `typography`
list in px, keeping that rule's font family and other fields; sites upgraded from
older versions without dynamic typography get the legacy setting. It reads `null`
when no body size is set (the theme default applies).

