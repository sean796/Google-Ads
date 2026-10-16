# Custom Widget Builder (Pro)

Build **reusable, panel-editable Elementor widget types** from a structured spec. The MCP tools compile your spec into a real `Widget_Base` class in an isolated sandbox and register it in Elementor, it then appears in the widget panel under **"Custom (EMCP)"** and can be dropped onto any page.

**You never write PHP.** You submit a JSON *spec* (controls + an HTML template with `{{placeholder}}`s). The plugin generates and escapes all the PHP. There is intentionally **no raw-PHP escape hatch**: if a design can't be expressed with controls + the template syntax below, build it as native containers/widgets instead.

## When to build a custom widget vs. native containers

Build a custom widget when the buyer needs **one editable component they'll reuse** with panel fields, e.g. a pricing card, a stat callout, a team-member card, a feature tile, and they'll add several instances or edit copy/links/icons themselves. For a one-off section, prefer native containers + widgets (the rest of this skill). A custom widget is worth it when "the client will edit this again and again."

## The tools (8) and the flow

| Tool | Use |
|---|---|
| `list-control-types` | Discovery: returns the supported control types + template syntax. Call once if unsure. |
| `validate-widget-spec` | Dry-run a spec (validates + lints generated code) without saving. Use before create when unsure. |
| `create-custom-widget` | Compile + sandbox the widget as an **inactive draft**. Returns `widget_id` + `widget_name`; an admin activates it. |
| `update-custom-widget` | Replace a widget's spec and regenerate in place (keeps its status). |
| `get-custom-widget` | Return a widget's spec, generated PHP, status, and `last_error`. |
| `list-custom-widgets` | List all custom widgets + status. |
| `set-widget-status` | `draft` only (take a widget out of use without deleting). Activation is admin-only. |
| `delete-custom-widget` | Permanently remove a widget + its sandbox file. |

**Standard flow:**
1. (Optional) `validate-widget-spec` to catch spec errors early.
2. `create-custom-widget` with the spec → it is saved as an **inactive draft** and returns `widget_name` (e.g. `emcp_custom_42`).
3. **Ask the user to activate it** in **Neo EMCP → Sandbox → Widgets**. No MCP tool can activate a widget: `set-widget-status` refuses `active` with `activation_requires_admin`. An inactive widget is not registered, so it cannot be placed yet.
4. Once it is active, place it on a page with **`add-free-widget`**, passing `widget_type` = that `widget_name`. Set initial values via `settings` keyed by your control names (omitted controls use their defaults).
5. To revise the component everywhere, `update-custom-widget`, existing placements pick up the new code.

> If the widget-builder tools aren't available in your session, they're disabled by default. Tell the user to enable them on **Neo EMCP → Tools → Widget Builder**.

## Spec shape

```json
{
  "meta": {
    "title": "Pricing Card",          // required, panel display name
    "icon": "eicon-price-table",       // eicon-* or fa-* (defaults to eicon-code)
    "keywords": ["price", "plan"]
  },
  "sections": [
    {
      "id": "content_section",          // unique, snake_case
      "label": "Content",
      "tab": "content",                  // content | style | advanced
      "controls": [ /* … */ ]
    }
  ],
  "html_template": "<div>…{{placeholder}}…</div>"
}
```

A **control**:
```json
{ "name": "heading", "type": "text", "label": "Heading", "default": "Plan" }
```
- `name`, lowercase letters/numbers/underscores, **unique across the whole widget**. Placeholder + `settings` key.
- `type`, see the tables below.
- `label`, panel label.
- `default`, honored for scalar controls (text/textarea/number/select/switcher/color/choose/visual_choice/wysiwyg/code/hidden/font/animation). For `slider` pass a plain number (compiled to `{size,unit}`). **Not** for media/url/icon/gallery/dimensions/repeater.
- `description`, small helper text shown under the control.
- `condition`, show this control only when another control has a value: `{ "show_icon": "yes" }` or `{ "layout": ["row","column"] }`. Use it to keep panels clean.
- `responsive: true`, let the buyer set a **different value per device** (desktop/tablet/mobile); use for spacing/size sliders and dimensions.
- `separator`, `"before"` / `"after"` to add a divider line above/below.
- `selectors`, CSS map; keys are **auto-scoped to the widget** (you can write `.card` or `{{WRAPPER}} .card`). See Styling.
- `fields`, required for `repeater` (one level; **no nested repeaters**).
- Type-specific args are listed per control below.

