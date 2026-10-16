=== NEO Pulse WP ===
Contributors: neodigitalca
Requires at least: 6.8
Tested up to: 6.8
Requires PHP: 8.2
Stable tag: 0.9.266
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Companion plugin: chat, search, SEO tools, and in-editor AI wands for WordPress.

== Description ==

NEO Pulse WP runs on WordPress sites licensed by Neo Digital. API keys are set per site in **NEO Pulse WP → Settings** or as constants in `wp-config.php` (never in files inside the plugin folder; a `.env` file there is no longer read). Includes **NEO Pulse AI wands** on post and entity edit screens, Flow Assist chat, AI search, and SEO tooling.

= Where do API keys go? =

In **NEO Pulse WP → Settings**, or as constants in `wp-config.php` (above "That's all, stop editing!"). A constant wins over the Settings value. Supported constants, all optional:

* `NEO_PULSE_WP_OPENROUTER_API_KEY`, `NEO_PULSE_WP_OPENROUTER_MODEL`, `NEO_PULSE_WP_OPENROUTER_HTTP_REFERER` (AI wands, chat, search)
* `NEO_PULSE_WP_DATAFORSEO_LOGIN`, `NEO_PULSE_WP_DATAFORSEO_PASSWORD`, `NEO_PULSE_WP_SEMRUSH_API_KEY` (SEO research)
* `NEO_PULSE_WP_GSC_SERVICE_ACCOUNT_JSON` (optional: the site's own Google Search Console service account JSON, or paste it under Settings → Search Console → Advanced. Not needed normally: with the site key, Search Console data comes through Neo Digital and the client only adds Neo Digital's service account email in Search Console.)
* `NEO_PULSE_WP_SITE_KEY` (licence key when Neo Tools is not installed), `NEO_PULSE_WP_UPDATE_SERVER`
* `NEO_PULSE_WP_CHEKKIT_WEBHOOK_URL`

Keys are never read from files inside the plugin folder: web servers can serve those files publicly, and plugin updates replace the folder.

== Frequently Asked Questions ==

= How do editor AI wands work? =

On **post** and **entity** edit screens, open **NEO Pulse AI** (block sidebar or classic meta box), then **Content Optimizer** (or the meta editor from the snippet card). Use a wand on a field there to **Preview**, then **Apply**. The browser calls your WordPress REST API (`/wp-json/neo-pulse/v1/ai/*`); **OpenRouter runs from PHP** on your server (`wp_remote_post` to openrouter.ai). No NEO Pulse Node hop and no API keys in the browser.

**Requirements:** OpenRouter key in **NEO Pulse WP → Settings → Editor AI** or wp-config (`NEO_PULSE_WP_OPENROUTER_API_KEY`). Optional model override: `NEO_PULSE_WP_OPENROUTER_MODEL`.

**Wands (v0.8):** Title, Focus keyword, Meta/excerpt, SEO research, FAQ, Page URL. Apply updates Rank Math meta, core title/excerpt, and ACF fields; sets `date_modifier` for optimization counting.

= Body optimizer (harness, block editor) =

Requires non-empty **seo_research**, **focus keyword**, and OpenRouter via **wp-config** or **NEO Pulse WP → Settings**.

In the post editor **NEO Pulse AI** sidebar:

1. **Plan sections** — builds checklist + blueprint (OpenRouter on your server).
2. **Run all previews** or preview one section at a time.
3. **Apply** — updates the matching H2 in the block editor and saves the post; counts toward optimization usage.

Progress appears in the sidebar section list, the document **Body harness** panel, and badges on each **H2** block in the canvas.

REST: `POST /neo-pulse/v1/ai/body/plan`, `GET|DELETE /neo-pulse/v1/ai/body/session`, `POST /neo-pulse/v1/ai/body/section/preview`, `POST /neo-pulse/v1/ai/body/section/apply`.

= What is the difference between “Search preview” counts and the dashboard metrics strip? =

Under **Search preview** fields, the small live line shows **characters and words** in that field only (editorial preview). The compact **property metrics** strip on the dashboard shows **post bank**, **SAP bank**, **optimization used/cap**, **editorial period**, and **posts/entities in period**—aligned with NEO Pulse Integrations.

= AI wands show HTTP 502 or "Bad gateway" from my own domain =

