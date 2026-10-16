# Industry vertical packs

Each `<slug>.md` in this folder is a vertical knowledge file: when the EMCP skill
recognizes the site's industry, it reads the matching file **before building** and
gets the brand voice, SEO keywords, page structure, conversion patterns, compliance
notes, and the exact **Brand Kit + prompt + template** combo for that trade.

These files are premium content, they ship only in the premium build and are
streamed to licensed Pro users via the Skills tab. See
`docs/INDUSTRY_SKILL_PACKS_PLAN.md` for the full design.

## Authoring contract

### Frontmatter (machine-readable, validated by `tools/verticals/validate.mjs`)

```yaml
---
vertical: dental                                      # kebab-case id, matches the filename
label: Dental & Orthodontics                          # human label
aliases: [dentist, orthodontist, dental clinic, ...]  # routing triggers (matched against label + these)
brand_kits: [calm-spa, fintech-trust, mindful-blue]   # Brand Kit slugs, PRIMARY FIRST
prompt_category: health-wellness                      # primary prompt CATEGORY SLUG (browse + fallback)
prompt_slugs: [dental-clinic]                          # specific prompt slugs, PRIMARY FIRST ([] = whole category)
template_slugs: none                                   # `none`, or a list of real template slugs
---
```

Rules (all enforced by the validator):

- **All slug lists are ordered, primary-first.** `[0]` is the default; later entries are alternates/supporting.
- `brand_kits[]`, non-empty; every slug must exist in the Brand Kits library.
- `prompt_category`, the category **slug** (`health-wellness`, `automotive`, …), not the label.
- `prompt_slugs`, `[]` means "use the whole `prompt_category`"; otherwise every slug must exist.
  A slug may live in a **different** category than `prompt_category` (cross-category pull), that's
  allowed and produces only a *warning* so it stays a reviewed, deliberate choice.
- `template_slugs`, the literal `none` (build from structure), or a list of slugs that exist in the
  Templates library. An empty `[]` is an error, use `none`.

### Body sections (required, in this order)

1. **Brand voice & tone**
2. **Target keywords**
3. **Page set & structure**
4. **Recommended library combo**  ← the heart of the file
5. **Conversion patterns**
6. **Compliance & credibility notes**

Keep advice vertical-*specific* (real keywords, real compliance, real conversion patterns), generic "be professional" filler fails the spirit of the pack. Files give web-structure and
copy-tone guidance only, never actual legal/medical/financial advice; point users to a
professional and to add the appropriate disclaimer.

## Validating

From the plugin root, after `node tools/verticals/sync-slugs.mjs`:

```bash
node tools/verticals/validate.mjs
```
