---
name: emcp-performance
description: >-
  Use this skill whenever the user wants to diagnose or improve a WordPress
  site's performance through the Neo EMCP MCP, recognizable by an
  `emcp-tools-analyze-performance` tool being available, or by the user asking
  why a site is slow, for a speed or performance audit, or to optimize load
  time. Covers running the performance analyzer, reading its scored report,
  prioritizing fixes worst-first, applying them through the other EMCP tools,
  and re-scanning to confirm. Trigger even when the user doesn't say
  "analyze-performance", if the tool is available and the task is about
  WordPress performance, this skill applies.
---

# emcp-performance, WordPress performance auditing over MCP

One read-only tool, `analyze-performance`, audits the server, WordPress internals, and a target page and returns a scored report. Your job is the loop:

**Run → interpret → fix → re-scan.**

The tool is **read-only and self-contained**: no writes, no external API, nothing leaves the site. Safe to run anytime, including production. It is *not* Lighthouse: the page audit is a server-side loopback fetch that analyzes HTML + headers, not a real-browser Core Web Vitals run (PHP can't execute page JS). Use it to find server/DB/config/markup bottlenecks, then verify the fixes moved the score.

---

## 1. Run the scan

`analyze-performance`, all params optional:

| Param | Type | Default | Notes |
|---|---|---|---|
| `url` | string | frontpage | A page on **this** site. External hosts are rejected (no SSRF). |
| `post_id` | integer |, | Analyze this post/page's permalink. Ignored when `url` is set. |
| `include_page_fetch` | boolean | `true` | `false` → skip the loopback fetch; server/DB/config audit only. |
| `deep_assets` | boolean | `false` | `true` → sample same-host asset sizes to estimate page weight (extra requests). |

```
# Whole-site baseline (frontpage)
analyze-performance()

# A specific landing page
analyze-performance(url="https://example.com/pricing/")

# Server/DB/config only (e.g. the loopback is blocked on this host)
analyze-performance(include_page_fetch=false)
```

Start with a no-arg baseline. Re-target with `url`/`post_id` when a specific page is the complaint.

---

## 2. Read the report

```jsonc
{
  "target": { "resolved_url": "...", "post_id": null, "is_front_page": true },
  "summary": { "score": 0-100, "grade": "A|B|C|D|F", "counts": {"critical":n,"warning":n,"pass":n,"info":n} },
  "sections": {
    "server":   [ finding, ... ],   // PHP version, memory, OPcache, object cache, image lib
    "database": [ finding, ... ],   // DB size, big tables, autoloaded options, revisions, transients
    "config":   [ finding, ... ],   // plugin count, WP_DEBUG, cron backlog, child theme
    "page":     [ finding, ... ],   // HTTP status, response time, HTML size, compression, cache headers
    "assets":   [ finding, ... ]    // render-blocking CSS/JS, image lazy-loading, third-party domains
  },
  "page_fetch": { "ok": true, "status_code": 200, "response_ms": 0, "total_bytes": 0, "error": null },
  "top_recommendations": [ "[Label] actionable line", ... ]   // already ranked critical → warning
}
```

Each **finding** is `{ id, label, status, value, message, recommendation }`. Status is `pass` / `warning` / `critical` / `info`.

- **Grade bands:** A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, else F. Score starts at 100 and subtracts weighted penalties (critical heavier than warning); `info`/`pass` don't move it.
- **Start with `top_recommendations`**: it's the ranked worst-first list across all sections. Work it top-down.
- If `page_fetch.ok` is `false`, the loopback was blocked (local firewall, self-signed cert, DNS). The server/DB/config audit is still valid; just note the page/assets sections are absent and suggest re-running where the loopback works, or `include_page_fetch=false` to silence it.

---

## 3. Work findings worst-first, route fixes through EMCP tools

The analyzer only *reports*. Translate each finding into an action; where a fix is itself an MCP operation, do it.

| Finding (id) | What it means | How to fix, prefer an EMCP tool |
|---|---|---|
| `autoload_size` (warning/critical) | Autoloaded options load on **every** request | Use `query` / `list-tables` / `describe-table` to list the largest `autoload='yes'` options, identify stale plugin caches, then advise disabling autoload on the offenders (admin decides what's safe). |
| `database_size`, `post_revisions` | Bloated tables / revision pileup | `query` to quantify; advise `WP_POST_REVISIONS` cap + cleanup. |
| `object_cache` (warning) | No persistent object cache | `search-plugins "redis cache"` → `install-plugin` (e.g. `redis-cache`) → `activate-plugin`. Note the drop-in still needs a Redis/Memcached **server** (host-level). |
| page-cache hint (warning) | No page caching detected | `search-plugins` a caching plugin → `install-plugin` → `activate-plugin`, or host/CDN page cache. |
| `plugin_count` (warning), inactive plugins | Per-request overhead / attack surface | Review; `delete-plugin` unused ones (disabled-by-default tool, admin enables). |
| outdated core/plugins/themes (if surfaced) | Old code is slower + riskier | `update-plugin` / `update-theme`. |
| `wp_debug` (warning, production) | Debug overhead + info leak | WP_DEBUG is a wp-config **constant**: `get-settings`/`update-settings` can't toggle it, and the filesystem write tools **refuse `wp-config.php`**. Give the admin the exact wp-config edit to make by hand. |
| `compression`, `cache_headers` (page) | No gzip/brotli or no Cache-Control | Server/CDN/cache-plugin config (reported here; fixed outside MCP). |
| `render_blocking`, `image_lazy_loading`, `third_party` (assets) | Markup/asset issues | Theme/optimization-plugin guidance; add `loading="lazy"`, defer JS, self-host third-party assets. |
| `php_version`, `opcache`, `memory_limit`, `image_lib` (server) | Host environment | Host-level guidance, not MCP-fixable. Recommend PHP 8.2+, enable OPcache, raise memory, install Imagick/GD. |

Explain each fix in plain terms and say whether you can do it (MCP) or the admin/host must.

---

## 4. Re-scan & iterate

After applying a fix, **re-run `analyze-performance` on the same target** and confirm:
- the specific finding cleared (or dropped severity), and
- `summary.score` improved.

Loop until the remaining items are all host-level or accepted. Don't declare "optimized" off a single scan, verify.

---

## 5. Tool reference

| Purpose | Tool |
|---|---|
| Run the performance audit | `emcp-tools-analyze-performance` (`url` / `post_id` / `include_page_fetch` / `deep_assets`) |
| Pinpoint DB bloat (autoload, tables, revisions) | `emcp-tools-list-tables` · `emcp-tools-describe-table` · `emcp-tools-query` (read-only SQL) |
| Find + install a cache/object-cache plugin | `emcp-tools-search-plugins` · `emcp-tools-install-plugin` · `emcp-tools-activate-plugin` |
| Update outdated software | `emcp-tools-update-plugin` · `emcp-tools-update-theme` |
| Remove unused plugins | `emcp-tools-delete-plugin` (disabled-by-default) |
| Read/adjust site settings | `emcp-tools-get-settings` · `emcp-tools-update-settings` |

> wp-config constants (e.g. `WP_DEBUG`, `WP_CACHE`) and `.htaccess` can't be changed over MCP, the filesystem write tools refuse those files. Hand the admin the exact edit to make.

> This skill ships in the Neo EMCP premium build.
