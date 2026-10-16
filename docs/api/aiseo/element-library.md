---
title: AISEO Element Library
slug: aiseo/element-library
section: AISEO & Details Contract
order: 10
related:
  - aiseo/overview
  - aiseo/generated-files
  - mastra/overview
  - mastra/agent-registry
---

<!-- manual -->

Complete library of every **AISEO** element and pipeline in NEO Pulse (`src/lib/overview/overview-aiseo-row-artifacts.ts`). Each entry documents its **Category**, **`runKind`**, **Pipeline Agent** (from `Dashboard -> AI & Models`), **Reason / SEO Purpose**, **Details Drawer Slots**, and **Generated Files**.

## Summary Matrix

| Element | `runKind` | Category | Pipeline Agent | Element Artifact | Details Drawer Slots |
| --- | --- | --- | --- | --- | --- |
| **Research All** | `research` | `research` | `Research agent` | `seo_brief__{kw}.json` | 8 Research Steps (`DataForSEO SERP` .. `Brief upload`) |
| **Keywords (Content)** | `contentKw` | `research` | `Meta agent` | `focus-keyword.json` | `AI keywords (content)` -> `Post content` -> `WordPress upload` |
| **Keywords (Entity / SAP)** | `entityKw` | `research` | `Meta agent` | `focus-keyword.json` | `Entity keywords` -> `Post content` -> `WordPress upload` |
| **All Meta** | `aiAllMeta` | `meta` | `Meta agent` | `ai-all-meta.json` | `All Meta` -> `Post content` -> `WordPress upload` |
| **Titles** | `aiTitle` | `meta` | `Meta agent` | `ai-title.json` | `AI titles` -> `Post content` -> `WordPress upload` |
| **Meta Description (MD)** | `aiMeta` | `meta` | `Meta agent` | `ai-meta.json` | `AI meta` -> `Post content` -> `WordPress upload` |
| **URLs** | `aiUrl` | `meta` | Deterministic | `ai-url.json` | `AI URL paths` -> `Post content` -> `WordPress upload` |
| **FAQs** | `aiFaq` | `meta` | `Meta agent` | `faq.json` | `FAQ` -> `Post content` -> `WordPress upload` |
| **Blog Optimization (Content)** | `content` | `content` | `Research` + `Blog agent` | `blueprint-*.json`, `content-*.html` | `Checklist` -> `Blueprint` -> `Link targets` -> `[Body H2s]` -> `Post content` -> `Content Markdown` -> `WordPress upload` |
| **Extra Text** | `extraText` | `content` | `Research agent` | `extra-text.html` | `Extra text` -> `Post content` -> `WordPress upload` |
| **Headers** | `aiHeaders` | `content` | `Blog agent` | `headers-plan.json` | `Headers` -> `Post content` -> `WordPress upload` |
| **Clean Up** | `contentCleanup` | `content` | Deterministic | `cleanup.json` | `Clean Up` -> `Post content` -> `WordPress upload` |
| **Links** | `aiLinks` | `content` | `Blog agent` | `links-plan.json` | `Links` -> `Post content` -> `WordPress upload` |
| **Wikipedia link** | `aiWikipediaLink` | `content` | `Research agent` | `wikipedia-link.json` | `Wikipedia link` -> `Post content` -> `WordPress upload` |
| **Answer** | `aiAnswer` | `content` | `Blog agent` | `answer.html` | `Answer` -> `Post content` -> `WordPress upload` |
| **Overview** | `aiOverview` | `content` | `Blog agent` | `overview.html` | `Overview` -> `Post content` -> `WordPress upload` |
| **Scenario** | `aiScenario` | `content` | `Research` + `Blog agent` | `scenario.json` | `Case scenario` -> `Post content` -> `WordPress upload` |
| **In Content Image** | `aiInContentImage` | `image` | `Research` + `Image agent` | `in-content-image.md` | `In content image` -> `Post content` -> `WordPress upload` |
| **Featured image** | `aiFeaturedImage` | `image` | `Research` + `Image` + `Meta agent` | `image-requirements.json`, `openrouter-image.png` | `Featured image` -> `Post content` -> `WordPress upload` |
| **WordPress Upload** | `wpUpload` | `site` | Deterministic | `wordpress.json` | `Post content` -> `WordPress upload` |

---

## 1. Research Category (`category: "research"`)

### Research All (`runKind: "research"`)
- **Pipeline Agent:** `Research agent` (`getResearchModel(siteId)`) for topic fan-out planning, factual verification, and first-party claim extraction; `openai/gpt-4o-mini:online` for live web QFO audit.
- **Reason:** Builds the authoritative `SeoContentBriefV1` JSON (`seo_research` ACF field) combining live DataForSEO SERP organic results, People Also Ask, Google Search Console page queries, Semrush organic/related keyword enrichment, and localized QFO buyer questions before any meta or body copy is written.
- **Details Drawer Slots (8):**
  1. `DataForSEO SERP` (`research-{kw}-dataforseo-serp.json`)
  2. `GSC CSV` (`gsc_*.csv`)
  3. `Semrush enrichment` (`research-{kw}-semrush-enrichment.json`)
  4. `LLM audit` (`research-{kw}-llm-audit.json`)
  5. `SERP dump load` (`research-{kw}-serp-dump-load.json`)
  6. `GSC quick-wins context` (`research-{kw}-gsc-quick-wins-context.json`)
  7. `Brief merge` (`seo_brief__{kw}.json`)
  8. `Brief upload` (`wordpress.json` + `upload-payload-{slug}.json`)

