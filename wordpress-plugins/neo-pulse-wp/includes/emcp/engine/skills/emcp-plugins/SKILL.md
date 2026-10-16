---
name: emcp-plugins
description: >-
  Use this skill whenever the user wants to work with a third-party WordPress
  plugin's data through the Neo EMCP MCP, recognizable by a paired
  `emcp-tools-{plugin}-read` / `emcp-tools-{plugin}-write` tool being available,
  or by the user asking to read or change Advanced Custom Fields (ACF) values,
  field groups, options pages, or ACF-managed post types and taxonomies. Every
  plugin integration has the same shape: TWO dispatcher tools, one Read and one
  Write, each bundling many named operations. Call a dispatcher with no operation
  to list what it can do, then call it again with `{ operation, arguments }`.
  Trigger even when the user doesn't say "operation" or "dispatcher": if a paired
  read/write plugin tool is available and the request is about that plugin's
  data, this skill applies. Covers ACF / ACF PRO and WooCommerce directly, plus
  form, SEO and Elementor addon plugins through the nested `emcp-plugins/forms`,
  `emcp-plugins/seo` and `emcp-plugins/addons` sub-skills; lists plugins
  with their own skill.
---

# emcp-plugins, plugin integrations over MCP

Neo EMCP exposes each supported third-party plugin as **two dispatcher tools**: one **Read**, one **Write**: instead of dozens of individual tools. This keeps the tool list small while covering the whole plugin.

**The model (identical for every plugin):**

- `emcp-tools-<plugin>-read`, all read operations for that plugin.
- `emcp-tools-<plugin>-write`, all write operations for that plugin.

Each tool takes two inputs:

```jsonc
{
  "operation": "<operation-name>",   // which operation to run
  "arguments": { /* ... */ }          // that operation's arguments
}
```

**Workflow: discover → act.**

1. **Discover**: call the tool with **no `operation`** (or an empty object). It returns the catalog of operations it supports, each with a description. Use this to learn the exact operation names and what they need.
2. **Act**: call the tool again with `{ operation, arguments }`.

```
emcp-tools-acf-read({})                     → { mode:"read", operations:[ {operation, description}, ... ] }
emcp-tools-acf-read({operation:"list-field-groups"})   → runs it
```

**Gating you must know:**

- The **Read** tool is enabled by default; the **Write** tool ships **disabled** and the admin must turn it on (Neo EMCP → Tools → Plugins). If a write tool isn't in your tool list, writes are off, tell the user to enable it rather than trying to force it.
- Each operation still enforces its own WordPress capability (an editor can write field *values* but only an admin can create field *groups* / post types / taxonomies). A `forbidden` error means the current user lacks that capability.
- Unknown operation, or a write operation sent to the read tool (and vice-versa) → `unknown_operation`. Call the tool with no operation to see the valid list.

---

# ACF / ACF PRO

Two tools: **`emcp-tools-acf-read`** (8 operations) and **`emcp-tools-acf-write`** (7 operations). They only exist when Advanced Custom Fields (free or PRO) is active.

**The big picture:** ACF stores *field values* on posts/options, defined by *field groups*, which attach to locations (a post type, a specific page, etc.). ACF 6.1+ can also register *custom post types* and *taxonomies* as data. With these two tools an agent can build a whole content structure end-to-end:

```
create-post-type  →  create-taxonomy  →  create-field-group  →  (create a post)  →  update-fields
```

## Discover first

```
emcp-tools-acf-read({})     → lists the 8 read operations
emcp-tools-acf-write({})    → lists the 7 write operations (only if the write tool is enabled)
```

If the post-type / taxonomy operations are missing from the catalog, the site is on ACF < 6.1 (those operations need 6.1+).

## Read operations (`emcp-tools-acf-read`)

| operation | arguments | returns |
|---|---|---|
| `list-field-groups` |, | All field groups: key, title, active, field count. |
| `get-field-group` | `{ key }` | One group's location rules + the recursive field tree (names, keys, types, sub_fields, layouts). **Read this before writing values or editing the group**: it's how you learn each field's name/type. |
| `list-options-pages` |, | ACF PRO options pages (empty + `pro:false` on free ACF). |
| `get-fields` | `{ post_id }` **or** `{ options_page }` | Current field *values* for a post or options page, formatted (repeaters/flexible as nested arrays). |
| `list-post-types` |, | ACF-managed CPTs (6.1+): slug, title, visibility, supports, taxonomies. |
| `get-post-type` | `{ key }` | One ACF-managed CPT's full definition. |
| `list-taxonomies` |, | ACF-managed taxonomies (6.1+): slug, title, hierarchy, object types. |
| `get-taxonomy` | `{ key }` | One ACF-managed taxonomy's full definition. |

