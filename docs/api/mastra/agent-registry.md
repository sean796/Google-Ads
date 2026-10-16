---
title: Pulse Agent Registry (37 Agents)
slug: mastra/agent-registry
section: Mastra
order: 30
related:
  - mastra/overview
  - mastra/workflows-and-steps
  - mastra/agents-and-models
  - aiseo/element-library
---

<!-- manual -->

Complete catalog of every registered agent in `PULSE_AGENT_REGISTRY` (`src/lib/agent-pipeline/pulse-agent-registry.ts`). Every entry is bound to a category variable (`resolveModelForAgentCategory(entry.category, siteId)`) and validated by `src/lib/__tests__/universal-agent-contract.test.ts`.

## Full Agent Catalog

| Agent ID | Domain | Category | Label | Reason | Source Module |
| --- | --- | --- | --- | --- | --- |
| `aiseo.meta.all-meta-batch` | `aiseo` | `meta` | AISEO All Meta Batch Agent | Generates coordinated SEO Title and Meta Description grounded in the row research brief. | `src/lib/overview/overview-ai-all-meta-batch-agent.ts` |
| `aiseo.meta.title` | `aiseo` | `meta` | AISEO Title Optimizer | Rewrites a single page or post title in Title Case with natural focus-keyword weaving. | `src/hooks/overview/use-overview-ai-optimize.ts` |
| `aiseo.meta.description` | `aiseo` | `meta` | AISEO Meta Description Optimizer | Writes a 130-150 character SERP meta description containing the exact focus keyword phrase. | `src/hooks/overview/use-overview-ai-optimize.ts` |
| `aiseo.meta.faq` | `aiseo` | `meta` | AISEO FAQ & Schema Writer | Generates conversational buyer Q&A pairs for ACF FAQ schema and appends the FAQ section. | `src/lib/overview/overview-faq-harness-run.ts` |
| `aiseo.meta.faq-intro` | `aiseo` | `meta` | AISEO FAQ Intro Paragraph Agent | Writes a one-paragraph editorial lead-in before the appended FAQ H2 section. | `src/lib/overview/overview-blog-faq-intro-agent.ts` |
| `aiseo.research.keywords-content` | `aiseo` | `meta` | AISEO Content Focus Keyword Deriver | Derives a 2-5 word short-tail primary focus keyword (`keyword_focus`) from URL path, title, meta, and brief. | `src/lib/overview/overview-keyword-batch-agent.ts` |
| `aiseo.research.keywords-entity` | `aiseo` | `meta` | AISEO Entity SAP Keyword Deriver | Derives a localized service-area focus keyword (`[Service] [Neighborhood/City] [ST]`) from URL, title, and NAP. | `src/lib/overview/overview-keyword-batch-agent.ts` |
| `aiseo.research.topic-fanout-planner` | `aiseo` | `research` | Topic Fan-Out Query Planner | Plans localized buyer research questions and named government/utility programs for SERP and QFO web audits. | `src/lib/content-optimization/topic-research-fanout-orchestration.ts` |
| `aiseo.research.factual-verification` | `aiseo` | `research` | Factual Verification Planner & Extractor | Extracts checkable claims from page copy and verifies figures against official government domains. | `src/lib/content-optimization/topic-research-fanout-verification.ts` |
| `aiseo.research.first-party-claims` | `aiseo` | `research` | First-Party Authority Claims Extractor | Extracts verifiable first-party business facts from ChatGPT authority responses, SWOT notes, and GBP Master Rules. | `src/lib/content-optimization/topic-research-fanout-orchestration.ts` |
| `aiseo.research.illustrative-persona` | `aiseo` | `research` | Illustrative Scenario Persona Extractor | Extracts a named buyer persona, decision hook, blockquote narrative, and site-first recommendation. | `src/lib/content-optimization/topic-research-fanout-illustrative.ts` |
| `aiseo.research.authority-links` | `aiseo` | `research` | LLM Audit Authority Link Classifier | Classifies non-competing government, municipal, education, and news URLs from the LLM audit. | `src/lib/llm-audit/llm-audit-authority-links.ts` |
| `aiseo.content.headers` | `aiseo` | `blog` | AISEO Blog Headers Planner | Audits existing H2 headings against GSC queries and SERP brief to replace generic or weak H2s. | `src/lib/overview/overview-blog-headers-plan-stream.ts` |
| `aiseo.content.links` | `aiseo` | `blog` | AISEO Internal Links Intent Agent | Selects contextual internal link destinations and natural 2-5 word anchors from verified site inventory. | `src/lib/overview/overview-blog-links-link-intent.ts` |
| `aiseo.content.answer` | `aiseo` | `blog` | AISEO Direct Answer Section Writer | Writes or replaces the leading `<h2>Answer</h2>` section for AI Overviews and featured snippets. | `src/lib/overview/overview-blog-overview-prepend.ts` |
| `aiseo.content.overview` | `aiseo` | `blog` | AISEO Overview & Scroll Citations Writer | Writes the `<h2>Overview</h2>` summary and bold-label key-point bullets with `#anchor` jump links. | `src/lib/overview/overview-blog-overview-prepend.ts` |
| `aiseo.content.scenario-placement` | `aiseo` | `research` | AISEO Scenario Placement Analyzer | Selects which existing body H2 the `[ILLUSTRATIVE]` scenario should follow and generates its `Scenario:` H2 title. | `src/lib/overview/overview-blog-scenario-placement-agent.ts` |
| `aiseo.content.scenario-writer` | `aiseo` | `blog` | AISEO Scenario Section Writer | Writes the HTML `Scenario:` H2 section with general decision hook, persona blockquote, and `Recommendation:` H3. | `src/lib/overview/overview-blog-scenario-section.ts` |
| `aiseo.content.extra-text` | `aiseo` | `research` | AISEO Page Extra Text Writer | Generates staged `<h2>` + `<h3>` supplementary HTML with internal links for the `seo_extra_text` ACF field. | `src/lib/content-generation/page-extra-content-generator.ts` |
| `aiseo.content.elementor` | `aiseo` | `blog` | AISEO Elementor Section & Page Optimizer | Breaks down Elementor JSON layout and rewrites section headings, body copy, and internal links in place. | `src/lib/elementor-page-content/run-elementor-harness-row.ts` |
| `blog.checklist.generator` | `blog-generator` | `research` | Blog Template Checklist Generator | Builds a numbered, intent-ordered section checklist from SERP PAA, Semrush clusters, and research brief. | `src/lib/blog-template-checklist-generate.ts` |
| `blog.blueprint.generator` | `blog-generator` | `research` | Blog Multi-Agent Blueprint Generator | Transforms a section checklist into a structured JSON blueprint of section writer agents. | `src/lib/blog-template-blueprint-generate.ts` |
| `blog.harness.section-writer` | `blog-generator` | `blog` | Blog Harness Section Writer (Worker) | Streams HTML or Markdown for each blueprint section in parallel Web Workers. | `src/lib/bulk/bulk-markdown-content-harness.ts` |
| `blog.harness.html-qc` | `blog-generator` | `blog` | Harness HTML Quality Control Agent | Repairs leaked markdown or malformed tags in stitched harness HTML before WordPress upload. | `src/lib/content-generation/harness-html-quality-control.ts` |
| `blog.ideas.prompt-bulk` | `blog-generator` | `research` | Prompt Bulk Ideas & Keyword Focus Agent | Generates and refines non-cannibalizing blog ideas, titles, and focus keywords from a seed prompt. | `src/lib/bulk/prompt-bulk-ideas-refine-agent.ts` |
| `blog.slug.seo-generator` | `blog-generator` | `meta` | SEO URL Slug Generator | Generates short, keyword-focused URL slugs for new WordPress posts and SAP pages. | `src/lib/seo-slug-generator.ts` |
| `entity.sap.strategy-from-grid` | `entity-sap` | `research` | Local SEO SAP Strategy & Row Generator | Builds service-area page (SAP) rows, geographic entities, and localized titles from Local Dominator grid data. | `src/lib/local-seo-strategy-from-grid.ts` |
| `entity.sap.title-agent` | `entity-sap` | `meta` | Entity SAP Title Agent | Generates localized SAP titles weaving service keyword and neighborhood/city entity. | `src/lib/local-analysis/entity-sap-title-agent.ts` |
| `entity.sap.meta-agent` | `entity-sap` | `meta` | Entity SAP Meta Description Agent | Generates localized 130-150 character meta descriptions for service-area pages. | `src/lib/local-analysis/entity-sap-meta-agent.ts` |
| `image.checklist.planner` | `aiseo` | `research` | Image Requirements Checklist Planner | Analyzes article or section copy to produce visual scene requirements and physical plausibility constraints. | `src/lib/image-generator/run-image-checklist.ts` |
| `image.reference.vision-picker` | `aiseo` | `research` | Google Images Reference Vision Picker | Scores DataForSEO Google Images candidates via multimodal vision to ground AI image generation. | `src/lib/image-reference-research.ts` |
| `image.generator.openrouter` | `aiseo` | `image` | OpenRouter Multimodal Image Generator | Generates 16:9 or 1:1 featured, in-content, and local place images using the configured Image agent model. | `src/lib/image-api.ts` |
| `image.filename.seo-slug` | `aiseo` | `meta` | SEO Image Filename Slug Generator | Generates a clean 3-8 word hyphenated SEO filename slug for uploaded WordPress media. | `src/lib/image-filename-generator.ts` |
| `sitemap.optimizer.cluster` | `sitemap-optimizer` | `research` | Sitemap Semantic Cluster & Merge Agent | Clusters site URLs by topic/entity, detects keyword cannibalization, and proposes 301 consolidation plans. | `src/lib/sitemap-optimizer/sitemap-optimizer-cluster-agent.ts` |
| `competitor.research.cluster` | `competitor-research` | `research` | Competitor Keyword Semantic Cluster Agent | Clusters seed and competitor keywords into non-overlapping buyer intent groups. | `src/lib/competitor-research/competitor-keyword-cluster-openrouter.ts` |
| `competitor.research.report` | `competitor-research` | `research` | Competitor Strategy Report Writer | Synthesizes competitor keyword gaps, traffic tiers, and backlink profiles into an executive SEO strategy report. | `src/lib/competitor-research/competitor-report-agent.ts` |
| `reporting.gsc.section-writer` | `reporting` | `report` | GSC Performance Report Agent | Plans and writes month-over-month Google Search Console executive report sections. | `src/lib/gsc-reporting/gsc-reporting-agent-harness.ts` |
| `reporting.organic.highlights` | `reporting` | `report` | Organic Dashboard Highlights Agent | Summarizes GA4 + GSC + WordPress publishing velocity into client-ready organic highlights. | `src/lib/organic-dashboard/organic-reporting-highlights.ts` |
| `reporting.chat.call-summary` | `reporting` | `report` | Workplace Call Transcript Summarizer | Summarizes speaker-labeled call transcripts into concise notes and owner-assigned action items. | `src/lib/chat-call-summary.ts` |
| `ads.ppc.reporting` | `ppc-ads` | `ads` | Google Ads & PPC Reporting Agent | Analyzes Google Ads campaign, ad group, and conversion metrics to write PPC performance reports. | `src/lib/ads-reporting/ads-reporting-agent-harness.ts` |
| `ads.ppc.campaign-copy` | `ppc-ads` | `ads` | Google Ads RSA & Meta Ad Copy Agent | Generates Google Ads responsive search ad headlines/descriptions and Meta ad creative briefs and copy. | `src/lib/ppc/run-google-ads-rsa-copy.ts` |
| `video.storyboard.director` | `video` | `research` | Video Brainstorm, Director & Cinematographer Agents | Plans multi-scene video storyboards, camera directions, and narration scripts before HeyGen video rendering. | `src/lib/video-generator/video-director-agent.ts` |
| `video.render.heygen` | `video` | `video` | HeyGen Storyboard-to-Video Agent | Renders storyboard scenes and voice narration into video clips using the configured Video agent model. | `src/components/video-generator/useVideoGenerator.ts` |
| `wikipedia.entity.resolver` | `wikipedia` | `research` | Wikipedia Place & Entity Validation Agent | Validates MediaWiki pages and extracts structured geographic/community facts for local SEO grounding. | `src/lib/wikipedia/validate-wikipedia-place-page-openrouter.ts` |