### Keywords — Content (`runKind: "contentKw"`)
- **Pipeline Agent:** `Meta agent` (`getMetaModel(siteId)`)
- **Reason:** Derives a 2-5 word short-tail, intent-focused primary SEO keyword (`keyword_focus` in ACF and Rank Math) from the URL path hint, page title, meta description, and research brief without brand names.
- **Details Drawer Slots:** `AI keywords (content)` (`focus-keyword.json`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

### Keywords — Entity / SAP (`runKind: "entityKw"`)
- **Pipeline Agent:** `Meta agent` (`getMetaModel(siteId)`)
- **Reason:** Derives a localized service-area focus keyword (`[Service] [Neighborhood/City] [ST]`, up to 6 words) from the SAP URL, title, meta description, and business NAP profile.
- **Details Drawer Slots:** `Entity keywords` (`focus-keyword.json`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

---

## 2. Meta Category (`category: "meta"`)

### All Meta (`runKind: "aiAllMeta"`)
- **Pipeline Agent:** `Meta agent` (`getMetaModel(siteId)`)
- **Reason:** Optimizes Title (when eligible), Meta Description (130-150 chars), and ACF FAQ pairs in one coordinated pass grounded in the row's `seo_research` brief, then uploads all updated fields to WordPress.
- **Details Drawer Slots:** `All Meta` (`ai-all-meta.json`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

### Titles (`runKind: "aiTitle"`)
- **Pipeline Agent:** `Meta agent` (`getMetaModel(siteId)`)
- **Reason:** Rewrites the post title (50-60 chars) in Title Case with natural focus-keyword weaving, no colons, no leading brand/site name, and anti-clickbait rules (excluded on static `pages` scope; runs on `posts` and `sap`).
- **Details Drawer Slots:** `AI titles` (`ai-title.json`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

### Meta Description / MD (`runKind: "aiMeta"`)
- **Pipeline Agent:** `Meta agent` (`getMetaModel(siteId)`)
- **Reason:** Writes a 130-150 character SERP meta description containing the exact focus keyword phrase and specific value proposition from the research brief or GSC quick-wins context.
- **Details Drawer Slots:** `AI meta` (`ai-meta.json`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

### URLs (`runKind: "aiUrl"`)
- **Pipeline Agent:** Deterministic (`computeOverviewAiUrlSuggestion`)
- **Reason:** Suggests a clean, keyword-aligned URL path segment and generates a Rank Math 301 redirect CSV row when the current permalink slug does not match the focus keyword.
- **Details Drawer Slots:** `AI URL paths` (`ai-url.json`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

### FAQs (`runKind: "aiFaq"`)
- **Pipeline Agent:** `Meta agent` (`getMetaModel(siteId)`)
- **Reason:** Generates or refreshes conversational buyer FAQ pairs grounded in the SERP brief and primary city context, writes them to the ACF `faq` field, generates an FAQ intro paragraph, and appends the HTML FAQ block to `post_content`.
- **Details Drawer Slots:** `FAQ` (`faq.json`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

---

## 3. Content Category (`category: "content"`)

### Blog Optimization / Content (`runKind: "content"`)
- **Pipeline Agent:** `Research agent` (`getResearchModel(siteId)`) for `Checklist`, `Blueprint`, and `Link targets`; `Blog agent` (`getBlogModel(siteId)`) for all section writers and HTML quality control.
- **Reason:** Rebuilds the full article body using the existing research brief on the row without re-running SERP/GSC research. Plans the checklist and blueprint, matches internal link targets from the site inventory, writes `Answer`, `Overview`, and every body H2 section, stitches and sanitizes the HTML, and uploads to WordPress.
- **Details Drawer Slots:** `Checklist` -> `Blueprint` -> `Link targets` -> `[Answer, Overview, Body H2 Sections...]` -> `Post content` -> `Content Markdown` -> `WordPress upload`.

### Extra Text (`runKind: "extraText"`)
- **Pipeline Agent:** `Research agent` (`getResearchModel(siteId)`)
- **Reason:** Generates two-part supplementary HTML (`<h2>` + intro and `<h3>` + body) with exact focus-keyword headings and verified internal links for the page's `seo_extra_text` ACF field.
- **Details Drawer Slots:** `Extra text` (`extra-text.html`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

### Headers (`runKind: "aiHeaders"`)
- **Pipeline Agent:** `Blog agent` (`getBlogModel(siteId)`)
- **Reason:** Audits all existing `<h2>` headings in the post body against GSC queries, focus keyword, and SERP brief, replacing generic headings (`Introduction`, `Conclusion`, `Section N`) and weak headings with topical SEO headings while leaving body paragraphs intact.
- **Details Drawer Slots:** `Headers` (`headers-plan.json`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

### Clean Up (`runKind: "contentCleanup"`)
- **Pipeline Agent:** Deterministic (`cleanupOverviewPostContent`)
- **Reason:** Performs deterministic HTML hygiene on existing post bodies by removing duplicate in-body `<h1>` tags (since the WordPress title is the page H1) and converting raw Markdown pipe tables into HTML `<table>` elements.
- **Details Drawer Slots:** `Clean Up` (`cleanup.json`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

### Links (`runKind: "aiLinks"`)
- **Pipeline Agent:** `Blog agent` (`getBlogModel(siteId)`)
- **Reason:** Scans paragraphs and existing internal links against the connected site's verified Posts/Pages/SAP link pool, replacing broken/duplicate/self links and weaving one natural internal link per eligible paragraph.
- **Details Drawer Slots:** `Links` (`links-plan.json`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

### Wikipedia link (`runKind: "aiWikipediaLink"`)
- **Pipeline Agent:** `Research agent` (`getResearchModel(siteId)`) + MediaWiki API
- **Reason:** Resolves the verified Wikipedia article for the row's geographic entity or primary topic and inserts an external `<a href="https://en.wikipedia.org/wiki/...">` link at the earliest natural mention in the body HTML.
- **Details Drawer Slots:** `Wikipedia link` (`wikipedia-link.json`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

### Answer (`runKind: "aiAnswer"`)
- **Pipeline Agent:** `Blog agent` (`getBlogModel(siteId)`)
- **Reason:** Generates or replaces the leading `<h2 id="neo-pulse-harness-answer">Answer</h2>` section at the top of the article with a direct, citation-ready answer paragraph grounded in first-party claims and verified facts.
- **Details Drawer Slots:** `Answer` (`answer.html`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

### Overview (`runKind: "aiOverview"`)
- **Pipeline Agent:** `Blog agent` (`getBlogModel(siteId)`)
- **Reason:** Generates or replaces the `<h2 id="neo-pulse-harness-overview">Overview</h2>` section with a lead summary and bold-labeled `<ul><li><strong>Label</strong>: ... <a href="#section-id">anchor</a>.</li></ul>` jump links to every body H2.
- **Details Drawer Slots:** `Overview` (`overview.html`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

### Scenario (`runKind: "aiScenario"`)
- **Pipeline Agent:** `Research agent` (`getResearchModel(siteId)`) for persona extraction and section placement; `Blog agent` (`getBlogModel(siteId)`) for writing the HTML block.
- **Reason:** Creates or replaces the article's `[ILLUSTRATIVE]` worked example (`<h2>Scenario: {Topical Title}</h2>`, third-person decision intro `<p>`, named persona `<blockquote>`, and `<h3>Recommendation: {Pick}</h3>` with site-first guidance).
- **Details Drawer Slots:** `Case scenario` (`scenario.json`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

---

## 4. Image Category (`category: "image"`)

### In Content Image (`runKind: "aiInContentImage"`)
- **Pipeline Agent:** `Research agent` (`getResearchModel(siteId)`) for H2 section selection, checklist, and Google Images reference vision; `Image agent` (`getImageModel(siteId)`) for image generation.
- **Reason:** Picks the best H2 section for visual support, generates a grounded 16:9 photo/infographic (or reuses/generates a local place photo on SAP pages via `Find Local Image` / `Generate Local`), uploads to WordPress Media with keyword alt/title/filename, and inserts `<figure>` after the H2.
- **Details Drawer Slots:** `In content image` (`in-content-image.md`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

### Featured image (`runKind: "aiFeaturedImage"`)
- **Pipeline Agent:** `Research agent` (`getResearchModel(siteId)`) for image checklist and reference grounding; `Image agent` (`getImageModel(siteId)`) for image generation; `Meta agent` (`getMetaModel(siteId)`) for SEO filename slug.
- **Reason:** Generates an `image-requirements.json` checklist from the post body, grounds references via DataForSEO Google Images (`google-image.png`), generates a 16:9 featured image (`openrouter-image.png`), uploads to WordPress Media, and updates `featured_media` on the post.
- **Details Drawer Slots:** `Featured image` (`image-requirements.json`) -> `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).

---

## 5. Site Category (`category: "site"`)

### WordPress Upload (`runKind: "wpUpload"`)
- **Pipeline Agent:** Deterministic (`runOverviewWpUploadBatch`)
- **Reason:** Uploads all staged row edits (title, meta description, focus keyword, FAQ, date modifier, and optimized post content) to WordPress REST/plugin endpoints and writes per-row upload receipts.
- **Details Drawer Slots:** `Post content` (`content-{slug}.html`) -> `WordPress upload` (`wordpress.json`).
