---
name: emcp-kadence
description: Read and change Kadence theme settings through EMCP. Use for theme colors, typography, layout and header/footer settings when Kadence is active. Inspect the installed tool schema before writes and preserve unrelated page content and theme settings.
---

# Kadence theme settings

Theme settings remain in the Themes tab. For page content using Kadence Blocks, load `emcp-kadence-blocks`; that block plugin has its own independent toggle and tools tab and does not require this theme.

## Theme settings — `kadence-read` / `kadence-write`

`kadence-read { operation: "get-settings" }` returns a curated allowlist with a
`shape` hint per key, grouped: **palette** (`global_palette` — the 9 colors),
**colors** (`link_color`), **typography** (`base_font`, `heading_font`,
`h1_font`..`h6_font`), **layout** (`content_width`, `page_layout`), **buttons**
(`buttons_background`, `buttons_typography`, `buttons_border_radius`),
**header-footer** (`header_main_background`, `footer_wrap_background`). Filter with
`{ group }` or `{ keys: [...] }`.

`kadence-write { operation: "update-settings", arguments: { values: { key: value } } }`
writes theme_mods; non-allowlisted keys come back in `skipped[]`, and a value that
could not be printed safely into Kadence's CSS comes back in `rejected` with nothing
written (strings must be palette slugs, hex, `rgb()`, `rgba()`, `var(--name)`, plain
http(s) URLs or plain text without `; { } < > \ @ :` or parentheses). Values are
**structured objects** — read the `shape` from `get-settings` first (e.g.
`content_width` is `{ size:1140, unit:"px" }`; `buttons_background` is
`{ color:"palette1", hover:"palette2" }`; fonts are
`{ size:{desktop}, lineHeight:{desktop}, family, weight, color:"paletteN" }`).
Kadence renders its CSS inline per request, so writes take effect on the next
load — no cache to clear.

`global_palette` is the exception: Kadence keeps it in the `kadence_global_palette`
option, and the write goes there. Its shape is
`{ palette:[...], "second-palette":[...], "third-palette":[...], active:"palette" }`;
each palette lists 9 to 15 slots in order, `{ color, slug:"palette1".., name }`,
with hex, `rgb()` or `rgba()` colors (no `var()`). Send only the palettes you
change (and `active` to switch); the rest are kept. Slots 10 to 15 are Kadence's
complement, success, info, alert, warning and rating colors; send 9 and Kadence
adds its defaults for those.

