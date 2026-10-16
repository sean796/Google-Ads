---
name: emcp-translatepress
description: Translate a WordPress site that uses TranslatePress (free) through EMCP's translatepress-read and translatepress-write tools, without TranslatePress's visual editor - read every string of a page in the translation language with its sentence context (get-page-strings), write all its translations back in one call (translate-strings), translate theme and plugin text found by search, mark translations reviewed and set up the one translation language. Covers versions and conflicts, shared strings, what the free edition cannot translate and what History can undo.
---

# TranslatePress

EMCP drives TranslatePress free 3.3 and later. TranslatePress translates the rendered page, not a copy of it: a page is the same post in every language, and each piece of text on it is a string in TranslatePress's dictionary.

| Tool | Default |
|---|---|
| `translatepress-read` | on |
| `translatepress-write` | off: the site owner enables it under Neo EMCP > Tools > Plugins > TranslatePress |

Call either tool with no operation to list its operations and their arguments. Pass arguments as `{operation, arguments}`. Language codes are TranslatePress's: `fr_FR`, `de_DE`, `pt_BR`.

## Read first

`get-setup`: the default language, the translation language, URL slugs, whether each is published, and whether automatic translation is switched on. The free edition allows **one** translation language (`language_limit`). If there is none yet, `add-language` with `{language_code: "fr_FR", slug: "fr"}`.

## Translate a page

1. `get-page-strings` with `{post_id, lang: "fr_FR"}`. EMCP renders the page in TranslatePress's preview (with automatic translation switched off for that render) and returns every string in page order: `{id, kind, accessor, original, text, translated, status, version, occurrences, context}`, then theme and plugin strings under `gettext`. 200 per call: pass `next_cursor` back as `cursor` until it is null.
2. Translate each string **using its `context`**. TranslatePress splits a sentence at every inline tag: `We build <strong>fast websites</strong> for <a>small teams</a>.` arrives as four strings, `We build`, `fast websites`, `for`, `small teams`, each with `context` "We build fast websites for small teams". Translate the sentence in your head, then give each fragment the words that belong in its place, so the French reads as one sentence once TranslatePress puts the fragments back together. Word order can force a fragment to carry a different part of the sentence; keep each fragment's meaning as close as the language allows.
3. `translate-strings` with `{lang, strings: [{id, translated, version}], post_id}`: the `version` of each row exactly as you read it. `post_id` makes EMCP check that every id is on that page. One call can write up to 200 strings, and it is all or nothing: one bad entry writes nothing and every bad entry comes back in `errors` with its `index`, `id` and `code`.
4. Look at the page in the translation language (`url` from step 1) when the person wants to check it.

Use `dry_run: true` on `translate-strings` to see each row before and after without writing.

## Rules each translation must follow

- `kind: "url"` rows (`href` links, `src` images) take an http(s) URL or a path starting with `/`, nothing else. Change them only when the translated page should point somewhere else, such as a French version of a linked page.
- Keep the same HTML tags as the original (`tags_changed` otherwise). An original with `<br>` needs a translation with `<br>`.
- TranslatePress's own cleaning applies: scripts are removed, and so is every `%` followed by two hexadecimal digits (`%20`). Write "100 %" or "100 pour cent" rather than a `%xx` sequence.
- Empty translations are refused. To leave a string untranslated, leave it out.

## Strings are shared

A string is one row for the whole site: the header, menus and footer appear on every page, and the same text on two pages is the same row. `occurrences` says how often a string appears on the page you read. Translating `Contact us` once translates it everywhere it appears. Tell the person when a write changes text beyond the page they asked about.

## Status, review and versions

- `translate-strings` saves as machine translated (status 1). With `reviewed: true` it saves as human reviewed (status 2): use that only when the person reviewed the text or asked for it.
- A human-reviewed translation is never overwritten unless the call says `overwrite_reviewed: true` (`reviewed_exists` otherwise, even with `force`). Ask before overwriting a reviewed translation.
- `review-strings` with `{lang, strings: [{id, version}]}` marks machine translations as reviewed; rows that are not machine translated come back in `skipped`.
- Every read returns a `version` per row. If someone else changed the row after your read, the write is a `conflict` and nothing is written: read again, then write. `force: true` writes over a newer change; use it only when the person agrees.

## Theme and plugin strings (gettext)

`search-strings` with `{lang, gettext: true, search: "Add to cart"}` (optionally `domain: "woocommerce"`, `status: "untranslated"`) finds them; `translate-strings` with `gettext: true` writes them. Their ids are not page string ids, so never mix the two in one call. `search-strings` without `gettext` searches the page strings of the whole site.

## Progress

`get-progress` counts untranslated, machine and reviewed strings per translation language, page strings and gettext strings separately.

## Languages

- `add-language`, `update-language` (`slug`, `published`) and `set-default-language` run TranslatePress's own abilities.
- `set-default-language` needs `confirm: true`: TranslatePress keys its dictionaries on the default language, so existing translations stop applying. Ask first.
- `remove-language` needs `confirm: true`; `dry_run: true` says how many strings that language has. It cannot be undone from History.

## What the free edition cannot translate

Image alt text, URL slugs, SEO titles and descriptions (TranslatePress's SEO add-on), more than one translation language, and translation blocks that merge a paragraph into one string (that stays in TranslatePress's visual editor). Automatic translation is never started by EMCP.

## History

Every write except `remove-language` is in History and can be undone. A string undo restores the earlier translations and statuses in one database transaction, and is refused when any of those strings changed again since (a newer translation is never overwritten by an undo). Undoing `add-language` is refused once that language has translations.

## Errors

| Code | Meaning |
|---|---|
| `render_failed` | the page could not be rendered for itself (`reason`: `guard_missing` when a page cache answered, `request_failed` when the host blocks requests to itself, `no_ids` when TranslatePress is not translating the page). `search-strings` still works. |
| `unknown_language` | not the site's translation language (the default language has no translations) |
| `conflict` | a row changed since it was read |
| `reviewed_exists` | a human-reviewed translation is in the way |
| `not_on_page` | an id is not on the page `post_id` names |
| `unknown_string`, `duplicate_string`, `missing_version`, `empty_translation`, `invalid_url`, `tags_changed`, `too_many_strings` | fix the entry and send the whole call again |
| `history_unavailable`, `not_transactional` | History could not record the write, so nothing was written; try again later |
| `trp_language_limit_reached` | the free edition already has its one translation language |
