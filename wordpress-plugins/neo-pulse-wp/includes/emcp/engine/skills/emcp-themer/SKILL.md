---
name: emcp-themer
description: >-
  Use this skill whenever the user wants to build or manage WordPress theme
  parts, a site header, footer, single-post/page layout, archive/blog layout,
  search results, or a 404 page, through the Neo EMCP MCP, recognizable by an
  `emcp-tools-create-theme-template` or `emcp-tools-list-theme-templates` tool
  being available, or by the user asking to "design the header/footer", "make a
  custom single post template", "style the blog archive", or "build a 404 page".
  Covers the Neo EMCP Themer workflow: create a typed template, build its content
  with the Gutenberg or Elementor tools against the returned template id, attach
  display conditions, and verify which template wins for a given page. Trigger
  even when the user doesn't say "theme template", if the tools are available
  and the task is about a site-wide header/footer or a per-type layout, this
  skill applies. Also covers post-card Loop Items and the Loop Grid /
  Carousel widgets and blocks (`emcp-loop-grid`, `emcp-loop-carousel`,
  `emcp/loop-grid`, `emcp/loop-carousel`).
---

# emcp-themer, builder-agnostic WordPress theme building over MCP

Neo EMCP Themer lets you design the parts of a site that live *outside* a single page's content, the **header, footer, single, archive, search, and 404**: and inject them on the front end, using **any page builder** (Gutenberg blocks or Elementor). The split to keep in mind:

- **Themer = routing.** A template has a **type** (which slot it fills) and **conditions** (where it applies).
- **The content tools = rendering.** You build the actual layout with the Gutenberg or Elementor tools, against the template's post id.

**Workflow: create (type) → build content (against the id) → set conditions → resolve (verify).**

> **Loops are in scope** since 3.18.0: a `loop` template (Loop Item) is the card, and the Loop Grid / Loop Carousel widgets and blocks repeat it. See section 7.

---

## 1. The slot model (understand this first)

Every front-end request fills up to three **slots**: **header**, **body**, **footer**. The body slot's type is derived from the main query:

| Template type | Fills the body when the page is… |
|---|---|
| `single` | a singular post/page/CPT |
| `archive` | a post-type / taxonomy / date / author archive (the blog index too) |
| `search` | a search-results page |
| `404` | a not-found page |
| `header` | always eligible (fills the header slot on every request) |
| `footer` | always eligible (fills the footer slot on every request) |

For each slot the resolver picks **one winner**: highest matched **condition specificity** → then **priority** → then newest template. So a header scoped to "all pages" is beaten by one scoped to a single post, the more specific match wins.

**Both builders can now do dynamic bodies.** Themer supplies its own dynamic sources to *both*, so a `single`/`archive` body no longer needs Elementor Pro or even Elementor's own tags. Elementor is still the richer styling surface; Gutenberg is quicker for `header`, `footer`, `search`, and `404`.

---

## 2. Create the template (pick the type)

`create-theme-template`, name it and set its type. Returns a **`template_id`** (a WP post) you then build content into.

| Param | Notes |
|---|---|
| `title` | Human label, e.g. "Main header". |
| `type` | One of `header` / `footer` / `single` / `archive` / `search` / `404`, or `loop` for a Loop Item (section 7). |

```
create-theme-template(title="Main header", type="header")
# -> { template_id: 812, ... }
```

Then discover what already exists with `list-theme-templates` (all templates + their types/conditions) and inspect one with `get-theme-template`.

---

## 3. Build the content, against the returned id

The template post is editable by **either builder**. Build its layout exactly like any page, but target `template_id` instead of a normal page:

- **Gutenberg**: use `get-post-blocks` / `add-block` / `update-block` / `insert-pattern` on the `template_id`. See the `emcp-gutenberg` skill for index-path addressing.
- **Elementor**: the template is Elementor-enabled, use `add-container` / `add-free-widget` / `update-widget` / the atomic tools on the `template_id`.

Use `update-theme-template` to change the title/type later; the content itself is edited through the builder tools, not this tool.

### 3a. Themer's own elements

