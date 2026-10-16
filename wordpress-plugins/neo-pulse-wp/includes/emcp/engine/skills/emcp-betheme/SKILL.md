---
name: emcp-betheme
description: >-
  Load this skill before building or editing pages on a site whose active theme is
  BeTheme (Muffin Group), recognizable by `emcp-tools-betheme-read` and
  `emcp-tools-betheme-write` tools being available. It is the field-tested playbook
  for authoring BeBuilder pages headlessly over MCP: how BeBuilder stores a page as
  sections, wraps and items, which key an item's settings must go in, the field that
  makes an item vanish when it is missing, how to read and write BeTheme's settings
  safely out of its 830 options, and the conflict with Neo EMCP Themer that makes a
  BeBuilder page look blank. Trigger it for "build a page with BeBuilder", "add a
  section", "change BeTheme colors, fonts or header", or any page work on a BeTheme
  site.
---

# BeTheme + BeBuilder, building pages over MCP

BeTheme is two products behind one name. The **theme** owns global settings (colors,
typography, layout, header, footer, blog) in a single option with 830 keys.
**BeBuilder** owns page content, stored in the `mfn-page-items` post meta.

Tools: `betheme-read` and `betheme-write`. Both are dispatchers taking
`{ operation, arguments }`; call either with no `operation` for its catalog.

## The data model, and the two things that silently break it

A BeBuilder page is **sections, each holding wraps, each holding items**. There is
no other nesting. A section never holds items directly.

```
section  →  wraps[]  →  items[]
```

Two rules are load-bearing, and both fail *silently*. Nothing errors, the page
returns 200, and your content is simply not there:

**1. Item settings go in `attr`.** BeTheme renders an item by calling its renderer
with `$item['attr']`. It falls back to `fields` only when `attr` is absent. Put
settings anywhere else and you get a widget that saves fine and renders empty.

**2. `size` is required on a wrap AND on an item.** The renderer returns early on an
item with no size, so the item disappears with nothing logged anywhere. The write
tools fill in `1/1` when you omit it, but be explicit when you mean something else.

`uid` is generated for you if you omit it. Supply your own when you want to target
one item later.

## The flow: discover, inspect, act

Do not guess item types or their fields. BeTheme ships 135 item types and their
fields are not guessable.

1. **`get-context`** first. Confirms BeBuilder is usable, reports the theme version,
   how many item types this install has, and how many pages already use BeBuilder.
2. **`list-item-types`** to find the type you want. Takes `{ search }`.
3. **`get-item-schema`** with `{ type }` or `{ types: [...] }` before you write. The
   schema is read from the theme's own renderer, so it is the true contract for this
   install, defaults included.
4. **`set-page`** or **`add-section`** to write.

About a quarter of the 135 types take no configuration at all (most of the
WooCommerce ones). Those report that honestly rather than returning invented
fields. If a schema comes back empty, the item genuinely has no settings.

## Writing a page

`set-page` replaces a page's whole BeBuilder content. `add-section` appends one
section and leaves the rest alone; prefer it when you are adding to a page someone
has already built.

```json
{ "operation": "set-page", "arguments": {
  "post_id": 123,
  "sections": [
    { "wraps": [
        { "size": "1/1", "items": [
          { "type": "heading", "attr": { "title": "Our services", "header_tag": "h2" } }
        ] }
    ] },
    { "wraps": [
        { "size": "1/2", "items": [ { "type": "plain_text", "attr": { "content": "Left" } } ] },
        { "size": "1/2", "items": [ { "type": "plain_text", "attr": { "content": "Right" } } ] }
    ] }
  ]
} }
```

Columns come from **wrap sizes inside one section**, as above: two wraps at `1/2`
make two columns. Do not make two sections and expect them side by side; sections
stack.

The whole structure is validated before anything is written. An unknown item type
is refused outright, with the type named, rather than written and left to render
nothing. A refused write leaves the page exactly as it was.

## Theme settings

`get-settings` and `update-settings` cover a **curated subset**, not all 830 keys,
grouped as `colors`, `typography`, `layout`, `header-footer`, `blog`. Filter with
`{ group }` or `{ keys: [...] }`; no argument returns everything curated.

Every returned setting carries its `type`, `label` and `group`, so read before you
write and you will know what shape a value should be.

Writes are allowlisted on purpose. These keys drive every stylesheet the theme
generates, so a key outside the curated set is reported in `skipped[]` rather than
written. Values are type-checked too: a malformed color is refused and the previous
value survives. If you need a key that is not curated, say so rather than trying to
force it.

BeTheme regenerates its stylesheet from these values. On a site with a caching
plugin, a settings change may need the cache cleared before it is visible.

## Read before you edit

`get-page` with `{ post_id }` returns the page as sections, wraps and items, each
item with its `uid`, `type`, `size` and settings. It tells you `uses_builder: false`
for a page with no BeBuilder content, which is your signal that the page is built
some other way and BeBuilder tools are the wrong tool for it.

## The conflict that makes a page look blank

**If a page's BeBuilder content does not appear on the front end, check Neo EMCP Themer
before you debug anything else.**

Neo EMCP Themer's body templates (`single`, `archive`, `search`, `404`) take over page
rendering entirely. Where one matches, BeTheme's own template never runs and the
BeBuilder content on that page does not render. Nothing errors, the page still
loads, so it reads as a page going blank rather than two systems competing.

Header and footer Themer templates are fine and do not cause this.

The fix is a choice, not a bug: either unpublish the Themer body template (or turn
the Themer module off) and use BeBuilder, or build the content inside the Themer
template instead. The plugin shows an admin notice naming the templates involved.

## Out of scope

BeTheme has its own template system (its `template` post type with display
conditions). These tools deliberately do not touch it, because it overlaps EMCP
Themer and driving both from one agent invites exactly the confusion above. Use
Neo EMCP Themer, or BeTheme's own Templates screen directly.

## Quick reference

| Want to | Use |
|---|---|
| Know what this install supports | `betheme-read` `get-context` |
| Find an item type | `betheme-read` `list-item-types` `{ search }` |
| Learn an item's fields | `betheme-read` `get-item-schema` `{ type }` |
| See what a page contains | `betheme-read` `get-page` `{ post_id }` |
| Read theme settings | `betheme-read` `get-settings` `{ group }` |
| Replace page content | `betheme-write` `set-page` |
| Append one section | `betheme-write` `add-section` |
| Change theme settings | `betheme-write` `update-settings` `{ values }` |
