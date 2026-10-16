---
name: emcp-themes/astra
description: Read and change Astra theme settings through EMCP. Use for theme colors, typography, layout and header/footer settings when Astra is active. Inspect the installed tool schema before writes and preserve unrelated page content and theme settings.
---

# Astra theme settings

Theme settings remain in the Themes tab. For page content using Spectra, load `emcp-spectra`; that block plugin has its own independent toggle and tools tab and does not require this theme.

## Astra settings & page layout

- `astra-read` → `get-settings` ({ `group`? colors/typography/layout/header-footer,
  `keys`? }) and `astra-write` → `update-settings` ({ `values` }) over a curated
  allowlist (theme_mods). Non-allowlisted keys are reported in `skipped[]`; values
  that fail Astra's own checks come back in `rejected` (key => reason) with nothing
  written: colors are hex, `rgb()`, `rgba()` or `var(--ast-global-color-N)`, font
  families a plain list (`"'Inter', sans-serif"`), `font-size-body` is
  `{ desktop, tablet, mobile, desktop-unit, tablet-unit, mobile-unit }` with numbers
  and px/em/rem/%, widths whole pixels, layouts their ids. After a
  settings write Astra's CSS cache is refreshed (`astra_clear_all_assets_cache()`).
- **Full-width landing layout** via `create-post` `meta` (non-underscore Astra keys,
  so they pass the meta filter): `site-content-layout=page-builder`,
  `ast-site-content-layout=page-builder`, `site-sidebar-layout=no-sidebar`,
  `site-post-title=disabled`. This keeps **Astra's header + footer**: do NOT set
  `ast-main-header-display`/`footer-sml-layout` unless you deliberately want them gone.
- `update-post` only *sets* the meta keys you pass; it does not clear previously-set
  ones, delete stale layout meta explicitly if you change your mind.
- **Transparent header overlaid on a hero** (nav sits over the hero image, no solid
  bar): set page meta `theme-transparent-header-meta:'enabled'` and give the hero enough
  top padding (~150–170px) so its content clears the header. This keeps Astra's own header
  (do not rebuild the nav). Do NOT also set `ast-main-header-display:'disabled'` (that hides
  the header entirely).
- **Images for backgrounds/cards**: `search-images` (Unsplash/Pexels/Pixabay, needs a
  provider key on the Connection tab) then `sideload-image` to get an `{id,url}` for a native
  container background image. These two are core WP tools now (available without Elementor).