## Write operations (`emcp-tools-acf-write`)

| operation | arguments | notes |
|---|---|---|
| `update-fields` | `{ post_id` **or** `options_page, fields: { name: value } }` | Writes values by **field name**. Returns `updated`, `skipped` (with reasons), and the re-read `values`. |
| `create-field-group` | `{ title, fields: [ … ], location: [[ … ]] }` | Creates a group. Location defaults to `post_type == post`. |
| `update-field-group` | `{ key, … }` | Edit settings, add new fields, or change per-field settings. **No deletes/renames.** Refuses code-registered (acf-json/PHP) groups. |
| `create-post-type` | `{ post_type, title, singular?, public?, hierarchical?, has_archive?, show_in_rest?, supports?, taxonomies? }` | Registers a CPT **through ACF as data** (no PHP). Slug ≤ 20 chars, not reserved/existing. |
| `update-post-type` | `{ key, … }` | Edit labels/visibility/supports/taxonomies. **Slug is immutable.** |
| `create-taxonomy` | `{ taxonomy, title, singular?, object_type?: [ … ], hierarchical?, public?, show_in_rest? }` | Registers a taxonomy as data. Slug ≤ 32 chars. |
| `update-taxonomy` | `{ key, … }` | Edit an ACF-managed taxonomy. **Slug is immutable.** |

## Field definitions (for create-field-group / update-field-group)

Each field needs at least `label`, `name`, `type`. Common extras: `required`, `instructions`, `choices`, `default_value`, `min`/`max`, `return_format`, `post_type`, `taxonomy`, etc. Nested types:

- **Repeater / group**: add a `sub_fields: [ … ]` array.
- **Flexible content**: add `layouts: [ { name, label, sub_fields: [ … ] } ]`.

**Location** is an OR-array of AND-arrays of `{ param, operator, value }` rules; operator is `==` or `!=`:

```jsonc
"location": [
  [ { "param": "post_type", "operator": "==", "value": "book" } ]
]
```

## Worked example, full structure end to end

```
// 1. a custom post type
emcp-tools-acf-write({ operation:"create-post-type",
  arguments:{ post_type:"book", title:"Books", singular:"Book", supports:["title","editor","thumbnail"] } })

// 2. a taxonomy attached to it
emcp-tools-acf-write({ operation:"create-taxonomy",
  arguments:{ taxonomy:"genre", title:"Genres", object_type:["book"] } })

// 3. a field group on that post type
emcp-tools-acf-write({ operation:"create-field-group",
  arguments:{ title:"Book Details",
    fields:[ { label:"Subtitle", name:"subtitle", type:"text" },
             { label:"Rating", name:"rating", type:"number", min:0, max:5 } ],
    location:[[ { param:"post_type", operator:"==", value:"book" } ]] } })

// 4. create a book post with the generic content tool (emcp-tools-create-post, post_type:"book"),
//    then write its field values by name:
emcp-tools-acf-write({ operation:"update-fields",
  arguments:{ post_id:123, fields:{ subtitle:"The Spice Must Flow", rating:5 } } })

// 5. read it back to confirm
emcp-tools-acf-read({ operation:"get-fields", arguments:{ post_id:123 } })
```

## Reading + writing complex PRO fields

`get-fields` returns repeaters/galleries/flexible content as nested JSON, and `update-fields` accepts the same shape:

- **Repeater**: an array of row objects: `"team":[ {"name":"Ana","role":"CEO"}, … ]`.
- **Flexible content**: each row must carry an `acf_fc_layout` matching one of the field's layout names: `"sections":[ {"acf_fc_layout":"hero","hero_title":"Hi"} ]`. A wrong/missing layout name is rejected.
- **Gallery / image / file**: attachment IDs.

Pro-only field types (`repeater`, `flexible_content`, `gallery`, `clone`) are **rejected on free ACF** with `acf_pro_required`, check `list-options-pages` (`pro:false`) or just expect the error, and fall back to free field types.

## Gotchas

- **Write tool disabled?** If `emcp-tools-acf-write` isn't available, writes are off by default. Ask the user to enable **ACF Write** on the Tools → Plugins → ACF screen. Don't try to route writes through the read tool.
- **Always `get-field-group` before `update-fields`** on a target that may never have had the field saved, the writer resolves field **names → keys** for you, but you still need the correct field names, which the group tells you.
- **CPT/taxonomy operations need ACF 6.1+.** If they're absent from the write catalog, they're unavailable.
- **Slugs and field name/key/type are immutable.** Renaming orphans stored content, so there's no rename and no delete. To "rename", create anew and migrate.
- **`skipped` in the update-fields result** tells you which fields didn't take and why (`field_not_found`, `acf_pro_required`, a flexible-layout error), surface those to the user instead of assuming success.
- **Discovery is cheap and authoritative.** When unsure of an operation name or its arguments, call the dispatcher with no operation. Never guess an operation that wasn't in the catalog.

