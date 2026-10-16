---
name: emcp-plugins/seo
description: >-
  Load this skill whenever the user wants to read or set the SEO metadata a
  WordPress SEO plugin stores, recognizable by a paired `emcp-tools-{plugin}-read`
  / `emcp-tools-{plugin}-write` tool for an SEO plugin being available. Covers
  Slim SEO (`emcp-tools-slimseo-*`), Visibility (`emcp-tools-visibility-*`),
  Yoast SEO (`emcp-tools-yoast-*`), Rank Math
  (`emcp-tools-rankmath-*`), All in One SEO (`emcp-tools-aioseo-*`), SEOPress
  (`emcp-tools-seopress-*`), The SEO Framework (`emcp-tools-seoframework-*`), and
  SureRank (`emcp-tools-surerank-*`). Each plugin exposes two dispatcher tools,
  one Read and one Write, over a UNIFIED SEO field set (title, description,
  canonical, noindex, nofollow, focus_keyword, og_*, twitter_*) for posts and
  terms. Trigger even when the user doesn't say "operation" or "dispatcher", if
  a paired SEO-plugin read/write tool is available and the request is about a
  post/page/term's SEO title, meta description, canonical, robots, or social
  preview, this skill applies.
---

# emcp-plugins/seo, WordPress SEO plugins over MCP

Seven SEO plugins, one consistent shape and one **unified field vocabulary**.
Each active SEO plugin registers two dispatcher tools, `emcp-tools-<plugin>-read`
and `emcp-tools-<plugin>-write`. **Discover, then act:** call a dispatcher with
**no operation** for its catalog, then call again with `{ operation, arguments }`.

```
emcp-tools-yoast-read({})                                              → { mode:"read", operations:[...] }
emcp-tools-yoast-read({operation:"get-post-seo", arguments:{ post_id: 12 }})
emcp-tools-yoast-write({operation:"update-post-seo", arguments:{ post_id: 12, title:"New title", noindex:true }})
```

This is **distinct from the Pro SEO & Accessibility toolkit** (`audit-page-seo`,
`generate-meta-tags`, …), which *analyses/generates*. These tools *read and set*
what the SEO plugin actually stores.

## Unified field vocabulary

Every plugin maps these unified fields to its own storage. Pass/read them the same
way regardless of plugin:

| Field | Meaning |
|---|---|
| `title` | SEO title (meta title) |
| `description` | Meta description |
| `canonical` | Canonical URL |
| `noindex` / `nofollow` | Robots directives (booleans) |
| `focus_keyword` | Target keyword (where the plugin supports it) |
| `og_title` / `og_description` / `og_image` | Open Graph / Facebook |
| `twitter_title` / `twitter_description` / `twitter_image` | Twitter/X card |

`get-post-seo` / `get-term-seo` return `{ ..., seo: { <fields> } }`;
`update-*-seo` take `{ post_id|term_id, <any subset of fields> }` and change only
the fields you pass.

## The plugins

| Plugin | Tools | Tier |
|---|---|---|
| Slim SEO | `emcp-tools-slimseo-read` / `-write` | **Free** |
| Visibility (native-aeo-pack) | `emcp-tools-visibility-read` / `-write` | **Free** |
| Yoast SEO | `emcp-tools-yoast-read` / `-write` | Pro |
| Rank Math | `emcp-tools-rankmath-read` / `-write` | Pro |
| All in One SEO | `emcp-tools-aioseo-read` / `-write` | Pro |
| SEOPress | `emcp-tools-seopress-read` / `-write` | Pro |
| The SEO Framework | `emcp-tools-seoframework-read` / `-write` | Pro |
| SureRank | `emcp-tools-surerank-read` / `-write` | Pro |

Each pair registers **only when its plugin is active**. Slim SEO and Visibility
are free; the other six are Neo EMCP. **Reads on by default; writes disabled by default**: enable a plugin's Write tool under **Neo EMCP → Tools → Plugins → SEO**.

## Operations per plugin

The catalog each dispatcher returns is authoritative. Not every plugin supports
every operation:

- **All 8:** `get-post-seo`, `update-post-seo`.
- **Term SEO** (`get-term-seo` / `update-term-seo`): Slim SEO, Yoast, Rank Math,
  SEOPress, The SEO Framework, SureRank. **All in One SEO and Visibility are
  post-only** (no Term model in AIOSEO 4.9; Visibility term SEO is a follow-up).
- **Schema read** (`get-schema`): Rank Math, All in One SEO, SEOPress.
- **Settings read** (`get-settings`): Slim SEO, Yoast, Rank Math, All in One SEO,
  SEOPress, SureRank (The SEO Framework: not exposed).
- **Focus keyword:** Yoast, Rank Math, SEOPress (Slim SEO / Visibility / AIOSEO /
  TSF / SureRank don't store a per-post focus keyword, that field is simply absent).
- **Visibility extras:** besides the unified fields it accepts `noimageindex`,
  `nosnippet`, `sitemap_excluded` (booleans) and `schema_type` (a per-post
  Schema.org `@type` override). `schema_type` must be one of Visibility's own
  allowlist or `""` to fall back to the site default; anything else is refused
  with `invalid_schema_type` and the `allowed` list, nothing is written.
  `og_image` is an attachment id. No `twitter_*` fields (Visibility reuses OG).

Redirects are out of scope in this release (they need each plugin's redirects
module/Pro tier); the SEO tools cover metadata + schema-read.

## Common flows

Read then tune a page's SEO:
```
emcp-tools-rankmath-read  { "operation":"get-post-seo", "arguments":{ "post_id": 42 } }
emcp-tools-rankmath-write { "operation":"update-post-seo", "arguments":{ "post_id": 42, "title":"Best Widgets (2026)", "description":"...", "noindex":false } }
```

Set a term's SEO (Yoast):
```
emcp-tools-yoast-write { "operation":"update-term-seo", "arguments":{ "term_id": 5, "title":"Category, %%sitename%%", "noindex":true } }
```

Inspect structured data (Rank Math / AIOSEO / SEOPress):
```
emcp-tools-aioseo-read { "operation":"get-schema", "arguments":{ "post_id": 42 } }
```

## Gotchas

- **Which SEO plugin is active decides which tools exist.** Most sites run exactly
  one SEO plugin, you'll typically see just that plugin's pair. If two SEO plugins
  are both active, prefer the one the site actually uses for output.
- **Fields absent from a plugin are simply not returned/accepted** (e.g. no
  `focus_keyword` on Slim SEO). Don't assume a field exists, read first.
- **All in One SEO is post-only here**: there is no `get-term-seo` for AIOSEO.
- **noindex/nofollow are booleans** in this unified API; the adapter translates to
  each plugin's own encoding (Yoast `'1'`, SEOPress `'yes'`, Rank Math robots
  array, etc.), you never deal with those.
- **Building on-page content** (headings, copy) is a different job, use the
  WordPress Content / Gutenberg / Elementor tools. These SEO tools set the
  metadata a search engine reads, not the visible page.
