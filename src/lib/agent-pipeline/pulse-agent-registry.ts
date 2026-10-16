import { resolveModelForAgentCategory, type AgentOpenRouterCategory } from "@/lib/openrouter-agent-category-api";
import type { PulseAgentDomain, PulseAgentMetadata } from "@/lib/agent-pipeline";

export type PulseRegisteredAgentEntry = PulseAgentMetadata & {
  sourceModule: string;
};

/**
 * Canonical catalog of every OpenRouter LLM agent across Neo Pulse.
 * Every agent resolves its model dynamically via `resolveModelForAgentCategory(entry.category, siteId)`.
 */
export const PULSE_AGENT_REGISTRY: readonly PulseRegisteredAgentEntry[] = [
  // 1. AISEO (Content Optimizer)
  {
    id: "aiseo.meta.all-meta-batch",
    label: "AISEO All Meta Batch Agent",
    category: "meta",
    domain: "aiseo",
    reason: "Generates coordinated SEO Title (50-60 chars) and Meta Description (130-150 chars) grounded in the row research brief.",
    useMasterInstructions: true,
    sourceModule: "src/lib/overview/overview-ai-all-meta-batch-agent.ts",
  },
  {
    id: "aiseo.meta.title",
    label: "AISEO Title Optimizer",
    category: "meta",
    domain: "aiseo",
    reason: "Rewrites a single page or post title in Title Case with natural focus-keyword weaving and zero colons or brand prefixes.",
    useMasterInstructions: true,
    sourceModule: "src/hooks/overview/use-overview-ai-optimize.ts",
  },
  {
    id: "aiseo.meta.description",
    label: "AISEO Meta Description Optimizer",
    category: "meta",
    domain: "aiseo",
    reason: "Writes a 130-150 character SERP meta description containing the exact focus keyword phrase and specific searcher value.",
    useMasterInstructions: true,
    sourceModule: "src/hooks/overview/use-overview-ai-optimize.ts",
  },
  {
    id: "aiseo.meta.faq",
    label: "AISEO FAQ & Schema Writer",
    category: "meta",
    domain: "aiseo",
    reason: "Generates conversational buyer Q&A pairs for ACF FAQ schema and appends the FAQ section with an intro paragraph.",
    useMasterInstructions: true,
    sourceModule: "src/lib/overview/overview-faq-harness-run.ts",
  },
  {
    id: "aiseo.meta.faq-intro",
    label: "AISEO FAQ Intro Paragraph Agent",
    category: "meta",
    domain: "aiseo",
    reason: "Writes a one-paragraph editorial lead-in before the appended FAQ H2 section.",
    sourceModule: "src/lib/overview/overview-blog-faq-intro-agent.ts",
  },
  {
    id: "aiseo.research.keywords-content",
    label: "AISEO Content Focus Keyword Deriver",
    category: "meta",
    domain: "aiseo",
    reason: "Derives a 2-5 word short-tail primary focus keyword (`keyword_focus`) from URL path hint, title, meta, and research brief.",
    useMasterInstructions: true,
    sourceModule: "src/lib/overview/overview-keyword-batch-agent.ts",
  },
  {
    id: "aiseo.research.keywords-entity",
    label: "AISEO Entity SAP Keyword Deriver",
    category: "meta",
    domain: "aiseo",
    reason: "Derives a localized service-area focus keyword (`[Service] [Neighborhood/City] [ST]`) from URL, title, and NAP context.",
    useMasterInstructions: true,
    sourceModule: "src/lib/overview/overview-keyword-batch-agent.ts",
  },
  {
    id: "aiseo.research.topic-fanout-planner",
    label: "Topic Fan-Out Query Planner",
    category: "research",
    domain: "aiseo",
    reason: "Plans localized buyer research questions and named government/utility programs for SERP and QFO web audits.",
    sourceModule: "src/lib/content-optimization/topic-research-fanout-orchestration.ts",
  },
  {
    id: "aiseo.research.factual-verification",
    label: "Factual Verification Planner & Extractor",
    category: "research",
    domain: "aiseo",
    reason: "Extracts checkable claims from page copy and verifies dollar amounts, rates, and program status against official government domains.",
    sourceModule: "src/lib/content-optimization/topic-research-fanout-verification.ts",
  },
  {
    id: "aiseo.research.first-party-claims",
    label: "First-Party Authority Claims Extractor",
    category: "research",
    domain: "aiseo",
    reason: "Extracts verifiable first-party business facts from ChatGPT authority responses, SWOT notes, and GBP Master Rules.",
    sourceModule: "src/lib/content-optimization/topic-research-fanout-orchestration.ts",
  },
  {
    id: "aiseo.research.illustrative-persona",
    label: "Illustrative Scenario Persona Extractor",
    category: "research",
    domain: "aiseo",
    reason: "Extracts a named buyer persona, decision hook, blockquote narrative, and site-first recommendation for `[ILLUSTRATIVE]` sections.",
    sourceModule: "src/lib/content-optimization/topic-research-fanout-illustrative.ts",
  },
  {
    id: "aiseo.research.authority-links",
    label: "LLM Audit Authority Link Classifier",
    category: "research",
    domain: "aiseo",
    reason: "Classifies non-competing government, municipal, education, and news URLs from the LLM audit for external citation weaving.",
    sourceModule: "src/lib/llm-audit/llm-audit-authority-links.ts",
  },
  {
    id: "aiseo.content.headers",
    label: "AISEO Blog Headers Planner",
    category: "blog",
    domain: "aiseo",
    reason: "Audits existing H2 headings against GSC queries and SERP brief to replace generic or weak H2s in place.",
    useMasterInstructions: true,
    sourceModule: "src/lib/overview/overview-blog-headers-plan-stream.ts",
  },
  {
    id: "aiseo.content.links",
    label: "AISEO Internal Links Intent Agent",
    category: "blog",
    domain: "aiseo",
    reason: "Selects contextual internal link destinations and natural 2-5 word anchors from verified site inventory.",
    useMasterInstructions: true,
    sourceModule: "src/lib/overview/overview-blog-links-link-intent.ts",
  },
  {
    id: "aiseo.content.answer",
    label: "AISEO Direct Answer Section Writer",
    category: "blog",
    domain: "aiseo",
    reason: "Writes or replaces the leading `<h2>Answer</h2>` section for AI Overviews and featured snippets.",
    useWordBlacklist: true,
    sourceModule: "src/lib/overview/overview-blog-overview-prepend.ts",
  },
  {
    id: "aiseo.content.overview",
    label: "AISEO Overview & Scroll Citations Writer",
    category: "blog",
    domain: "aiseo",
    reason: "Writes the `<h2>Overview</h2>` summary and bold-label key-point bullets with `#anchor` jump links to body H2s.",
    useWordBlacklist: true,
    sourceModule: "src/lib/overview/overview-blog-overview-prepend.ts",
  },
  {
    id: "aiseo.content.scenario-placement",
    label: "AISEO Scenario Placement Analyzer",
    category: "research",
    domain: "aiseo",
    reason: "Selects which existing body H2 the `[ILLUSTRATIVE]` scenario should follow and generates its topical `Scenario:` H2 title.",
    sourceModule: "src/lib/overview/overview-blog-scenario-placement-agent.ts",
  },
  {
    id: "aiseo.content.scenario-writer",
    label: "AISEO Scenario Section Writer",
    category: "blog",
    domain: "aiseo",
    reason: "Writes the HTML `Scenario:` H2 section with general decision hook, persona blockquote, and `Recommendation:` H3.",
    useWordBlacklist: true,
    sourceModule: "src/lib/overview/overview-blog-scenario-section.ts",
  },
  {
    id: "aiseo.content.extra-text",
    label: "AISEO Page Extra Text Writer",
    category: "research",
    domain: "aiseo",
    reason: "Generates staged `<h2>` + `<h3>` supplementary HTML with internal links for the `seo_extra_text` ACF field.",
    useWordBlacklist: true,
    sourceModule: "src/lib/content-generation/page-extra-content-generator.ts",
  },
  {
    id: "aiseo.content.elementor",
    label: "AISEO Elementor Section & Page Optimizer",
    category: "blog",
    domain: "aiseo",
    reason: "Breaks down Elementor JSON layout and rewrites section headings, body copy, and internal links in place.",
    sourceModule: "src/lib/elementor-page-content/run-elementor-harness-row.ts",
  },

  // 2. Blog Generator & Bulk Pipeline
  {
    id: "blog.checklist.generator",
    label: "Blog Template Checklist Generator",
    category: "research",
    domain: "blog-generator",
    reason: "Builds a numbered, intent-ordered section checklist from SERP PAA, Semrush clusters, and research brief.",
    useWordBlacklist: true,
    sourceModule: "src/lib/blog-template-checklist-generate.ts",
  },
  {
    id: "blog.blueprint.generator",
    label: "Blog Multi-Agent Blueprint Generator",
    category: "research",
    domain: "blog-generator",
    reason: "Transforms a section checklist into a structured JSON blueprint of section writer agents with H2/H3 counts and link assignments.",
    useWordBlacklist: true,
    sourceModule: "src/lib/blog-template-blueprint-generate.ts",
  },
  {
    id: "blog.harness.section-writer",
    label: "Blog Harness Section Writer (Worker)",
    category: "blog",
    domain: "blog-generator",
    reason: "Streams HTML or Markdown for each blueprint section in parallel Web Workers with strict word-blacklist and link-marker rules.",
    useMasterInstructions: true,
    useWordBlacklist: true,
    sourceModule: "src/lib/bulk/bulk-markdown-content-harness.ts",
  },
  {
    id: "blog.harness.html-qc",
    label: "Harness HTML Quality Control Agent",
    category: "blog",
    domain: "blog-generator",
    reason: "Repairs leaked markdown or malformed tags in stitched harness HTML before WordPress upload.",
    sourceModule: "src/lib/content-generation/harness-html-quality-control.ts",
  },
  {
    id: "blog.ideas.prompt-bulk",
    label: "Prompt Bulk Ideas & Keyword Focus Agent",
    category: "research",
    domain: "blog-generator",
    reason: "Generates and refines non-cannibalizing blog ideas, titles, and focus keywords from a seed prompt and site inventory.",
    sourceModule: "src/lib/bulk/prompt-bulk-ideas-refine-agent.ts",
  },
  {
    id: "blog.slug.seo-generator",
    label: "SEO URL Slug Generator",
    category: "meta",
    domain: "blog-generator",
    reason: "Generates short, keyword-focused URL slugs for new WordPress posts and SAP pages.",
    sourceModule: "src/lib/seo-slug-generator.ts",
  },

  // 3. Entity / SAP Generator
  {
    id: "entity.sap.strategy-from-grid",
    label: "Local SEO SAP Strategy & Row Generator",
    category: "research",
    domain: "entity-sap",
    reason: "Builds service-area page (SAP) rows, geographic entities, and localized titles from Local Dominator grid data and Wikipedia pools.",
    useMasterInstructions: true,
    sourceModule: "src/lib/local-seo-strategy-from-grid.ts",
  },
  {
    id: "entity.sap.title-agent",
    label: "Entity SAP Title Agent",
    category: "meta",
    domain: "entity-sap",
    reason: "Generates localized SAP titles weaving service keyword and neighborhood/city entity.",
    useMasterInstructions: true,
    sourceModule: "src/lib/local-analysis/entity-sap-title-agent.ts",
  },
  {
    id: "entity.sap.meta-agent",
    label: "Entity SAP Meta Description Agent",
    category: "meta",
    domain: "entity-sap",
    reason: "Generates localized 130-150 character meta descriptions for service-area pages.",
    useMasterInstructions: true,
    sourceModule: "src/lib/local-analysis/entity-sap-meta-agent.ts",
  },

  // 4. Image Pipeline
  {
    id: "image.checklist.planner",
    label: "Image Requirements Checklist Planner",
    category: "research",
    domain: "aiseo",
    reason: "Analyzes article or section copy to produce visual scene requirements and physical plausibility constraints.",
    sourceModule: "src/lib/image-generator/run-image-checklist.ts",
  },
  {
    id: "image.reference.vision-picker",
    label: "Google Images Reference Vision Picker",
    category: "research",
    domain: "aiseo",
    reason: "Scores DataForSEO Google Images candidates via multimodal vision to ground AI image generation in real place/product photos.",
    sourceModule: "src/lib/image-reference-research.ts",
  },
  {
    id: "image.generator.openrouter",
    label: "OpenRouter Multimodal Image Generator",
    category: "image",
    domain: "aiseo",
    reason: "Generates 16:9 or 1:1 featured, in-content, and local place images using the configured Image agent model.",
    sourceModule: "src/lib/image-api.ts",
  },
  {
    id: "image.filename.seo-slug",
    label: "SEO Image Filename Slug Generator",
    category: "meta",
    domain: "aiseo",
    reason: "Generates a clean 3-8 word hyphenated SEO filename slug for uploaded WordPress media.",
    sourceModule: "src/lib/image-filename-generator.ts",
  },

  // 5. Sitemap Optimizer
  {
    id: "sitemap.optimizer.cluster",
    label: "Sitemap Semantic Cluster & Merge Agent",
    category: "research",
    domain: "sitemap-optimizer",
    reason: "Clusters site URLs by topic/entity, detects keyword cannibalization, and proposes 301 consolidation/merge plans.",
    sourceModule: "src/lib/sitemap-optimizer/sitemap-optimizer-cluster-agent.ts",
  },

  // 6. Competitor Research
  {
    id: "competitor.research.cluster",
    label: "Competitor Keyword Semantic Cluster Agent",
    category: "research",
    domain: "competitor-research",
    reason: "Clusters seed and competitor keywords into non-overlapping buyer intent groups.",
    sourceModule: "src/lib/competitor-research/competitor-keyword-cluster-openrouter.ts",
  },
  {
    id: "competitor.research.report",
    label: "Competitor Strategy Report Writer",
    category: "research",
    domain: "competitor-research",
    reason: "Synthesizes competitor keyword gaps, traffic tiers, and backlink profiles into an executive SEO strategy report.",
    sourceModule: "src/lib/competitor-research/competitor-report-agent.ts",
  },

  // 7. Reporting (GSC & Organic)
  {
    id: "reporting.gsc.section-writer",
    label: "GSC Performance Report Agent",
    category: "report",
    domain: "reporting",
    reason: "Plans and writes month-over-month Google Search Console executive report sections and query cluster insights.",
    sourceModule: "src/lib/gsc-reporting/gsc-reporting-agent-harness.ts",
  },
  {
    id: "reporting.organic.highlights",
    label: "Organic Dashboard Highlights Agent",
    category: "report",
    domain: "reporting",
    reason: "Summarizes GA4 + GSC + WordPress publishing velocity into client-ready organic highlights.",
    sourceModule: "src/lib/organic-dashboard/organic-reporting-highlights.ts",
  },
  {
    id: "reporting.chat.call-summary",
    label: "Workplace Call Transcript Summarizer",
    category: "report",
    domain: "reporting",
    reason: "Summarizes speaker-labeled call transcripts into concise notes and owner-assigned action items.",
    sourceModule: "src/lib/chat-call-summary.ts",
  },

  // 8. PPC & Ads
  {
    id: "ads.ppc.reporting",
    label: "Google Ads & PPC Reporting Agent",
    category: "ads",
    domain: "ppc-ads",
    reason: "Analyzes Google Ads campaign, ad group, and conversion metrics to write PPC performance reports.",
    sourceModule: "src/lib/ads-reporting/ads-reporting-agent-harness.ts",
  },
  {
    id: "ads.ppc.campaign-copy",
    label: "Google Ads RSA & Meta Ad Copy Agent",
    category: "ads",
    domain: "ppc-ads",
    reason: "Generates Google Ads responsive search ad headlines/descriptions and Meta ad creative briefs and copy.",
    sourceModule: "src/lib/ppc/run-google-ads-rsa-copy.ts",
  },

  // 9. Video Generator
  {
    id: "video.storyboard.director",
    label: "Video Brainstorm, Director & Cinematographer Agents",
    category: "research",
    domain: "video",
    reason: "Plans multi-scene video storyboards, camera directions, and narration scripts before HeyGen video rendering.",
    sourceModule: "src/lib/video-generator/video-director-agent.ts",
  },
  {
    id: "video.render.heygen",
    label: "HeyGen Storyboard-to-Video Agent",
    category: "video",
    domain: "video",
    reason: "Renders storyboard scenes and voice narration into video clips using the configured Video agent model.",
    sourceModule: "src/components/video-generator/useVideoGenerator.ts",
  },

  // 10. Wikipedia & Knowledge Graph
  {
    id: "wikipedia.entity.resolver",
    label: "Wikipedia Place & Entity Validation Agent",
    category: "research",
    domain: "wikipedia",
    reason: "Validates MediaWiki pages and extracts structured geographic/community facts for local SEO grounding.",
    sourceModule: "src/lib/wikipedia/validate-wikipedia-place-page-openrouter.ts",
  },

  // 11. Neo EMCP (WordPress & Elementor MCP Engine)
  {
    id: "emcp.audit.site-schema-doctor",
    label: "Neo EMCP Site & Schema Doctor Agent",
    category: "research",
    domain: "emcp",
    reason: "Analyzes neo-pulse/read audit findings, shared business details, and locations to plan dry-run-safe MCP remediation operations.",
    useMasterInstructions: true,
    sourceModule: "src/lib/emcp/neo-emcp-mastra-agents.ts",
  },
  {
    id: "emcp.builder.elementor-architect",
    label: "Neo EMCP Elementor & Widget Architect Agent",
    category: "blog",
    domain: "emcp",
    reason: "Plans Elementor container/widget mutations and Neo Tools widget placements using live site widget schemas.",
    useMasterInstructions: true,
    sourceModule: "src/lib/emcp/neo-emcp-mastra-agents.ts",
  },
  {
    id: "emcp.ops.command-planner",
    label: "Neo EMCP Multi-Tool Command Planner Agent",
    category: "research",
    domain: "emcp",
    reason: "Translates natural-language WordPress, SEO, and Elementor instructions into an ordered sequence of Neo EMCP tool calls with dry_run and expected_version safety.",
    useMasterInstructions: true,
    sourceModule: "src/lib/emcp/neo-emcp-mastra-agents.ts",
  },

  // 12. Forge Workflow & Automation Agents
  {
    id: "workflow.csv.proposed-questions",
    label: "Workflow CSV Proposed Questions Extractor",
    category: "research",
    domain: "aiseo",
    reason: "Extracts proposed conversational search and FAQ questions from upstream CSV research cells for DFS LLM article audits.",
    sourceModule: "src/lib/workflow/extract-csv-proposed-questions.ts",
  },
  {
    id: "reporting.automation.email-intro",
    label: "Automation Email Intro & Meeting Notes Agent",
    category: "report",
    domain: "reporting",
    reason: "Generates executive email intro copy, metric highlights, talking points, and client Q&A from completed automation deliverables.",
    sourceModule: "src/lib/automation-email-intro.ts",
  },
  {
    id: "workflow.agentmail.intake-classifier",
    label: "AgentMail Inbound Blog Request Classifier",
    category: "research",
    domain: "blog-generator",
    reason: "Classifies inbound AgentMail messages and attachments into blog creation requests, draft sources, and context briefs.",
    sourceModule: "src/lib/agentmail/agentmail-email-intake.ts",
  },
  {
    id: "workflow.drive.folder-disambiguator",
    label: "Google Drive Folder Disambiguation Agent",
    category: "research",
    domain: "reporting",
    reason: "Selects the matching client and purpose Google Drive destination folder from multiple candidate folders.",
    sourceModule: "src/lib/google-drive/disambiguate-drive-folder.ts",
  },
] as const;

export function getPulseAgentById(id: string): PulseRegisteredAgentEntry | undefined {
  return PULSE_AGENT_REGISTRY.find((entry) => entry.id === id);
}

export function listPulseAgentsByCategory(
  category: AgentOpenRouterCategory,
): PulseRegisteredAgentEntry[] {
  return PULSE_AGENT_REGISTRY.filter((entry) => entry.category === category);
}

export function listPulseAgentsByDomain(
  domain: PulseAgentDomain,
): PulseRegisteredAgentEntry[] {
  return PULSE_AGENT_REGISTRY.filter((entry) => entry.domain === domain);
}

export function resolveModelForRegisteredAgent(
  agentId: string,
  siteId?: string | null,
): string {
  const entry = getPulseAgentById(agentId);
  if (!entry) {
    throw new Error(`Unknown Pulse agent id: "${agentId}"`);
  }
  return resolveModelForAgentCategory(entry.category, siteId);
}
