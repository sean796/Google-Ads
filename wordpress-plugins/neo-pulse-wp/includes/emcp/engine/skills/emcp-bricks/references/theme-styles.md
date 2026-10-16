# Theme Styles, Breakpoints & CSS Pipeline

Site-wide styling defaults and how settings become CSS. Verified against `includes/theme-styles.php`, `includes/breakpoints.php`, `includes/assets.php` (2.3.6).

## Breakpoints

Defaults (option `bricks_breakpoints` when customized):

| Key | Width | Media query |
|-----|-------|-------------|
| `desktop` | base (1279 builder width) | none — base styles |
| `tablet_portrait` | 991 | `max-width: 991px` |
| `mobile_landscape` | 767 | `max-width: 767px` |
| `mobile_portrait` | 478 | `max-width: 478px` |

- Desktop-first by default: bare key = desktop, suffixed keys cascade down.
- Custom breakpoints get their own keys; a site can switch to **mobile-first** (base = smallest, `min-width` queries) — check before authoring responsive JSON for an unfamiliar site.
- Settings-key grammar: `key:breakpoint:pseudo` (see style-settings.md).

## Theme styles

Option `bricks_theme_styles`. Shape:

```json
{
  "mystyle1": {
    "label": "Main",
    "settings": {
      "general": { "containerWidth": "1200px", "sectionVerticalPadding": "80px" },
      "colors": { "primary": { "hex": "#1d4ed8" }, "secondary": { "hex": "#0f172a" } },
      "typography": {
        "fontFamily": "Inter",
        "h1Typography": { "font-size": "3rem", "font-weight": "700", "line-height": "1.1" },
        "bodyTypography": { "font-size": "1rem", "line-height": "1.6", "color": { "hex": "#334155" } },
        "linkColor": { "hex": "#1d4ed8" }
      },
      "button": { "backgroundColor": { "hex": "#1d4ed8" }, "border": { "radius": { "top": "8px", "right": "8px", "bottom": "8px", "left": "8px" } } },
      "conditions": [ { "main": "any" } ]
    }
  }
}
```

Groups: `general` (container width, section padding, gaps), `colors` (primary/secondary/light/dark/muted/border/info/success/warning/danger — these feed `style: "primary"` on buttons/badges), `typography` (body, h1–h6, links, blockquote, code), `links`, `content`, `contextualSpacing`, `popup`, plus per-element groups (`section`, `container`, `block`, `button`, `heading`, `form`, `image`…).

Conditions use the same shape as template conditions (`{ "main": "any" }`, `postType`, `ids`…). Multiple styles can apply; specificity: site < post type < template < specific ids.

**Authoring rule:** lean on theme styles for site identity (type scale, container width, button colors) and keep generated layout JSON about *structure*. When the user asks for a full design system, deliver a theme-styles JSON snippet alongside layout JSON.

## CSS generation order (inline or file)

1. `:root` global variables
2. Theme styles (matching conditions)
3. Global classes
4. Color palette variables
5. Page settings CSS
6. Header / content / footer element CSS
7. Popup CSS
8. Global custom CSS (Settings → Custom code)

Later wins at equal specificity — element settings beat global classes, which beat theme styles. `_cssCustom` outputs verbatim where the element's CSS lands.

## CSS loading methods

Bricks Settings → Performance:
- **Inline** (default): per-page `<style>`.
- **External files**: generated under `wp-content/uploads/bricks/css/` (`post-{id}.min.css`, theme styles, global classes…). After programmatic content changes, run `wp bricks regenerate_assets`.

## Page-level CSS/JS

Postmeta `_bricks_page_settings`:

```json
{
  "customCss": ".hero { background-blend-mode: multiply; }",
  "customScriptsHeader": "<script>…</script>",
  "customScriptsBodyHeader": "",
  "customScriptsBodyFooter": "<script>…</script>"
}
```

## Custom fonts

- Google fonts: set `font-family` by name — Bricks enqueues automatically (mind GDPR setting that disables remote Google fonts).
- Custom fonts post type (`bricks_fonts`): upload woff2; then `font-family` is the custom font's name.
- Adobe fonts via project ID in settings.
- Variable axes: typography supports `font-variation-settings` as a property key.

## Performance defaults worth setting in generated sites

- Disable unused icon fonts (Settings → Performance) — prefer SVG icons.
- `loading: "lazy"` on below-fold images (default), `eager` + `fetchpriority` for LCP hero images (via `_attributes`).
- Element CSS files method for heavily cached sites; inline for small ones.