That response usually comes from your **hosting stack** (reverse proxy or PHP), not from OpenRouter’s JSON API. WordPress is calling OpenRouter with `wp_remote_post` during that request; if **nginx/FastCGI/proxy read timeout** or **PHP max_execution_time** is shorter than that work, the browser can receive **502 HTML** instead of JSON.

**On the server (recommended)**

* Raise **proxy / FastCGI read timeout** so it exceeds the worst-case AI call.
* Raise **PHP max_execution_time** (and PHP-FPM `request_terminate_timeout` if used) for admin requests.
* Confirm the server can make **outbound HTTPS** to **https://openrouter.ai**.

**In WordPress (optional filters)**

* `neo_pulse_wp_openrouter_timeout` - Seconds for OpenRouter `wp_remote_post` (default falls back to `neo_pulse_wp_enhance_remote_timeout`, then **180**; clamped **10–300**).
* `neo_pulse_wp_enhance_remote_timeout` - Used as the default for OpenRouter when `neo_pulse_wp_openrouter_timeout` is not set.
* `neo_pulse_wp_enhance_time_limit` - Seconds for `set_time_limit()` at the start of AI handlers. Default **300**. Pass **0** to skip `set_time_limit`.

= Can I use NEO Pulse WP with Cursor or Claude via MCP? =

Yes. Install the **neo-pulse-wp-mcp** stdio package (see `docs/neo-pulse-wp-mcp.md` in the NEO Pulse repo). It calls `POST /wp-json/neo-pulse/v1/tools/execute` on your site using a WordPress Application Password. OpenRouter keys remain on the server.

== Changelog ==

See CHANGELOG.md in the Neo Pulse repository for current release notes.

= 0.9.254 =
* Fixed: search said "Search failed" on pages that had been open or cached for more than about a day. Visitors' searches no longer carry a WordPress security code that expires.

= 0.9.253 =
* Search can no longer run up AI costs: the "finished a word yet?" check no longer uses AI, searches are cut to 100 characters, each visitor gets at most 100 AI searches a day, and the site has a daily AI search limit (500 by default, set under Search → General). Past either limit, search keeps working without AI.

= 0.9.252 =
* Fixed: chat crashed with "critical error" on contact, booking and pricing questions (since 0.9.231). Admin notices stay where they belong and their close button no longer covers the text.

= 0.9.251 =
* Insights → Search Console redesigned: totals with change against the previous period, daily click and impression charts, 7-day to 6-month ranges, keywords by position, devices, countries, an Opportunities tab (keywords just off page one, pages seen but rarely clicked) and a Winners & losers tab. Keyword count is now the real number.

= 0.9.250 =
* Search Console connects without a JSON key: the client adds Neo Digital's service account email as a user in Search Console, and Neo Pulse reads the stats through Neo Digital with the site key. Own keys still work under Advanced. Plugin author shows as Neo Digital.

= 0.9.249 =
* Clean-up release: Rank Math redirect import brings every old address and matching type; sitemaps leave out noindex, protected and redirected pages; one FAQPage per page; security fixes for chat, search and Backend Assist; about 9,000 lines of unused code removed. Requires PHP 8.2.

= 0.9.248 =
* Sitemap styling moves to its own address so a cached copy of Rank Math's stylesheet is never shown. Outline buttons, text links and status labels in the admin use the dark brand green so they are easy to read on white.

= 0.9.247 =
* Styled sitemaps: opening sitemap_index.xml or a sitemap in a browser shows a clean table (site name, number of entries, addresses, images, last updated) instead of raw XML. Search engines read the XML as before.

= 0.9.246 =
* Copying settings from Rank Math now leaves out of the sitemap every post type and taxonomy Rank Math did not include, as Rank Math did (they were being added by default).

= 0.9.245 =
* Business opening hours in schema leave out closed days instead of printing "Su Closed", which is not a valid value.

= 0.9.244 =
* SEO switch-over screen: the checklist updates as soon as the side-by-side check finishes, a clear "all pages match" message, matching and skipped pages folded away, a "Ready" status once every step is done, and grey circles for steps not done yet (amber only when something needs a look).

= 0.9.243 =
* Location schema only runs on location pages that use the location fields (type, address or Google Maps name); other post types called "location" are left alone.

