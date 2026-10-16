---
name: emcp-polylang
description: Make a WordPress site multilingual with Polylang (free) through EMCP's polylang-read and polylang-write tools, and translate Elementor and Gutenberg pages in a few calls - copy a page into another language (create-translation), read its text as numbered segments (get-page-text), write the translations back in one call (apply-page-text), publish it (set-status). Covers languages, links, term translations, strings, menus per language, settings, the sync guard and what History can undo.
---

# Polylang

EMCP drives Polylang free 3.8 and later. Languages and settings go through Polylang's own `pll/v1` controllers, so Polylang validates every change.

| Tool | Default |
|---|---|
| `polylang-read` | on |
| `polylang-write` | off: the site owner enables it under Neo EMCP > Tools > Plugins > Polylang |

Call either tool with no operation to list its operations and their arguments. Pass arguments as `{operation, arguments}`.

## Read first

1. `get-setup`: languages (slug, locale, default, post count), URL mode, translated post types and taxonomies, the sync list, menus per language. Every later call uses these slugs.
2. `find-missing` with `lang`: the pages (or another `post_type`) that still need a translation into that language.

## Set up a site

1. `add-language` for each language: `{locale: "fr_FR", slug: "fr", name: "Français"}`. The first language becomes the default; `set-default-language` changes it.
2. Existing content has no language yet. `assign-language` with `{lang: "en", post_type: "page", without_language: true}` assigns 500 per call and reports `remaining`; repeat until it is 0. Do the same for `post`.
3. `link-translations` joins posts that already exist in different languages: each needs a language and no two may share one.
4. `set-menu-location` gives each theme location a menu per language: `{location: "primary", lang: "fr", menu_id: "12"}`.
5. `update-settings` changes Polylang settings. `force_lang` (URL mode) and `rewrite` change every URL on the site: they need `confirm: true`, so ask the person first.

## Translate a page

1. `create-translation` with `{post_id, lang}`. It copies the content, Elementor or block data, meta, template, password and featured image, maps parent and terms to their translations, sets the language and links it. The copy is a `draft` with the slug `{source-slug}-{lang}`. Pass `dry_run: true` to see the plan first.
   - `untranslated_terms` lists terms with no translation: make each with `create-term-translation` (`{term_id, lang, name}`), then assign it to the copy.
   - `parent_note` says when the parent has no translation yet.
   - `translation_exists` returns the existing copy's `post_id`: translate that one instead.
2. `get-page-text` with the copy's `post_id`. It returns segments `{key, kind, text, where}` and a `hash`. `kind` is `text`, `html` (keep the inline tags) or `url`. Up to 200 segments per call; pass `next_cursor` as `cursor` for more.
3. Translate every segment's text. Keep HTML tags and attributes as they are in `html` segments. Change a `url` only to point at the translated page or keep it.
4. `apply-page-text` with `{post_id, based_on: hash, segments: [{key, text}]}`. Segments left out keep the source text. Everything is validated first: one bad segment and nothing is written (the error lists each one). For several batches, pass the `page_after_hash` the previous apply returned as the next `based_on`; the first extraction's hash is stale after the first apply.
5. `set-status` with `{post_id, status: "publish"}` when the person wants it live.

Text is found in Elementor widgets by control type (text, textarea, WYSIWYG, link URLs, repeater rows), in Elementor v4 headings, paragraphs and buttons, and in these Gutenberg blocks: paragraph, heading, list item, quote, pullquote, verse, preformatted, details, button, image (alt, caption, link), media and text (alt), search, navigation link. The title, excerpt and Yoast, Rank Math or SEOPress title and description come too. Everything else is listed in `skipped`: edit those with the builder's own tools (the HTML widget, dynamic tags, third-party blocks, other builders).

## Strings

`list-strings` lists Polylang string translations (site title, date formats, and what themes and plugins register). Theme and plugin strings appear only after a wp-admin page load has registered them. `update-strings` with `{lang, strings: [{string, translation}]}` accepts only strings Polylang knows.

## The sync guard

Polylang can copy dates, parent, menu order, comment status, custom fields and terms between translations. While EMCP writes, it holds that sync back for what the write touches, so translating the French copy never changes the English page. If Polylang copies something anyway, the call returns `sync_leak`: the write is reversed, the other translations are left exactly as they are now, and History has an entry for each one that restores it. Report it to the person. Edits made with other EMCP tools on a translated page are not guarded: syncing those is Polylang behaving as the site owner configured it.

## History

Every write is recorded. These can be undone from History: create-translation (deletes the copy and its link, only while nobody changed it), apply-page-text, set-status, add-language (only while no content uses it), update-language, set-default-language, assign-language, link-translations, create-term-translation (only while the term is unused), update-strings, set-menu-location, update-settings. `delete-language` cannot be undone: it needs `confirm: true` and `dry_run: true` shows how many posts and terms use the language.

## Never

- Never call `delete-language` without the person agreeing, after showing the `dry_run` counts.
- Never change `force_lang` or `rewrite` without the person agreeing.
- Never pass `force: true` to `apply-page-text` to get past a `conflict`: call `get-page-text` again, someone changed the page.
- Never publish a copy before its text is translated.

Polylang Pro features (shared slugs, translated slugs, machine translation) are not available.