Classic themes ship none of the parts a template needs, so Themer registers **19 Elementor widgets** and **14 Gutenberg blocks** of its own. The Loop Grid and Loop Carousel come on top of these (section 7). Place them like any other widget or block (`add-free-widget` with the `emcp-` name, or `add-block` with the `emcp/` name).

| Element | Elementor widget | Gutenberg block |
|---|---|---|
| Post/Page Title | `emcp-post-title` | `emcp/post-title` |
| Post Content | `emcp-post-content` | `emcp/post-content` |
| Post Excerpt | `emcp-post-excerpt` | `emcp/post-excerpt` |
| Featured Image | `emcp-featured-image` | `emcp/featured-image` |
| Post Meta | `emcp-post-meta` | `emcp/post-meta` |
| Post Info (ordered metadata row) | `emcp-post-info` | |
| Author Box | `emcp-author-box` | `emcp/author-box` |
| Post Navigation | `emcp-post-navigation` | |
| Post Comments | `emcp-post-comments` | |
| Archive Title | `emcp-archive-title` | `emcp/archive-title` |
| Archive Posts (grid/list + pagination) | `emcp-archive-posts` | |
| Archive Posts (classic) | `emcp-archive-loop` | `emcp/archive-loop` |
| Search Form | `emcp-search-form` | |
| Sitemap | `emcp-sitemap` | `emcp/sitemap` |
| Breadcrumbs | `emcp-breadcrumbs` | `emcp/breadcrumbs` |
| Menu | `emcp-nav-menu` | `emcp/nav-menu` |
| Site Logo | `emcp-site-logo` | `emcp/site-logo` |
| Site Title | `emcp-site-title` | `emcp/site-title` |
| Description | `emcp-description` | `emcp/description` |

Five are Elementor-only (Post Info, Post Navigation, Post Comments, Search Form, Archive Posts) because the block editor already has a core block for comments, search and post navigation. **Never assume a block exists**: call `list-dynamic-sources` and read each source's `surfaces`, which reports only what is really registered.

`emcp-post-meta` and `emcp-archive-loop` are the older elements, kept unchanged so existing templates keep rendering. Prefer `emcp-post-info` and `emcp-archive-posts` for new work.

### 3b. Dynamic data (bind a field to a source)

Rather than a dedicated widget per field, bind an ordinary field to a source. Call `list-dynamic-sources` first: it returns each source's `key`, `type`, `args`, and `surfaces`.

```
list-dynamic-sources { "bindable_only": true }
# -> { sources: [ { key: "post-title", type: "text", surfaces: ["widget","block","elementor-tag","block-binding"] }, ... ] }
```

Then pass a binding alongside the usual settings on the widget/block write tools. **Types are enforced**: an `image` source in a text field is refused at call time, not silently rendered blank. Match the source `type` to the field: `text` for headings and paragraphs, `image` for image fields, `url` for links.

Free sources: `post-title`, `post-excerpt`, `post-url`, `post-date`, `post-id`, `featured-image`, `archive-title`, `site-title`, `site-logo`, `description`. Pro adds `custom-field` (ACF-aware, takes a `key` arg), `author-name`, `author-bio`, `author-url`, `author-avatar`, `term-name` and `term-url` (the term sources take a `taxonomy` arg), plus an empty-value fallback.

These work on **free Elementor**. Elementor ships the dynamic-field machinery but no sources of its own, so the picker is empty until Themer fills it.

---

## 4. Attach display conditions (where it applies)

`set-template-conditions` decides **where** the template shows. Conditions are **Include / Exclude** rules; the resolver evaluates the best matched-include specificity.

- **Free tier**: broad scope selectors only: entire-site, all-singular, front-page, one post-type, all-archives, one post-type archive, one taxonomy archive. **One template per type.** No Exclude, no priority.
- **Pro tier**: granular matchers (per-ID post, per-term, author, date), **Exclude** rules, **priority**, and **unlimited** templates per type.

If you pass a granular selector / exclude / priority on a **free** site, the tool **rejects it**: fall back to a broad selector and tell the user the granular targeting needs Pro.

Discover valid targets first with `list-condition-targets` (the selector vocabulary + concrete objects available on this site) so you don't guess IDs or slugs.