## Control types

### Content
| `type` | Args | `{{name}}` outputs |
|---|---|---|
| `text` | `placeholder`, `input_type` (text/email/url/tel/number) | the text |
| `textarea` | `rows`, `placeholder`, `html:true` | text (line breaks kept); safe HTML if `html` |
| `wysiwyg` |, | sanitized rich HTML |
| `number` | `min`, `max`, `step`, `placeholder` | the number |
| `code` | `language` (html/css/js/json), `rows` | sanitized text (never executed) |
| `hidden` |, | a stored value with no panel UI (flags/config) |
| `date_time` |, | a `Y-m-d H:i` date string (format it in your markup) |

### Choices
| `type` | Args | `{{name}}` outputs |
|---|---|---|
| `select` | `options:[{value,label}]`, add `{value:"",label:"Default"}` for "none" | the chosen value |
| `select2` | `options`, `multiple:true` | a value, or (multiple) an array → loop with `{{#each}}` |
| `choose` | `options` each with an `icon` (eicon); `toggle` | the chosen value |
| `visual_choice` | `options` each with an `image` (URL); `columns` | the chosen value |
| `switcher` | `label_on`, `label_off`, `return_value` | use in `{{#if}}` (value `"yes"`) |
| `url` |, | the URL → `href="{{name}}"` |

