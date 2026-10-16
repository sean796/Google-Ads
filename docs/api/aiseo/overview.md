---
title: AISEO & Details Drawer Architecture
slug: aiseo/overview
section: AISEO & Details Contract
order: 0
related:
  - aiseo/element-library
  - aiseo/generated-files
  - mastra/overview
  - mastra/agents-and-models
---

<!-- manual -->

**AISEO** is the Content Optimizer pipeline system in NEO Pulse (`Generator -> Opt`). Every operation in the Content Optimizer follows one of **three strict Details Drawer & Generated Files contracts** so that progress rows, downloadable artifacts, and WordPress upload receipts behave identically across the platform.

## Three Unified Contracts

| Contract | Scope (`runKind`) | Details Drawer Row Structure | WordPress Upload Proof |
| --- | --- | --- | --- |
| **1. Modular AISEO Element** | `aiAllMeta`, `aiTitle`, `aiMeta`, `aiUrl`, `aiFaq`, `contentKw`, `entityKw`, `aiHeaders`, `contentCleanup`, `aiLinks`, `aiWikipediaLink`, `aiAnswer`, `aiOverview`, `aiScenario`, `aiInContentImage`, `aiFeaturedImage`, `extraText`, `wpUpload` | Fixed 3-slot row: `<Element Slot>` -> `Post content` -> `WordPress upload` (2-slot for `wpUpload`) | `wordpress.json` + `upload-payload-{slug}.json` |
| **2. Blog Optimization** | `content` (`AISEO -> Content -> Content`) | `Checklist` -> `Blueprint` -> `Link targets` -> `[Dynamic Blog H2 Sections...]` -> `Post content` -> `Content Markdown` -> `Implementation report` -> `WordPress upload` | `wordpress.json` + `upload-payload-{slug}.json` |
| **3. Research Pipeline** | `research` (`AISEO -> Research -> All`) | 8 Research steps: `DataForSEO SERP` -> `GSC CSV` -> `Semrush enrichment` -> `LLM audit` -> `SERP dump load` -> `GSC quick-wins context` -> `Brief merge` -> `Brief upload` | `wordpress.json` + `seo_brief__{kw}.json` |

## Design Rules

### 1. Every Modular AISEO Element Uses the Same Minimal 3-Slot Contract

When running any modular AISEO action (whether single-row or bulk across pages, posts, or SAP service-area pages), each row in the **Details** drawer renders the same three slots defined in `src/lib/overview/overview-aiseo-row-artifacts.ts` (`AISEO_ROW_ARTIFACT_REGISTRY`):

1. **Element Artifact Slot** (for example `AI titles`, `AI meta`, `All Meta`, `AI keywords (content)`, `Entity keywords`, `FAQ`, `Headers`, `Links`, `Answer`, `Overview`, `Case scenario`, `In content image`, `Featured image`, `Extra text`, `Clean Up`, `Wikipedia link`, `AI URL paths`) linked to its downloadable JSON/HTML/MD file.
2. **`Post content`** linked to `content-{slug}.html` (the exact HTML body on the post).
3. **`WordPress upload`** linked to `wordpress.json` (plus `upload-payload-{slug}.json` in Generated Files).

### 2. Blog Optimization Runs the Blog Sections Only (No Research Steps)

Running **Blog Optimization** (`AISEO -> Content -> Content`, `runKind: "content"`) uses the stored research brief already attached to the row or WordPress ACF `seo_research` field. Its Details drawer pipeline (`CONTENT_OPTIMIZE_PIPELINE_TITLES` in `src/lib/overview/overview-content-optimize-pipeline.ts`) never renders research steps (`Keyword research`, `Selected keyword`, `SERP research brief`) and never emits internal word-blacklist prompts into progress messages:

1. `Checklist` (`checklist-{slug}.txt`)
2. `Blueprint` (`blueprint-{slug}.json`)
3. `Link targets` (`link-targets-{slug}.json`)
4. **Dynamic Blog H2 Sections** (`Answer`, `Overview`, and each body H2 section from the blueprint)
5. `Post content` (`content-{slug}.html`)
6. `Content Markdown` (`content-{slug}.md`)
7. `Implementation report` (`implementation-report-{slug}.md`)
8. `WordPress upload` (`wordpress.json` + `upload-payload-{slug}.json`)

### 3. Zero Cross-Run State Bleed

- `optimizationFileManagers[siteId]` is strictly isolated to `runKind === "content"` in `src/lib/content-optimization/content-optimizer-bulk-generator-bindings.ts`.
- Modular AISEO runs (`isAiseoFileSlotRunKind(runKind)`) read only from `bulkState.urlGeneratedFiles[url]` filtered through `filterAiseoRowDisplayFiles(runKind, files)`.
- Research runs (`runKind === "research"`) render only the 8 `RESEARCH_HARNESS_SECTION_TITLES` steps and their research artifacts.

## Source Files

| Module | Responsibility |
| --- | --- |
| `src/lib/overview/overview-aiseo-row-artifacts.ts` | Canonical `AISEO_ROW_ARTIFACT_REGISTRY`, `listAiseoElementLibrary()`, 3-slot display builder, and file filter |
| `src/lib/overview/overview-content-optimize-pipeline.ts` | Blog Optimization pipeline (`Checklist` -> `Blueprint` -> `Link targets` -> `[Body H2s]` -> `Post content` -> `Content Markdown` -> `WordPress upload`) |
| `src/lib/overview/overview-research-harness-sections.ts` | 8-step Research All pipeline (`RESEARCH_HARNESS_SECTION_TITLES`) |
| `src/lib/overview/overview-aiseo-after-upload.ts` | Per-row WordPress upload and `wordpress.json` + `upload-payload-{slug}.json` attachment |
| `src/lib/content-optimization/content-optimizer-bulk-generator-bindings.ts` | Binds active batch state to `BulkGeneratorDetailsDrawer` with zero cross-run bleed |