```
# Free: header on the whole site
set-template-conditions(template_id=812, conditions={ include: [ { type: "site" } ] })

# Pro: single template only for post 44, excluding the "news" category
set-template-conditions(template_id=910, conditions={
  include: [ { type: "post", id: 44 } ],
  exclude: [ { type: "tax", taxonomy: "category", term: "news" } ],
  priority: 10
})
```

---

## 5. Verify with resolve-template

Never assume your conditions matched, **`resolve-template`** tells you which template wins each slot for a given page or context. Use it as the acceptance check after every condition change.

```
resolve-template(post_id=44)
# -> { header: 812, body: 910, footer: 815 }  (the winning template id per slot, or null)
```

If the wrong template (or none) wins, revisit the conditions, usually a specificity/priority tie or a scope that's too broad/narrow.

---

## 6. PHP region templates (advanced, opt-in, off by default)

When the master switch **PHP Templates** is enabled (Neo EMCP → Tools tab), you can author fully custom **PHP** region templates that a human then *selects* on a Themer template to take over its render. Tools: `create-theme-php-template`, `list/get/update/delete-theme-php-template`.

Two hard rules to convey:
1. **There is no MCP attach tool.** You author the PHP template into a validated sandbox; a **human selects it** on a Themer template in the admin metabox, that selection is the only thing that compiles + executes it. Reference-counted; a draft with no reference never runs.
2. The PHP goes through the **strict snippet validator** (no eval/exec/include/network/file-writes, no closing `?>`). Author region-only output (the slot model is unchanged). See the `emcp-php-snippets` skill for the validator's rules and the human-approval gate, the same model applies here.

---

## 7. Loop Items (repeating post cards)

A **Loop Item** is a template type like any other, except it fills no page slot: it is a card that the **Loop Grid** and **Loop Carousel** render once per post. It therefore takes **no display conditions**; it takes a preview post instead.

| Element | Elementor widget | Gutenberg block |
|---|---|---|
| Loop Grid | `emcp-loop-grid` | `emcp/loop-grid` |
| Loop Carousel | `emcp-loop-carousel` | `emcp/loop-carousel` |

Both widgets are in the curated widget catalog (free tier, category `themer`, `requires: emcp-themer`), so `list-widgets(category = "themer")` finds them. They need the Neo EMCP Themer module on and a **published** Loop Item.

**Free tier: one Loop Item**, with every widget and block option. Pro allows unlimited Loop Items and alternate templates (7f).

### 7a. Create the Loop Item

```
create-theme-template(
  title = "Post card",
  type  = "loop",
  preview = { post_type: "post", post_id: 0, width: 400 }
)
# -> { template_id: 941, type: "loop", is_part: true, preview: {...} }
```

The tool creates it published. `preview` controls only what the editor shows while designing the card: `post_id: 0` samples the latest published post of `post_type`, and `width` is the canvas width in pixels (200 to 1200, default 400). Change it later with `update-theme-template(template_id, preview)`. Calling `set-template-conditions` on a Loop Item is refused with `loop_takes_no_conditions`.

### 7b. Build the card against the returned id

The card is ordinary builder content, so use the normal tools against `template_id`. Everything inside it resolves to the **current card's post**, not the page the grid sits on:

- Themer elements: `emcp-featured-image`, `emcp-post-title`, `emcp-post-excerpt`, `emcp-post-info`, `emcp-author-box`.
- Dynamic bindings on any field: `post-title`, `post-url`, `featured-image`, `post-date`, `post-excerpt` (call `list-dynamic-sources` first, and match the source `type` to the field). Elementor dynamic tags and ACF fields resolve per card too.
- Core blocks in a Gutenberg-built card: `core/post-title`, `core/post-featured-image`, `core/post-excerpt`, `core/post-date`, `core/post-terms`.

The card and the grid do not have to share a builder: an Elementor-built card can be repeated by the Gutenberg block, and the other way round.

Keep a card shallow. It renders once per post, so a 40-element card in a 24-item grid is 960 elements.

### 7c. Place the grid or carousel (Elementor)

The widgets work in any Elementor document, not only Themer templates.

