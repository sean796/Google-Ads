---
title: Generated Files & WordPress Upload JSONs
slug: aiseo/generated-files
section: AISEO & Details Contract
order: 30
related:
  - aiseo/overview
  - aiseo/element-library
  - mastra/workflows-and-steps
---

<!-- manual -->

Every Content Optimizer run (Modular AISEO Elements, Blog Optimization, and Research All) writes downloadable proof files into `urlGeneratedFiles[url]` and surfaces them on the per-row download buttons in the **Details** drawer.

## Core Proof Files on Every Upload Row

### 1. `wordpress.json` (WordPress Upload Receipt)

Attached to the **`WordPress upload`** slot on every row via `buildOverviewRowWpUploadProofFiles` (`src/lib/overview/overview-wp-upload-harness-artifacts.ts`) and `attachWordPressUploadProofToFileManager`.

```json
{
  "success": true,
  "skipped": false,
  "pageUrl": "https://example.com/custom-window-blinds/",
  "wordpressSite": "https://example.com",
  "wordpressSiteId": "site-1",
  "wordpressSiteName": "Example Site",
  "uploadedAt": "2026-10-15T15:30:00.000Z",
  "postId": 1042,
  "postType": "post",
  "method": "neo-pulse-seo-v1",
  "httpStatus": 200,
  "link": "https://example.com/custom-window-blinds/"
}
```

### 2. `upload-payload-{slug}.json` (Exact Request Payload Sent to WordPress)

Preserved alongside `wordpress.json` in `filterAiseoRowDisplayFiles` (`src/lib/overview/overview-aiseo-row-artifacts.ts`) so operators can inspect the exact fields (`postTitle`, `postExcerpt`, `postContent`, `acf.keyword_focus`, `acf.faq`, `acf.seo_research`, `acf.date_modifier`, `rankMathMeta`) sent to WordPress.

### 3. `content-{slug}.html` (Exact `post_content` HTML)

Attached to the **`Post content`** slot via `buildAiseoPostContentHtmlFile(url, html)`. Contains the exact HTML bytes written to WordPress `post_content`.

---

## Element-Specific Artifact Files

| Filename | Produced By (`runKind`) | Content Format | Description |
| --- | --- | --- | --- |
| `ai-all-meta.json` | `aiAllMeta` | JSON | `{ url, focusKeyword, title, metaDescription }` produced by the All Meta batch agent |
| `ai-title.json` | `aiTitle` | JSON | `{ url, title, aiTitle }` produced by Title optimization |
| `ai-meta.json` | `aiMeta` | JSON | `{ url, metaDescription, aiMeta }` produced by Meta Description optimization |
| `focus-keyword.json` | `contentKw`, `entityKw` | JSON | `{ url, focusKeyword, mode }` produced by Keyword derivation |
| `ai-url.json` | `aiUrl` | JSON | `{ url, aiSuggestedPath, redirect }` produced by URL slug optimization |
| `faq.json` | `aiFaq` | JSON | `{ url, focusKeyword, entries: [{ question, answer }] }` written to ACF `faq` |
| `headers-plan.json` | `aiHeaders` | JSON | `{ url, h2Actions, leadingH2 }` H2 replacement plan |
| `cleanup.json` | `contentCleanup` | JSON | `{ url, removedH1Count, convertedTableCount }` HTML hygiene report |
| `links-plan.json` | `aiLinks` | JSON | `{ url, replacedLinks, addedLinks }` internal linking audit and weave report |
| `wikipedia-link.json` | `aiWikipediaLink` | JSON | `{ url, entity, wikiTitle, wikiUrl, anchor }` Wikipedia entity citation report |
| `answer.html` | `aiAnswer` | HTML | Standalone `<h2>Answer</h2>` direct-answer HTML block |
| `overview.html` | `aiOverview` | HTML | Standalone `<h2>Overview</h2>` summary + `#anchor` bullet list HTML block |
| `scenario.json` | `aiScenario` | JSON | `{ h2Title, html, persona }` for the `[ILLUSTRATIVE]` `Scenario:` section |
| `in-content-image.md` | `aiInContentImage` | Markdown | Section selection, checklist, reference provenance, and uploaded media URL report |
| `image-requirements.json` | `aiFeaturedImage` | JSON | Featured image checklist requirements + `google-image.png` + `openrouter-image.png` |
| `extra-text.html` | `extraText` | HTML | Staged `<h2>` + `<h3>` HTML written to ACF `seo_extra_text` |
| `seo_brief__{kw}.json` | `research` | JSON | Full merged `SeoContentBriefV1` JSON (DataForSEO SERP + GSC + Semrush + LLM QFO audit) |
| `checklist-{slug}.txt` | `content` | Text | Sanitized numbered section checklist for Blog Optimization |
| `blueprint-{slug}.json` | `content` | JSON | Structured multi-agent blog blueprint (`title`, `purpose`, `agents[]`) |
| `link-targets-{slug}.json` | `content` | JSON | Pre-matched internal link targets per body section |
| `content-{slug}.md` | `content` | Markdown | Full article Markdown projection alongside `content-{slug}.html` |
| `implementation-report-{slug}.md` | `content` | Markdown | Executive implementation report (Director reasoning + GSC/Semrush strategy + before/after H2, link, FAQ, and word-count diffs) |