= 0.9.242 =
* Location pages: showrooms get their own LocalBusiness schema (address, phone, email, opening hours, map) from the ACF location fields; service-area pages add their town to the business's areaServed.

= 0.9.241 =
* Search results pages get their address, breadcrumbs and SearchResultsPage schema; og:type follows Rank Math (website on the homepage and blog page, article elsewhere); the side-by-side check no longer flags titles containing "&".

= 0.9.240 =
* FAQ schema from the SEO team's ACF "faq" fields is now part of Neo Pulse's schema (the theme's copy stands aside once Neo Pulse SEO is live). Side-by-side check: redirecting addresses are skipped, extra schema Neo Pulse adds counts as expected, and the summary shows only the latest run.

= 0.9.239 =
* Rank Math replacement, part 2: Google Analytics tag, IndexNow, breadcrumbs, robots.txt, "send 404s home", category addresses without /category/, video schema for new posts and FAQ schema from Elementor accordions are carried over, so Rank Math can be switched off on more sites.

= 0.9.238 =
* New admin design matching Neo Tools: light theme, reorganised menu with tabs on each screen, and a new Dashboard with status, to-do list and on/off switches.

= 0.9.237 =
* Admin clean-up: unused screens and settings removed, comment disabling handed to Neo Tools, editor AI content types moved to Settings → Editor AI, safer Duplicate.

= 0.9.236 =
* NEO Pulse Search and Chat widgets: new clean look (pills, soft cards, rounded panels), full styling on the widgets, live preview in the Elementor editor, better phone layout, match percentage pills and a "Best match" card on search results (switchable per widget), NEO Pulse logo in "Powered by".

= 0.9.235 =
* New NEO Pulse Chat Elementor widget holds all chat styling; chat Design and search Appearance screens removed from the admin.

= 0.9.234 =
* SEO Settings (Rank Math replacement), HFCM move, Image SEO looks at the image on upload, Elementor search styling fix. Removed the Speed module (NitroPack handles speed). Branded update icon.

= 0.9.232 =
* Activated badge on every Neo Pulse screen. Removed Global CSS, Block Builder and Super Import.

= 0.9.23 =
* **Super Import** (General menu): unified Flo Sheet JSON workbook, third-party plugin crawlers (ACF, Rank Math, HFCM/WPCode, Autoptimize), batched apply into NEO Pulse Fields/Redirects/Script Manager/Speed, dynamic macro/micro progress UI, REST + MCP `wp_super_migrate_*` tools.

= 0.9.22 =
* **Speed** module: minify/aggregate CSS and JS, HTML minify, disk cache under `wp-content/cache/neo-pulse-speed/`, admin settings, optional Autoptimize settings import, MCP `wp_speed_status` / `wp_speed_flush`.
* **Speed → Images**: JPEG/PNG compression, WebP sidecars, upload auto-optimize, bulk batch REST, separate from Image SEO; MCP `wp_speed_image_*` tools.

= 0.9.21 =
* Admin Tool Library page: searchable dictionary of all MCP/agent tools with parameters and examples.

= 0.9.34 =
* WP-native secrets: plugin `.env` loaded at boot; `npm run embed:neo-pulse-wp-secrets` before customer deploy.
* Removed Supabase pairing and cloud credential sync.

= 0.9.20 =
* MCP tools API: `POST /neo-pulse/v1/tools/list` and `/tools/execute` with 58 agent tools, audit log, and idempotency keys.
* Redirects REST CRUD for agents.
* Agent site index (`wp_site_index`) with focus keyword and seo_research fields.

= 0.8.1 =
* OpenRouter key auto-loaded from Supabase (`neo-pulse_user_wordpress_properties`) via secure RPC.
* NEO Pulse Integrations API key save syncs OpenRouter credentials to Supabase for WordPress plugin wands.

= 0.8.0 =
* Editor AI wands: block sidebar, classic meta box, inline field buttons (preview → apply).
* OpenRouter from PHP only; key pulled from NEO Pulse/Supabase (optional wp-config override).
* REST routes: GET `/neo-pulse/v1/ai/status`, POST `/ai/preview`, POST `/ai/apply`.
* Gated by Site ID connection, optimization package, post type, and period cap on Apply.