```
add-free-widget(
  post_id = 312, parent_id = "<container id>",
  widget_type = "emcp-loop-grid",
  settings = {
    emcp_template_id: "941",
    emcp_source: "posts", emcp_post_types: ["post"], emcp_per_page: 9,
    emcp_terms: ["category:3"],
    emcp_columns: "3", emcp_columns_tablet: "2", emcp_columns_mobile: "1",
    emcp_gap_x: { size: 24, unit: "px" },
    emcp_pagination: "numbers", emcp_load_type: "ajax"
  }
)
```

Widget value shapes, as Elementor stores them:

- `emcp_template_id` and `emcp_columns*` are select values: **strings** (`"941"`, `"3"`). `"0"` renders nothing.
- Switchers are `"yes"` (on) or `""` (off): `emcp_masonry`, `emcp_equal_height`, `emcp_autoplay`, `emcp_loop`, `emcp_arrows`, `emcp_exclude_current`, `emcp_related_exclude_current`.
- Sliders are `{ size, unit }`: `emcp_gap_x`, `emcp_gap_y`, `emcp_animation_step`. Numbers are plain integers: `emcp_per_page` (1 to 100, default 6), `emcp_offset`, `emcp_first_item_span`, `emcp_page_limit`.
- `emcp_include_ids` / `emcp_exclude_ids` are comma-separated text (`"12, 44, 7"`).
- Grid pagination: `emcp_pagination` is `none` / `numbers` / `prev_next` / `numbers_prev_next` / `load_more` / `infinite`. `emcp_load_type` (`reload` or `ajax`) applies to the three numbered or previous/next types; load more and infinite scroll always load over AJAX.
- Carousel: `emcp_slides` (`"auto"` or `"1"` to `"10"`, plus `_tablet` / `_mobile`), `emcp_effect` (`slide` / `fade` / `coverflow`), `emcp_dots` (`none` / `bullets` / `fraction` / `progress`), `emcp_arrows_position` (`inside` / `outside` / `bottom`), `emcp_offset_sides` (`none` / `both` / `left` / `right`).

### 7d. Place the grid or carousel (Gutenberg)

```
add-block(post_id = 312, markup = '<!-- wp:emcp/loop-grid {"templateId":941,"source":"posts","postTypes":["post"],"perPage":9,"terms":["category:3"],"columns":3,"columnsTablet":2,"pagination":"numbers","ajax":true} /-->')
```

**Write every attribute with its registered JSON type.** The server tolerates strings, but the block editor drops an attribute whose type does not match, and the next save in the editor wipes it:

- Numbers as JSON numbers: `"templateId":941`, `"perPage":6`, `"columns":3`, `"offset":0`, `"gapX":24`, `"slides":3`.
- Lists as JSON arrays of strings: `"postTypes":["post"]`, `"includeIds":["5","6"]`, `"excludeIds":["9"]`, `"terms":["category:3"]`, `"excludeTerms":["post_tag:12"]`, `"authors":["2"]`.
- Booleans as `true` / `false`: `"masonry":true`, `"ajax":true`, `"autoplay":false`, `"excludeCurrent":true`, `"relatedExcludeCurrent":false`.

The names differ between the builders (`emcp_per_page` versus `perPage`, `emcp_load_type: "ajax"` versus `"ajax":true`). Call `get-widget-schema(widget_type = "emcp-loop-grid", full = true)` or `get-block-schema(name = "emcp/loop-grid")` for the full option list before writing settings.

### 7e. Query sources

| Source | Use it for |
|---|---|
| `posts` | any post type with filters (terms, authors, ids, dates, ordering) |
| `current` | inside an **archive** template: repeat the archive's own query, so filters and pagination stay honest |
| `related` | on a **single** template: other posts sharing a term with the viewed post |
| `manual` | a hand-picked list, displayed in the order given in the include ids (`emcp_include_ids` / `includeIds`) |
| `products` | WooCommerce products, with price, popularity and rating ordering (needs WooCommerce) |

Rules that trip agents:

- **Term refs are `taxonomy:term_id`**: `"category:3"`, `"product_cat:17"`. Never a slug or a bare id.
- **Settings hidden for the chosen source are ignored**, in both builders. An offset under `manual`, terms under `related`, or post types under `current` do nothing. Set the source first, then only the settings it shows.
- **Related loops exclude the viewed post by default** (`emcp_related_exclude_current` / `relatedExcludeCurrent`, on). Posts and products have their own switch, off by default (`emcp_exclude_current` / `excludeCurrent`).
- On an archive template use `current`. If the archive is filtered by a plugin that changes the query outside query vars, AJAX pagination falls back to page reloads automatically and says so in an HTML comment visible to editors.

