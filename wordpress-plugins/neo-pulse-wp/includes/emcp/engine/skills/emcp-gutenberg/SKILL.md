---
name: emcp-gutenberg
description: >-
  Use this skill whenever the user wants to edit the content of a WordPress post
  or page built with the block editor (Gutenberg) through the Neo EMCP MCP, recognizable by an `emcp-tools-get-post-blocks` or `emcp-tools-add-block` tool
  being available, or by the user asking to add/change/move/remove blocks, work
  with block patterns, or edit a non-Elementor page's content. Covers the
  block-tree model: read a post's blocks to get each block's index path, then
  insert / update / move / remove / duplicate blocks by that path, or drop in a
  registered pattern, instead of rewriting the whole post. Trigger even when
  the user doesn't say "Gutenberg" or "block", if the tools are available and
  the page is block-based (not Elementor), this skill applies. For Elementor
  pages use the Elementor tools instead.
---

# emcp-gutenberg, block-editor content editing over MCP

These 10 tools edit the **block content** of any post/page (raw block markup in, raw block markup out). They are pure WordPress core, **no Elementor**. The whole model rests on one idea:

**Existing blocks are addressed by an index path, which you get from `get-post-blocks`.**

**Workflow: read blocks (get the paths) → edit by path (incremental) → re-read to confirm.**

> **Elementor vs Gutenberg:** if `get-post`'s `is_elementor` flag is true, the page is an Elementor builder page, use the Elementor tools (`emcp-skills`), not these. These tools operate on the post's block markup.

---

## 1. The index path (the core concept)

`get-post-blocks` returns the post's parsed block tree, and **every block carries an index path**: a zero-based array of positions from the top of the document down through nested containers:

- `[0]`, the first top-level block.
- `[2]`, the third top-level block.
- `[2, 1]`, the **second child** of the third top-level block (e.g. the 2nd column inside the 3rd row).

Every mutating tool addresses a block by this `path`. **Always `get-post-blocks` first** to read the current paths, never guess them, and re-read after a structural change (insert/remove/move) because paths shift.

```
get-post-blocks(post_id=42)
# -> [ { name:"core/heading", path:[0], ... },
#      { name:"core/columns", path:[1], innerBlocks:[
#          { name:"core/column", path:[1,0], ... },
#          { name:"core/column", path:[1,1], ... } ] } ]
```

---

## 2. Discover what's available

- `list-blocks`, compact index of registered block types (name, title, category); `category` / `search` filters. Read-only. Use it to find the right block name (`core/paragraph`, `core/image`, `core/columns`, …).
- `get-block-schema`, a block type's attributes + supports + a **markup example** (`name`, or `names[]` for a batch). Read this before writing a block you're unsure about, it shows the exact comment-delimiter + attributes JSON shape.
- `list-patterns`, registered block patterns (name, title, categories). Patterns are pre-built multi-block layouts (a hero, a pricing table, …) you can drop in whole.

---

## 3. Edit by path, prefer incremental over a full rewrite

You *could* rewrite everything with the WordPress Content tool `update-post`, but **prefer these incremental tools**: they preserve the rest of the document and are far less error-prone.

| Tool | What it does | Key inputs |
|---|---|---|
| `add-block` | Insert raw block markup at a position | `markup`, plus a position: `append` / `prepend` / `before` / `after` / `inside` a `path` |
| `update-block` | Replace the block at a path with new markup | `path`, `markup` |
| `move-block` | Move a block to a new position | `path`, target position |
| `duplicate-block` | Clone the block at a path; insert the copy after it | `path` |
| `remove-block` | Delete the block at a path (**destructive**) | `path` |
| `insert-pattern` | Insert a registered pattern's markup at a position | pattern `name`, position |

```
# Add a paragraph after the first block
add-block(post_id=42, markup="<!-- wp:paragraph --><p>Hello.</p><!-- /wp:paragraph -->", position="after", path=[0])

# Replace the heading text
update-block(post_id=42, path=[0], markup="<!-- wp:heading --><h2>New title</h2><!-- /wp:heading -->")

# Drop in a pattern at the top
insert-pattern(post_id=42, name="twentytwentyfour/hero", position="prepend")
```

---

## 4. Block-markup rules (avoid the two classic traps)

Block markup is HTML wrapped in `<!-- wp:NAME {attrs} -->…<!-- /wp:NAME -->` comment delimiters. Two things break silently if you get them wrong:

1. **Container blocks must keep their wrapper chunks.** A `core/columns` / `core/group` block has leading and trailing markup around its children. When you build container markup by hand, include the container's own opening/closing HTML, don't emit only the inner blocks. When in doubt, `get-block-schema` shows the correct nesting shape, and editing children **by path** (rather than rewriting the container) sidesteps the problem entirely.
2. **Attributes are JSON in the opening delimiter.** `<!-- wp:image {"id":57,"sizeSlug":"large"} -->`. Malformed JSON = a broken block. Copy the shape from `get-block-schema`'s example.

Prefer path-based edits of individual blocks; reach for hand-written container markup only when you're genuinely adding new structure.

---

## 5. Confirm

After any structural change, **`get-post-blocks` again** to confirm the tree looks right and to pick up the shifted paths before your next edit. For a visible check, `get-post` returns the saved content. Treat `remove-block` as destructive, re-read to be sure you deleted the intended block.

---

## 6. Tool reference

| Purpose | Tool |
|---|---|
| Read the block tree + index paths | `emcp-tools-get-post-blocks` |
| Discover block types | `emcp-tools-list-blocks` |
| A block type's attributes + example | `emcp-tools-get-block-schema` (`name` / `names[]`) |
| List patterns | `emcp-tools-list-patterns` |
| Insert markup at a position | `emcp-tools-add-block` |
| Replace a block | `emcp-tools-update-block` |
| Move a block | `emcp-tools-move-block` |
| Clone a block | `emcp-tools-duplicate-block` |
| Delete a block (destructive) | `emcp-tools-remove-block` |
| Insert a pattern | `emcp-tools-insert-pattern` |
| Read/replace whole content (fallback) | `emcp-tools-get-post` · `emcp-tools-update-post` |

> These tools also build **Themer** template content (header/footer/search/404), pass the Themer `template_id` as the post id. See the `emcp-themer` skill.

> This skill ships in the Neo EMCP premium build.
