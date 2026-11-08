# Hello Elementor Child functions.php update contract

You are updating **Hello Elementor Child** `functions.php` for NEO Pulse-managed WordPress sites.

## Merge strategy (critical)

**Start from the source file.** The output must be a **complete merged file**, not a diff.

1. **Keep everything from the source** that is still valid: Google Maps shortcodes (`neo_render_directions_map`, `directions_*`), custom hooks, filters, site-specific constants, WP Engine cache, NEO Pulse redirect sync, REST blocks, and any other blocks not listed below.
2. **Upgrade in place** using the canonical reference pattern: FAQ/schema helpers, `inject_custom_acf_schemas`, frontend hide filters, REST `update_callback`, and `sync_acf_metadata_to_post` field reads.
3. **Remove only** broken raw FAQ echo logic (`echo $faq`, `echo $faq_snippet` without JSON-LD wrapper).
4. **Do not** replace the whole file with the canonical template alone. Canonical is the **pattern to apply**, not a blind overwrite.
5. If the source and canonical both define the same helper (e.g. `hello_elementor_child_render_faq_schema`), use the **canonical version**.

## Goal

Fix FAQ / schema output so ACF FAQ fields never render as **raw visible text** on the frontend. FAQ must only appear as JSON-LD inside `<script type="application/ld+json">` in `wp_head`.

NEO Pulse writes FAQ to ACF field **`faq` only** (plain question/answer blocks). Do not add or keep `seo_faq`.

## Never do

- `echo $faq`, `echo $faq_snippet`, or any raw FAQ field output without JSON-LD wrapping.
- Remove or break existing site-specific code (Google Maps shortcodes, NEO Pulse redirect sync, REST API blocks, WP Engine cache purge, custom `user_has_cap` filters) unless it is duplicate broken FAQ echo code.
- Add alternate LLM providers or non-OpenRouter paths.
- Fall back to echoing raw FAQ when parsing fails.
- Reintroduce `seo_faq` field names, filters, or fallbacks.

## Always do

### 1. Schema-only FAQ in wp_head

- Add or update `inject_custom_acf_schemas()` hooked to `wp_head` priority 20.
- Read FAQ with raw values: `get_field( $name, $post_id, false )` via helper `hello_elementor_child_get_schema_field()`.
- Field name: **`faq` only** (no `seo_faq` fallback).
- Output only through `hello_elementor_child_render_faq_schema()` which returns `<script type="application/ld+json">...</script>` or empty string.
- If parsing fails, output **nothing**. Never echo raw text.

### 2. Required helper functions (prefix `hello_elementor_child_`)

| Function | Purpose |
|----------|---------|
| `get_schema_field()` | Raw ACF/meta read for current queried post |
| `hide_schema_fields_on_frontend()` | acf/format_value filter callback |
| `parse_faq_plain_paragraphs()` | **Primary NEO Pulse format:** question line, answer line(s), blank line between pairs (no Q:/A:) |
| `parse_faq_qa_lines()` | Legacy line-based Q:/A: parsing |
| `parse_faq_inline()` | Inline `Q: ... A: ...` on same line/paragraph |
| `filter_faq_entries()` | Keep complete Q+A pairs only |
| `parse_faq_entries()` | JSON-LD, plain paragraphs, Q:/A: lines, or inline |
| `build_faqpage_schema()` | FAQPage schema array |
| `render_faq_schema()` | Script tag only; never raw text |

### 3. Hide schema fields on frontend

Register `acf/format_value` filters for **`faq`** and **`seo_research`** returning empty string on frontend. Keep values in admin, REST, and AJAX.

### 4. Date modified schema

- Read `date_modifier` with fallback `seo_date_modifier` via `get_schema_field()`.
- Output WebPage JSON-LD with `dateModified` ISO 8601 in wp_head.

### 5. NEO Pulse redirect sync (if present)

- Keep `sync_acf_metadata_to_post` on `acf/save_post` priority 25.
- Use `get_field( $name, $post_id, false )` with explicit `$post_id` (never `get_schema_field()` inside this hook).
- Focus keyword fallbacks: `focus`, then `keyword_focus`, then `keyword_focu` (typo field on some sites).
- Date modifier fallbacks: `date_modifier`, then `seo_date_modifier`.

### 6. REST API ACF write (critical for NEO Pulse Update WP)

REST `update_callback` for the `acf` field must call **both**:

- `update_field( $key, $val, $ID )`
- `update_post_meta( $ID, $key, wp_slash( (string) $val ) )` for scalar values

Without `update_post_meta`, NEO Pulse REST writes can return HTTP 200 while the ACF admin textarea stays empty.

Also keep:

- `add_filter( 'acf/rest_api/field_settings/show_in_rest', '__return_true' );`
- `add_filter( 'acf/rest_api/field_settings/editable', '__return_true' );` when present in source or canonical

### 7. Version bump

- Increment `HELLO_ELEMENTOR_CHILD_VERSION` (e.g. to `2.1.2` or next patch).

### 8. Preserve unchanged blocks from source

Keep intact unless broken:

- Child theme style enqueue
- Google Maps shortcodes and destinations (`neo_render_directions_map`, `directions_*`)
- Custom capability or auth filters
- WP Engine cache purge on save

## NEO Pulse FAQ storage format (current)

**Primary:** plain question/answer blocks (no Q:/A: labels), blank line between pairs:

```text
How can I contact the clinic?

You can reach us by phone or the form on this page.

What are your hours?

Monday to Friday, 9am to 5pm.
```

**Legacy:** Q:/A: lines or inline `Q: ... A: ...` still supported.

Wrap as FAQPage JSON-LD at output time only.

## Output quality

- Valid PHP with `<?php` on its own line (newline immediately after the opening tag).
- **PHP 7.4 compatible.** Do not use `array_is_list()` (PHP 8.1+). Use `hello_elementor_child_is_list_array()` instead.
- WordPress coding style consistent with source file (`array()` syntax, not short `[]` arrays).
- No markdown fences in the PHP file itself.
- Complete merged file (source site-specific code + upgraded FAQ/REST blocks), not a diff.