### 7f. Limits and widget-only options

- **Nested loops.** A loop can sit inside a card. When AJAX pagination (load more, infinite scroll, AJAX numbers) loads more cards, a loop nested in those cards shows only its first page, without pagination, and a `current`-source loop nested there shows its empty state: the loading request has no archive to follow.
- **Arrow icons accept SVG uploads only** (`emcp_arrow_prev` / `emcp_arrow_next`; a font icon is ignored).
- **Responsive settings are desktop, tablet and mobile only.** The carousel switches at fixed breakpoints (768 and 1025 px), so on a site with custom Elementor breakpoints its responsive values can disagree with what the editor shows.
- **Widget-only:** arrow SVG uploads, the carousel's `"auto"` slides per view (the block takes numbers only), and alternates.
- **Alternates (Pro, Loop Grid widget only).** Rows in `emcp_alternates`, each `{ emcp_alt_template: "955", emcp_alt_position: 3, emcp_alt_repeat: "yes", emcp_alt_span: 2 }`: show another published Loop Item at that position, or at every multiple of it when `emcp_alt_repeat` is `"yes"`, with a column span (1 to 6). Positions count from 1 and the last matching row wins. With numbered or previous/next pagination every page starts again at 1; with load more and infinite scroll the count carries on across the whole grid. The span is capped at each device's column count (desktop and tablet); on mobile (767 px and below) a spanned card takes one column. If `emcp_first_item_span` is above 1 and a row targets position 1, the first-item span wins, and at tablet width that card also drops the alternate's span. With numbered or previous/next pagination the first card of every page counts as position 1. Carousels and blocks have no alternates.

### 7g. Verify

`get-page-html(post_id)` and count the cards, or open the page. Common mistakes, in the order they happen:

1. **Nothing renders.** The Loop Item is a draft, or `emcp_template_id` / `templateId` is unset or wrong. Publish it; a grid only renders published Loop Items (editors see a `choose a published Loop Item` HTML comment).
2. **Every card is identical.** The card uses static text instead of a dynamic source or a core post block.
3. **A setting has no effect.** It is hidden for the chosen source (7e), or a block attribute was written with the wrong JSON type (7d).
4. **`loop_takes_no_conditions`.** You called `set-template-conditions` on the card. Conditions belong on the template that *contains* the grid, not on the card.
5. **Free quota reached.** One Loop Item on free. Reuse it, or upgrade for more and for alternate templates.

---

## 8. Tool reference

| Purpose | Tool |
|---|---|
| Create a typed template | `emcp-tools-create-theme-template` (`title`, `type`; `preview` for a Loop Item) |
| List / inspect templates | `emcp-tools-list-theme-templates` · `emcp-tools-get-theme-template` |
| Rename / retype, change a Loop Item's preview | `emcp-tools-update-theme-template` (`preview`) |
| Set where it applies | `emcp-tools-set-template-conditions` (granular/exclude/priority = Pro) |
| Discover valid condition targets | `emcp-tools-list-condition-targets` |
| Discover dynamic sources + where each works | `emcp-tools-list-dynamic-sources` (`bindable_only`) |
| Verify the winner per slot | `emcp-tools-resolve-template` |
| Delete a template | `emcp-tools-delete-theme-template` |
| Place a Loop Grid / Loop Carousel | `emcp-tools-add-free-widget` (`emcp-loop-grid`, `emcp-loop-carousel`) or `emcp-tools-add-block` (`emcp/loop-grid`, `emcp/loop-carousel`) |
| Build the content | Gutenberg tools (see `emcp-gutenberg`) **or** Elementor tools (see `emcp-skills`), against the `template_id` |
| PHP region templates (opt-in) | `emcp-tools-create-theme-php-template` · `…-list/get/update/delete-theme-php-template` |

> Build content with the Gutenberg/Elementor tools against the `template_id`, Themer only routes; it doesn't draw.

> This skill ships in the Neo EMCP premium build.
