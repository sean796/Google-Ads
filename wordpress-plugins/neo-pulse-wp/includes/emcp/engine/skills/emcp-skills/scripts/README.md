# Scripts, declarative Elementor page builder

A four-file pipeline for converting an HTML/CSS design into a live Elementor page on a WP + Elementor + Elementor MCP site, without round-tripping the full Elementor JSON through the agent's context.

```
templates/<slug>.mjs   →  build.mjs  →  output/<slug>.json  →  ship.mjs  →  live page
   ↑                                                              ↓
   you author this                                                POSTs to your site
   (uses widgets.mjs + css.mjs helpers)                           via build-page REST ability
```

## Files

| File | What it does |
|---|---|
| **`widgets.mjs`** | Factory helpers that emit Elementor `{type, widget_type, settings}` shapes, `container`, `heading`, `textEditor`, `button`, `image`, `iconList`, `iconBox`, `counter`, `form`, `googleMaps`, `starRating`, `html`, `box`, plus typography/advanced helpers. Use these so you don't hand-write the verbose Elementor settings JSON. |
| **`css.mjs`** | `generateMasterCSS({ theme, extra })` builds the singular bottom-of-page `<style>` block: Google Fonts `@import`, `:root` variable declarations from `theme.colors`, a minimal baseline (`.<prefix>-wrap`, `.<prefix>-kicker`), and your template-specific `extra` rules. Includes a `FONT_AXIS` map for fonts with non-default weight axes. |
| **`build.mjs`** | CLI runner. Reads `templates/<slug>.mjs`, writes `output/<slug>.json`. Pure local, no network. Run via `node build.mjs <slug>`. |
| **`ship.mjs`** | CLI runner. POSTs `output/<slug>.json` to the live site's `build-page` REST ability. Reads auth from `.mcp.json` so it just works once your MCP transport is wired up. Run via `node ship.mjs <slug>` or `node ship.mjs <slug> --regen` to rebuild first. |
| **`templates/example.mjs`** | A representative landing page, header, hero, 3-up feature grid, animated stats strip, CTA slab, 3-col footer + a singular bottom `<style>` widget. Use it as a starting point. |

## Quick start

```bash
# 1. Author a template config, copy templates/example.mjs and edit.
cp templates/example.mjs templates/my-page.mjs

# 2. Build → output/my-page.json
node build.mjs my-page

# 3. Ship to the live site (uses .mcp.json auth)
node ship.mjs my-page
```

`ship.mjs` returns `{ post_id, elements_created, edit_url, preview_url }`. Open `preview_url` to see the live page.

## Where it looks for `.mcp.json`

`ship.mjs` walks up from the script's directory to find the project root that holds `.mcp.json`. The default assumption is two levels up. If your layout differs, set either:

```bash
EMCP_PROJECT_ROOT=/path/to/wp-project node ship.mjs my-page
# or, more directly:
EMCP_MCP_JSON=/path/to/.mcp.json node ship.mjs my-page
```

The script reads `mcpServers["emcp-tools"].url` (to derive the abilities endpoint) and `.headers.Authorization` (to authenticate the POST). That's the same config the MCP HTTP client uses.

## Why a pipeline (instead of one-shot MCP calls)

For a single section, calling `add-container` + `add-free-widget` (e.g. `widget_type: "heading"`) + `update-element` etc. through the MCP is fine.

For a full page (10-15 sections, 200+ widgets), four problems show up:
1. **Token cost**: every widget's settings JSON round-trips through the agent's context on every call.
2. **Iteration cost**: re-running a section means re-issuing 20+ MCP calls.
3. **Reusability**: there's no source-of-truth to copy a working pattern into the next page.
4. **`build-page` payload size**: sending the JSON inline through an MCP tool also pays token cost.

This pipeline:
- Authors the page as JavaScript that's easy to read, diff, and copy patterns from
- Builds the JSON once on disk
- Ships via direct REST `fetch`, bytes go straight from your filesystem to the WordPress server, never through the agent's context window

You still use the MCP tools for iteration, `update-element`, `get-element-settings`, `get-page-structure`, `add-custom-css`, once the page exists. The pipeline replaces the initial bulk-create.

## Output directory

`build.mjs` writes to `./output/<slug>.json`. Gitignore that directory if you commit the rest of this folder, the JSON is derived and large.

```gitignore
scripts/output/
```

## Common template-config patterns

See `templates/example.mjs` for end-to-end shape. A few patterns worth knowing:

- **Theme tokens.** Declare colors + fonts in `const theme = { prefix, colors, fonts }`. The prefix is your page-scoped class namespace (`ex`, `cf`, `hp`, 2-4 chars). `generateMasterCSS` will emit `:root { --<prefix>-<token>: <value>; }` and a Google Fonts `@import`.
- **One singular `<style>` HTML widget at the bottom of the page.** Drop your `extra` CSS rules in a template string and pass to `generateMasterCSS`. Everything else uses widget controls, zero `style=""` attributes inline.
- **Reusable component functions.** Define `featureCard({ iconSvg, h3, desc })` once, call 3× for a feature grid. Same pattern for `tier(...)`, `review(...)`, `caseCard(...)`, etc.
- **Counter widget needs explicit `title: ''`**: otherwise Elementor renders "Cool Number" placeholder. See SKILL.md for the full gotcha.
- **Container `css_classes` vs widget `_css_classes`**: containers use `css_classes` (no underscore). Setting `_css_classes` on a container silently fails. The `container({ classes: ... })` factory handles this correctly.

## Iteration loop

```bash
# Edit templates/my-page.mjs …
node ship.mjs my-page --regen      # rebuild + reship in one command

# After shipping, delete the prior page-id so the catalogue stays clean:
curl -s -u "<user>:<app-password>" -X DELETE \
  "https://<site>/wp-json/wp/v2/pages/<previous-id>?force=true"
```

For visual audit, see `../dev-browser/` for screenshot helpers.
