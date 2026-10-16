---
name: emcp-seo-a11y
description: >-
  Use this skill whenever the user wants to audit or improve a page's SEO or
  accessibility through the Neo EMCP MCP, recognizable by an
  `emcp-tools-audit-page-seo` or `emcp-tools-audit-page-a11y` tool being
  available, or by the user asking for an SEO audit, meta title/description or
  schema (JSON-LD) generation, keyword extraction, a WCAG/accessibility check,
  color-contrast fixes, or missing image alt text. Covers the audit → generate
  → fix loop across the seven-tool SEO & Accessibility toolkit, including the
  dry-run-by-default safety pattern on the two fixers. Trigger even when the
  user doesn't name a tool, if the tools are available and the task is on-page
  SEO or accessibility, this skill applies. These tools work on Elementor pages
  (they read the page through the Elementor data layer).
---

# emcp-seo-a11y, on-page SEO & accessibility over MCP

Seven Pro tools, in two families, over the Elementor data layer + the site's SEO plugin (Yoast / Rank Math / core). No external API, all analysis is local.

- **5 read-only**: audits + generators (`audit-page-seo`, `audit-page-a11y`, `extract-keywords-from-content`, `generate-meta-tags`, `generate-schema-markup`).
- **2 fixers**: `fix-color-contrast`, `add-alt-text-from-context`. These are **dry-run by default**; they only write when you pass **`apply: true`**, and every write is reversible via Elementor revisions.

**Workflow: audit → generate/propose → apply (deliberately) → re-audit.**

---

## 1. Audit first, get the score and the issue list

- `audit-page-seo(post_id, [keyword])`, scored on-page SEO report: H1 presence, title/meta length, canonical, heading hierarchy, image alts, internal links, word count, and (if you pass a target `keyword`) its usage.
- `audit-page-a11y(post_id)`, WCAG-oriented report: color contrast (best-effort, `inconclusive` when the background can't be resolved), missing alts, heading order, generic/empty link text, form-label coverage.

Both are read-only. Run the relevant one first and work the findings worst-first.

```
audit-page-seo(post_id=42, keyword="emergency plumber")
audit-page-a11y(post_id=42)
```

---

## 2. Generate the missing pieces (proposal-only)

These produce content for you to review/insert, they don't write to the page:

- `extract-keywords-from-content(post_id)`, frequency / TF-IDF-style keywords + bigrams from the page text (stop-word filtered). Use it to pick the target keyword before generating meta.
- `generate-meta-tags(post_id, [keyword])`, proposes an SEO **title (≤60)** + **meta description (≤155)**, keyword front-loaded. Proposal only, apply via the SEO-plugin meta / `update-post`, or hand it to the admin.
- `generate-schema-markup(post_id, type, …)`, JSON-LD for `Article` / `LocalBusiness` / `FAQPage` / `Service` / `Product`. `LocalBusiness` takes a `business` object; `FAQPage` takes a `faqs` array. Proposal only.

---

## 3. Apply fixes, the dry-run gate (read this)

The two fixers default to a **preview**. They report what they *would* change and change nothing until you opt in:

- **Default (`apply` omitted / false)**: returns the proposed changes. Show them to the user; nothing is written.
- **`apply: true`**: writes the change through the Elementor data layer. Reversible via revisions.

| Fixer | Preview returns | With `apply:true` |
|---|---|---|
| `fix-color-contrast(post_id, apply?)` | text-color adjustments so failing pairs meet WCAG AA | writes the resolved `*_color` setting |
| `add-alt-text-from-context(post_id, apply?)` | alt text for images that lack it, derived from filename → nearest heading → page title | writes `_wp_attachment_image_alt` + the image widget's alt |

**Confirm before you `apply`.** Run the fixer in preview, show the user the exact proposed values, and only re-run with `apply:true` once they agree. Contrast fixes change brand colors, never auto-apply silently.

```
# Preview
fix-color-contrast(post_id=42)
# Apply after the user approves
fix-color-contrast(post_id=42, apply=true)
```

---

## 4. Re-audit to confirm

After applying, **re-run the matching audit** and confirm the finding cleared and the score moved. Contrast fixes especially: re-run `audit-page-a11y` to verify the pair now passes AA (and that you didn't push a *different* pair out of range).

---

## 5. Tool reference

| Purpose | Tool |
|---|---|
| SEO audit (scored) | `emcp-tools-audit-page-seo` (`post_id`, optional `keyword`) |
| Accessibility audit (WCAG) | `emcp-tools-audit-page-a11y` (`post_id`) |
| Keyword extraction | `emcp-tools-extract-keywords-from-content` (`post_id`) |
| Propose title + meta description | `emcp-tools-generate-meta-tags` (`post_id`, optional `keyword`) |
| Generate JSON-LD schema | `emcp-tools-generate-schema-markup` (`post_id`, `type`, `business`/`faqs`) |
| Fix contrast (dry-run default) | `emcp-tools-fix-color-contrast` (`post_id`, `apply`) |
| Add alt text (dry-run default) | `emcp-tools-add-alt-text-from-context` (`post_id`, `apply`) |

> The fixers write only with `apply:true` and are reversible via Elementor revisions, always preview and confirm first.

> This skill ships in the Neo EMCP premium build.