---

# WooCommerce

`emcp-tools-woo-read` / `emcp-tools-woo-write` cover the **full WooCommerce `wc/v3` REST surface** (~120 operations) behind the same two dispatchers. Each operation maps to a WooCommerce REST endpoint and runs as the connected admin, so HPOS and all Woo permission checks apply automatically.

## Discover first

Call `emcp-tools-woo-read` (or `-woo-write`) with **no `operation`** to get the catalog, every operation with its HTTP method, route, whether it needs `confirm`, and a one-line description. Never guess an operation name; the catalog is authoritative.

```jsonc
// emcp-tools-woo-read  { }  → { mode:"read", operations:[ { name, method, route, confirm, description }, … ] }
```

## What's covered

- **Products**: list/get/create/update/delete + `batch-products`; variations; categories; tags; attributes + terms; reviews; shipping classes.
- **Orders**: list/get/create/update/delete + `batch-orders`; order notes; **refunds** (`create-refund` moves money).
- **Customers** (PII), **Coupons**, **Reports** (`report-sales`, `report-*-totals`, `report-top-sellers`).
- **Store config**: settings (`get-settings` / `update-setting` / `batch-settings`), payment gateways, shipping zones/methods/locations, taxes + tax classes, webhooks, system status, data (countries/currencies).

## Arguments

- **Path parts go in `arguments`**: `get-order` → `{ id }`; `list-variations` → `{ product_id }`; `create-refund` → `{ order_id, amount, … }`; `get-settings` → `{ group }`.
- **Everything else** is passed straight to the Woo endpoint: list filters (`search`, `status`, `per_page`, `after`…) for reads; the record body (`name`, `regular_price`, `line_items`, `status`…) for writes.

## Confirm-gated operations

`create-refund`, every `delete-*`, and every `*-batch` op **require `confirm: true`** in `arguments` (they move money or are irreversible). Without it you get `confirmation_required`, tell the user what will happen and only retry with `confirm: true` once they agree.

## Worked flows

```jsonc
// 1) Find a pending order and read it
emcp-tools-woo-read { "operation":"list-orders", "arguments":{ "status":"processing", "per_page":10 } }
emcp-tools-woo-read { "operation":"get-order",   "arguments":{ "id":812 } }

// 2) Mark it completed
emcp-tools-woo-write { "operation":"update-order", "arguments":{ "id":812, "status":"completed" } }

// 3) Refund $20 on it (money, needs confirm)
emcp-tools-woo-write { "operation":"create-refund",
  "arguments":{ "order_id":812, "amount":"20.00", "reason":"partial refund", "api_refund":true, "confirm":true } }

// 4) Create a simple product
emcp-tools-woo-write { "operation":"create-product",
  "arguments":{ "name":"Blue Mug", "type":"simple", "regular_price":"12.00", "sku":"MUG-BLUE" } }
```

## Gotchas

- **Write tool disabled?** `emcp-tools-woo-write` ships **off** by default (money + PII surface). If it's unavailable, ask the user to enable **WooCommerce Write** on Tools → Plugins → WooCommerce. Never route writes through the read tool.
- **`confirm:true` is mandatory** on refunds/deletes/batch, don't strip it, don't add it without the user's go-ahead.
- **Deletes are permanent.** `delete-product`/`delete-order`/`delete-customer` force-delete (bypass trash). For customers, pass `reassign` if you want their posts reassigned.
- **Config writes affect checkout.** `update-setting`, `update-gateway`, shipping/tax changes are live, confirm intent with the user first.
- **Discovery is cheap and authoritative.** Unsure of an operation or its args? Call the dispatcher with no operation. Woo's REST error messages pass straight through, so a failed call tells you exactly what was wrong.

---

# Forms (CF7, WPForms, Gravity, Fluent, Ninja, Formidable)

The six WordPress form plugins share the same two-dispatcher shape (`emcp-tools-<plugin>-read` / `-write`) for reading forms/fields/notifications and managing entries (submissions). Because they span six different plugin APIs with per-plugin operation sets and PII/`confirm` rules, that domain has its own dedicated sub-skill:

**→ Load `emcp-plugins/forms`** (`get-skill emcp-plugins/forms`) whenever a `emcp-tools-cf7-*`, `-wpforms-*`, `-gravityforms-*`, `-fluentforms-*`, `-ninjaforms-*`, or `-formidable-*` tool is available. It carries the per-plugin operation reference, the entries/PII handling, the `delete-entry` `confirm:true` rule, and the CF7-has-no-entries / WPForms-Lite-has-no-entries caveats.

---

# SEO (Slim SEO, Yoast, Rank Math, AIOSEO, SEOPress, The SEO Framework, SureRank)

The seven WordPress SEO plugins share the same two-dispatcher shape
(`emcp-tools-<plugin>-read` / `-write`) over a **unified SEO field vocabulary**
(title, description, canonical, noindex/nofollow, focus_keyword, og_*, twitter_*)
for posts and terms, plus schema-read where supported. Because the field mapping
and per-plugin support differ, that domain has its own sub-skill:

**→ Load `emcp-plugins/seo`** (`get-skill emcp-plugins/seo`) whenever a
`emcp-tools-slimseo-*`, `-yoast-*`, `-rankmath-*`, `-aioseo-*`, `-seopress-*`,
`-seoframework-*`, or `-surerank-*` tool is available. It carries the unified
field vocabulary, per-plugin operation support (term SEO, schema, focus keyword),
and the reads-on/writes-off defaults. Distinct from the SEO & Accessibility
toolkit, which audits/generates rather than reading/writing plugin data.

---

## Elementor addon plugins (Essential Addons, Premium Addons, Ultimate Addons for Elementor)

This domain **breaks the two-dispatcher rule**, so check before assuming a pair
exists. Essential Addons and Premium Addons expose a **single read tool each**
(`emcp-tools-essential-addons-read`, `emcp-tools-premium-addons-read`) for
discovery only: their widgets register into Elementor's own registry and are
placed with the ordinary `add-free-widget` tool, so there is deliberately no add
or write tool.

Ultimate Addons for Elementor (UAE, formerly Header Footer Elementor) is **both
natures at once** — a widget pack *and* a template plugin — so it does use the
normal `emcp-tools-uae-read` / `emcp-tools-uae-write` pair. Its read tool covers
both: widget discovery and template inspection.

**→ Load `emcp-plugins/addons`** (`get-skill emcp-plugins/addons`) whenever an
`emcp-tools-essential-addons-*`, `-premium-addons-*` or `-uae-*` tool is
available. It carries the discover/inspect/place workflow, why addon widget
schemas are filtered by default (a single addon widget can report 400 to 700
controls), the rule against guessing control names, the UAE template-record
versus template-content split, and the reason UAE is kept separate from EMCP
Themer.

---

## Plugins with a skill of their own

These integrations follow the same two-tool shape but carry rules this skill does not: versions and conflicts, which writes need `confirm`, who gets emailed or notified, and what History can and cannot undo. **Load the plugin's own skill (`get-skill <slug>`) before the first write**, and before any undo.

| Plugin | Tools | Skill |
|---|---|---|
| FunnelKit Funnel Builder and FunnelKit Automations | `emcp-tools-funnelkit-read` / `-write`, `emcp-tools-funnelkit-automations-read` / `-write` | `emcp-funnelkit` |
| Polylang | `emcp-tools-polylang-read` / `-write` | `emcp-polylang` |
| TranslatePress | `emcp-tools-translatepress-read` / `-write` | `emcp-translatepress` |
| TablePress | `emcp-tools-tablepress-read` / `-write` | `emcp-tablepress` |
| Tutor LMS | `emcp-tools-tutor-read` / `-write` | `emcp-tutor` |
| LifterLMS | `emcp-tools-lifterlms-read` / `-write` | `emcp-lifterlms` |
| The Events Calendar | `emcp-tools-events-calendar-read` / `-write` | `emcp-events-calendar` |
| Amelia | `emcp-tools-amelia-read` / `-write` | `emcp-amelia` |
| FluentCRM | `emcp-tools-fluentcrm-read` / `-write` | `emcp-fluentcrm` |
| MailPoet | `emcp-tools-mailpoet-read` / `-write` | `emcp-mailpoet` |

---

## Adding future plugin integrations

Every new plugin integration ships as the same two-tool pair, `emcp-tools-<plugin>-read` and `emcp-tools-<plugin>-write`, with its own set of operations, and usually with a skill of its own (add it to the table above). The discover→act workflow, the read-on/write-off default, and the per-operation capability checks are identical. When a new pair appears, call each with no operation to learn its operations, check the skills catalog for a matching skill, then use them exactly as with ACF above.