For `choose`, use [eicons](https://elementor.github.io/elementor-icons/) (not Font Awesome); alignment values (left/center/right/top/middle/bottom/justify) get sensible eicon defaults if you omit the icon.

### Visual / media
| `type` | `{{name}}` outputs |
|---|---|
| `media` / `image` | the image URL → `src="{{name}}"` |
| `icon` | renders the icon markup (don't wrap it in `<i>`) |
| `gallery` | array of `{id,url}` → loop `{{#each name}}…{{url}} / {{id}}…{{/each}}` |

### Sizing & color, drive CSS via `selectors`
| `type` | Args | Example selector value |
|---|---|---|
| `color` | `alpha:false` | `color: {{VALUE}};` |
| `font` |, | `font-family: {{VALUE}};` (prefer `typography` group) |
| `slider` | `min`, `max`, `step`, `units:["px","%","em"]` | `width: {{SIZE}}{{UNIT}};` |
| `dimensions` | `units` | `padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};` |

### Group controls, full style bundles on a `selector`
Each takes a **`selector`** (a class you put in your template, auto-scoped to the widget) and injects all the related CSS at once. **This is the right way to make text and boxes buyer-editable** (no placeholder/markup needed).

| `type` | Styles it controls |
|---|---|
| `typography` | font family / size / weight / line-height / transform / spacing (also enqueues the font) |
| `border` | width / style / color |
| `box_shadow` | box-shadow |
| `text_shadow` | text-shadow |
| `text_stroke` | `-webkit-text-stroke` |
| `background` | color / gradient / image / video (`types:["classic","gradient"]`) |
| `css_filter` | blur / brightness / contrast / saturation / hue |

```json
{ "name": "title_typo", "type": "typography", "label": "Title", "selector": ".card h3" }
```

### Animation & panel UI (no template output)
| `type` | Notes |
|---|---|
| `animation` | entrance (Animate.css), apply via `prefix_class: "animated "` |
| `hover_animation` | output as a class with the `elementor-animation-` prefix |
| `heading` / `divider` | panel section label / rule |
| `raw_html` | static note (`html` arg) |
| `alert` | colored note: `alert_type` (info/success/warning/danger), `heading`, `content` |
| `repeater` | `fields:[…]` (one level); loop `{{#each name}}` |

## Live data: the `query` control (posts, products, terms, menu, site, breadcrumbs, cart)

A widget can render real site data instead of typed-in repeater rows. Declare one control of `type: "query"` with a `source`, then loop it like a repeater:

```json
{ "name": "posts", "type": "query", "label": "Posts", "source": "posts", "defaults": { "count": 6 } }
```

- `source`: `posts` | `products` (WooCommerce) | `terms` (categories, tags, `product_cat`, `product_brand`) | `menu` (a navigation menu) | `site` | `breadcrumbs` | `cart` (see the header sources below) | `remote` (see Live APIs).
- The generator emits a **Query panel** of ordinary editor controls, prefixed with the control name (`posts_post_type`, `posts_count`, `posts_orderby`, `posts_order`, `posts_taxonomy`, `posts_terms`, `posts_include`, `posts_exclude`, `posts_offset`, `posts_exclude_current`, `posts_ignore_sticky`; products: `count, orderby, order, category, tag, filter, include, exclude, hide_out_of_stock`; terms: `taxonomy, count, orderby, order, hide_empty, parent_mode, parent, include, exclude`; menu: `menu, depth`). The end user changes them in Elementor; you can also pass them as settings to `add-free-widget` (`"products_filter": "on_sale"`).
- `defaults` presets any of those (`{ "taxonomy": "product_brand" }` for a brands widget). `list-control-types` documents everything.
- Template: `{{#each posts}}…{{/each}}` loops the rows, `{{#if posts}}` tests for results, `{{posts_found}}` is the row count. Row fields are fixed per source (posts: `title permalink excerpt date date_iso author author_url author_avatar thumbnail has_thumbnail categories first_category first_category_url comments_count reading_time is_sticky index`; products add `price_html price regular_price sale_price is_on_sale is_featured in_stock stock_status rating review_count add_to_cart_url add_to_cart_text sku short_description brand brand_url discount_pct hover_image has_hover_image`; terms: `name slug url count description thumbnail has_thumbnail parent is_child`; menu: `title url target depth parent_id has_children is_current is_parent_of_current`). URLs are escaped as URLs, `excerpt`/`price_html`/`short_description`/`description` keep safe HTML, booleans are `yes`/`` so `{{#if is_on_sale}}` works.
- There is no `else`: render an empty state as `<p class="x__empty" data-found="{{posts_found}}">No posts</p>` and show it with `[data-found='0']` CSS.
- **Never name a root control like a row field** (`thumbnail`, `title`, `price`, `hover_image`, …): inside the loop the row wins and your switcher is silently ignored. Use `show_thumbnail`, `swap_hover`. The validator refuses the collision.
- Menus arrive flat with `depth`/`parent_id`; nest them in `scripts` (build `<ul class="sub">` from `parent_id`) and hide the flat list, as the bundled Advanced Menu does.
- Queries are read-only and capped (50 rows; terms 100). No pagination yet.

### Header and footer sources: `site`, `breadcrumbs`, `cart`

- `site` returns **one row** of site identity: `name tagline home_url logo has_logo logo_id logo_width logo_height icon has_icon language year page_title login_url current_url search_url rss_url is_front is_home is_logged_in`. The logo is the Customizer logo (`logo_size` control) with a `fallback_logo` media control. Loop it once: `{{#each site}}<a href="{{home_url}}">{{#if has_logo}}<img src="{{logo}}">{{/if}}{{name}}</a>{{/each}}`. Also right for a copyright line (`{{year}}`).
- `breadcrumbs` returns the trail for the current request (Home > post type archive or shop > term ancestors > page ancestors > current), one row per crumb: `title url kind depth is_current is_home is_last` with `kind` in `home archive term ancestor date current`. Controls: `home_label show_home show_current show_archive taxonomy search_label not_found_label`. Emit the JSON-LD `BreadcrumbList` from `scripts` if you want schema.
- `cart` returns the WooCommerce cart lines (`key id name permalink thumbnail has_thumbnail quantity price line_total variation sku is_on_sale remove_url`) **and root tokens**: `{{cart_count}} {{cart_total}} {{cart_subtotal}} {{cart_total_html}} {{cart_currency}} {{cart_cart_url}} {{cart_checkout_url}} {{cart_shop_url}}` plus `{{#if cart_is_empty}}`. Those names are reserved like generated controls. Refresh after add-to-cart from `scripts` by listening to WooCommerce's `added_to_cart` / `wc_fragments_refreshed` jQuery events and re-fetching the page, as the bundled Mini Cart does.
- Structured defaults are supported: `icon` takes `{ "value": "fas fa-check", "library": "fa-solid" }`, `url` takes `{ "url": "#" }`, a `multiple` `select2` takes an array, and repeater row defaults may carry those shapes too.

## Embedding templates and forms: the `shortcode` control

```json
{ "name": "panel", "type": "shortcode", "label": "Panel Template", "tag": "elementor-template" }
```

- `tag` is one of `elementor-template`, `contact-form-7`, `wpforms`, `gravityform`, `fluentform`, `forminator_form`. The editor shows a live dropdown of that provider's items; the stored value is the item id; `{{name}}` renders it (a template renders with its CSS). Works inside a repeater, so a mega menu is a repeater of `{ item_id, template }`.
- You never write a shortcode string, and only those providers can be embedded. Guard an unset pick with `{{#if name}}`.
- Typical uses: mega-menu panels, a template carousel, a form styler (one `shortcode` control per form plugin behind a `provider` select with `condition`), template content in a modal or off-canvas panel.

## Live APIs: the `remote` query source

```json
{ "name": "w", "type": "query", "source": "remote", "preset": "openweather", "defaults": { "location": "London,GB", "units": "metric" } }
```

- Presets: `openweather` (one row: `city, country, temp, feels_like, temp_min, temp_max, humidity, pressure, wind, wind_unit, temp_unit, condition, description, icon, icon_url, sunrise, sunset, updated`), `google_reviews` and `yelp` (review rows: `author, author_url, avatar, rating, text, time, relative_time, url, place_name, place_rating, place_total, source`), and `json` for any HTTPS JSON API (declare the row fields yourself in `defaults.map` as `field=dot.path` lines, plus `url` and `items_path`; names ending `url`/`image`/`avatar` escape as links).
- API keys are never in the widget: the site owner pastes them once under Neo EMCP > Connection > 3rd Party Services (OpenWeather, Google Places, Yelp, three generic slots). A missing key renders no rows and `{{name_error}}` carries the instruction, so always print `{{name_error}}` in an empty-state element.
- Responses are cached (weather 10 min, reviews 6 h, json 15 min or its `ttl` control) and the last good payload is served for a day if the provider fails. Only `https://` endpoints; private hosts are refused.
- OAuth feeds (Instagram, Facebook, TikTok, X) are not presets; do not promise them.

## Choosing the right control

Pick the control that matches what's being managed, these rules mirror how Elementor's own widgets are built. Follow them rather than defaulting to a slider for everything.

- **Padding, margin, and border-radius → use a `dimensions` control, never a `slider`.** A slider sets one value; spacing needs all four sides. `dimensions` gives top/right/bottom/left with a link toggle and units, exactly how Elementor handles spacing, and you drive the CSS through `selectors`:
  ```json
  { "name": "card_padding", "type": "dimensions", "label": "Padding", "units": ["px","em","%"],
    "selectors": { ".card": "padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};" } }
  ```
  - **Margin:** same shape, `"margin: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};"`.
  - **Border-radius:** same shape, `"border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};"`.
  - Reserve `slider` for genuinely single-axis values (width, height, gap, blur, opacity). Font size belongs to typography (next rule), not a standalone slider.

- **Font / text styling → use one `typography` group control, not separate dropdowns or sliders.** Never build individual "Font Weight" (`select`), "Font Size" (`slider`), "Text Transform", etc. controls for a piece of text. A single `typography` control on that element's selector gives the buyer the whole panel, family, size, weight, transform, style, decoration, line-height, letter-spacing, in one place, **and auto-enqueues the chosen Google font**:
  ```json
  { "name": "heading_typography", "type": "typography", "label": "Heading Typography", "selector": ".card h3" }
  ```
  Point `selector` at the element you're styling (auto-scoped to the widget). Keep **color** separate, typography doesn't include it; use a `color` control (or a `background`/`border` group control) for that.

## Template syntax

The `html_template` is plain HTML plus three constructs. **Escaping is automatic and context-aware**: put a placeholder in HTML content and it's HTML-escaped; put it inside an attribute (`href="{{x}}"`, `style="color:{{c}}"`) and it's attribute-escaped; `url`/`media` emit a safe URL; `icon` renders the icon.

- **Value:** `{{control_name}}`
- **Conditional:** `{{#if control_name}} … {{/if}}` (truthy; for a `switcher`, true means "yes")
- **Repeater loop:** `{{#each repeater_name}} … {{field_name}} … {{/each}}`, inside the loop, reference the repeater's own field names.

Example template:
```html
<div class="emcp-card" style="border-color: {{accent}}">
  {{#if featured}}<span class="ribbon">Popular</span>{{/if}}
  {{icon}}
  <h3>{{plan_name}}</h3>
  <p class="price">{{price}}</p>
  <ul>{{#each features}}<li>{{feature}}</li>{{/each}}</ul>
  <a href="{{cta_link}}" class="btn">{{cta_label}}</a>
</div>
```

## Styling

Three ways, combine as needed:
1. **Style controls + `selectors`** (preferred, gives the buyer live panel control). On a `color`/`slider`/`dimensions` control in a `style` tab section:
   ```json
   { "name": "accent", "type": "color", "label": "Accent",
     "selectors": { "{{WRAPPER}} .btn": "background-color: {{VALUE}};" } }
   ```
   `{{WRAPPER}}` and `{{VALUE}}` are **fixed Elementor tokens** (not your control names), leave them literal.
2. **Base CSS via `styles`**: see "Assets" below, for structural CSS that isn't a buyer-editable control.
3. **Custom CSS** scoped to the widget after placing it, via the `add-custom-css` tool (see the Custom CSS section of the main skill).

## Assets, `styles` (CSS) and `scripts` (JS)

For complex widgets, add top-level `styles` and/or `scripts` strings to the spec. They're written as the widget's **own** `style.css` / `script.js` in its sandbox folder and enqueued **only when the widget is on the page** (via Elementor's `get_style_depends`/`get_script_depends`).

```json
{
  "meta": { "title": "Stat Counter", "icon": "eicon-counter" },
  "sections": [ /* … controls … */ ],
  "html_template": "<div class=\"emcp-stat\" data-target=\"{{target}}\"><span class=\"emcp-stat__num\">0</span></div>",
  "styles": ".emcp-stat{ text-align:center } .emcp-stat__num{ font-size:48px; font-weight:800 }",
  "scripts": "(function(){ document.querySelectorAll('.emcp-stat').forEach(function(el){ /* animate to el.dataset.target */ }); })();"
}
```

Rules:
- **`styles` is a global stylesheet**: Elementor does NOT auto-scope it. **Prefix every rule with your own class** (e.g. `.emcp-stat`) so it can't leak into the rest of the page. Use control `selectors` (auto-scoped per instance) for anything the buyer should be able to edit; use `styles` for fixed structural CSS.
- **`scripts` runs once per page load**, not per instance. jQuery is available. **Scope DOM queries to your class**, loop over all matches (`querySelectorAll(...).forEach`), and guard against running twice (e.g. set a `data-emcp-init` flag) so multiple placements behave. Wrap in an IIFE.
- Keep buyer-editable values in **controls**, not hard-coded in `styles`/`scripts`. Pass dynamic values into the markup (e.g. `data-*` attributes via `{{placeholders}}`) and read them in your JS.
- These are raw CSS/JS you author, they run on the live site. Don't include secrets or load untrusted third-party scripts.

## Worked example, pricing card

```json
{
  "meta": { "title": "Pricing Card", "icon": "eicon-price-table", "keywords": ["price","plan"] },
  "sections": [
    { "id": "content", "label": "Content", "tab": "content", "controls": [
      { "name": "icon", "type": "icon", "label": "Icon" },
      { "name": "plan_name", "type": "text", "label": "Plan name", "default": "Starter" },
      { "name": "price", "type": "text", "label": "Price", "default": "$29/mo" },
      { "name": "featured", "type": "switcher", "label": "Mark as popular" },
      { "name": "features", "type": "repeater", "label": "Features",
        "fields": [ { "name": "feature", "type": "text", "label": "Feature" } ] },
      { "name": "cta_label", "type": "text", "label": "Button text", "default": "Choose" },
      { "name": "cta_link", "type": "url", "label": "Button link" }
    ]},
    { "id": "style", "label": "Style", "tab": "style", "controls": [
      { "name": "accent", "type": "color", "label": "Accent",
        "selectors": { "{{WRAPPER}} .btn": "background-color: {{VALUE}}; border-color: {{VALUE}};" } }
    ]}
  ],
  "html_template": "<div class=\"emcp-card\">{{#if featured}}<span class=\"ribbon\">Popular</span>{{/if}}{{icon}}<h3>{{plan_name}}</h3><p class=\"price\">{{price}}</p><ul>{{#each features}}<li>{{feature}}</li>{{/each}}</ul><a class=\"btn\" href=\"{{cta_link}}\">{{cta_label}}</a></div>"
}
```
Then `create-custom-widget` → take the returned `widget_name` → `add-free-widget` onto the page with `settings: { "plan_name": "Pro", "price": "$79/mo", "featured": "yes", "features": [ { "feature": "Everything in Starter" }, { "feature": "Priority support" } ] }`.

## Rules & gotchas

- **Control names**: lowercase + underscores, unique across all sections (including repeater fields within their repeater) **and distinct from every section `id`** (Elementor keeps sections and controls in one namespace; a clash silently drops the control). They are both the placeholder and the `settings` key.
- **Images**: Elementor's own `.elementor img { height: auto }` outranks a single-class rule, so give fixed-height images a doubled selector (`.x__img.x__img{height:100%}`). Inside 3D-transformed parents (flip/coverflow) Chromium does not paint `object-fit: cover` images, use a `background-image` layer there.
- **`select`/`choose` require `options`**; **`repeater` requires `fields`**; **no nested repeaters**.
- **`icon` values** render via Elementor's icon manager, don't wrap `{{icon}}` in your own `<i>`. Give an icon control a default as `{ "value": "fas fa-star", "library": "fa-solid" }`.
- **Per-item colour overrides in a repeater** (`style="--acc:{{color}}"`) leave an empty custom property when the row has no colour, which makes `var(--acc, fallback)` invalid instead of falling back. Strip empty properties in `scripts` (`if(!el.style.getPropertyValue('--acc').trim()) el.style.removeProperty('--acc')`).
- **Control defaults win over your base CSS** for the same element (Elementor's rule carries the element id). A state override such as a night-mode tile colour therefore needs its own control with a `default`, not a plain CSS rule.
- **Never name a control `animation`** (or `_animation`). Elementor reads that setting on every widget as its entrance animation and adds `elementor-invisible` to the wrapper, so the whole widget renders with `visibility: hidden`. The validator now refuses it; use `anim_style`, `transition`, `effect`.
- **Filled active states need their own colour control.** A base rule such as `.x--pills .x__tab.is-active { color:#fff }` loses to the plain `tab_color` / `tab_color_a` control default (Elementor emits it under the element id), so the active pill text becomes invisible. Add `tab_color_a_fill` (default `#ffffff`, selector `.x--pills .x__tab.is-active`) beside the normal active colour. Same for a dark table header, a boxed toggle, an inline chip.
- **`url`/`media`** output a URL string, put them in `href`/`src`, not as visible text.
- **`switcher`** is for `{{#if}}`, not for printing.
- **`tab`** must be `content`, `style`, or `advanced`. Put visual controls in `style` with `selectors` so the buyer can restyle without code.
- **Icons** must look like `eicon-*` or `fa-*`; anything else falls back to `eicon-code`.
- A widget that throws a PHP fatal on load is **auto-deactivated** (you'll see `last_error` from `get-custom-widget` or the admin tab). Fix the spec with `update-custom-widget`, then ask the user to reactivate it in Sandbox → Widgets.
- Updating a widget regenerates its code in place; existing placements on pages keep working with the new output.

## Management

- See everything: `list-custom-widgets`. Inspect one: `get-custom-widget` (returns spec + generated PHP + `last_error`).
- Turn off without deleting: `set-widget-status` → `draft` (it disappears from the panel; existing placements render nothing for it until reactivated).
- Remove for good: `delete-custom-widget` (also deletes the sandbox file; pages using it lose the widget).
- Humans manage the same list under **Neo EMCP → Sandbox → Widgets** (activate/deactivate, view code, delete). Activation happens only there.

## Handing a site over without EMCP

Widgets built here run only while Neo EMCP is active. To keep them working after EMCP is removed (a client handover, a lapsed licence), an admin enables the **Sandbox Plugin Export** module (Modules tab, Pro) and uses Sandbox > **Export as plugin**: every ACTIVE widget, block and snippet is packaged as a standalone plugin with its original widget types, asset handles and category, plus the query, shortcode and remote runtime the widgets call. Install it, then deactivate Neo EMCP; it stays dormant while EMCP is active. Only active artifacts are exported, so activate what belongs in the handover first. There is no MCP tool for this; it is a human action on the Sandbox screen.
