import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { PipelineAgentKind } from "@/lib/agent-pipeline-cost-estimates";

export type AiseoFileSlotRunKind = Exclude<
  BulkOptimizationState["runKind"],
  undefined | "research"
>;

export type AiseoElementCategory = "research" | "meta" | "content" | "image" | "site";

export const AISEO_POST_CONTENT_SLOT_TITLE = "Post content";
export const AISEO_WP_UPLOAD_SLOT_TITLE = "WordPress upload";

export type AiseoGeneratedFile = {
  name: string;
  content: string;
  mimeType: string;
};

export type AiseoRowArtifactContract = {
  runKind: AiseoFileSlotRunKind;
  category: AiseoElementCategory;
  agentKind: PipelineAgentKind | "none";
  label: string;
  reason: string;
  elementSlotTitle: string | null;
  elementFileName: string | null;
  pipelineTitles: readonly string[];
};

export const AISEO_ROW_ARTIFACT_REGISTRY: Record<AiseoFileSlotRunKind, AiseoRowArtifactContract> = {
  aiAllMeta: {
    runKind: "aiAllMeta",
    category: "meta",
    agentKind: "meta",
    label: "All Meta",
    reason: "Generates Title, Meta Description, and FAQ schema in one coordinated pass grounded in the row research brief.",
    elementSlotTitle: "All Meta",
    elementFileName: "ai-all-meta.json",
    pipelineTitles: ["All Meta", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  aiTitle: {
    runKind: "aiTitle",
    category: "meta",
    agentKind: "meta",
    label: "Titles",
    reason: "Rewrites the SEO and WordPress title (50-60 chars) with exact focus-keyword weaving and zero colons or brand prefixes.",
    elementSlotTitle: "AI titles",
    elementFileName: "ai-title.json",
    pipelineTitles: ["AI titles", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  aiMeta: {
    runKind: "aiMeta",
    category: "meta",
    agentKind: "meta",
    label: "Meta Description (MD)",
    reason: "Writes a 130-150 character SERP meta description containing the exact focus keyword and specific buyer value.",
    elementSlotTitle: "AI meta",
    elementFileName: "ai-meta.json",
    pipelineTitles: ["AI meta", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  contentKw: {
    runKind: "contentKw",
    category: "research",
    agentKind: "meta",
    label: "Keywords (Content)",
    reason: "Derives a 2-5 word short-tail primary focus keyword (`keyword_focus`) from URL path, title, meta, and research brief.",
    elementSlotTitle: "AI keywords (content)",
    elementFileName: "focus-keyword.json",
    pipelineTitles: ["AI keywords (content)", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  entityKw: {
    runKind: "entityKw",
    category: "research",
    agentKind: "meta",
    label: "Keywords (Entity / SAP)",
    reason: "Derives a localized service-area focus keyword (`[Service] [Neighborhood/City] [ST]`) from URL, title, and NAP context.",
    elementSlotTitle: "Entity keywords",
    elementFileName: "focus-keyword.json",
    pipelineTitles: ["Entity keywords", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  aiUrl: {
    runKind: "aiUrl",
    category: "meta",
    agentKind: "none",
    label: "URLs",
    reason: "Computes a short keyword-aligned URL slug and NEO Pulse redirect 301 redirect CSV entry when the current slug drifts from the focus keyword.",
    elementSlotTitle: "AI URL paths",
    elementFileName: "ai-url.json",
    pipelineTitles: ["AI URL paths", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  aiFaq: {
    runKind: "aiFaq",
    category: "meta",
    agentKind: "meta",
    label: "FAQs",
    reason: "Generates conversational buyer Q&A pairs for ACF FAQ schema and appends a structured FAQ section to the post body.",
    elementSlotTitle: "FAQ",
    elementFileName: "faq.json",
    pipelineTitles: ["FAQ", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  aiScenario: {
    runKind: "aiScenario",
    category: "content",
    agentKind: "blog",
    label: "Scenario",
    reason: "Inserts or refreshes a localized `[ILLUSTRATIVE]` case scenario (`Scenario: ...` H2 + blockquote + `Recommendation:` H3).",
    elementSlotTitle: "Case scenario",
    elementFileName: "scenario.json",
    pipelineTitles: ["Case scenario", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  aiAnswer: {
    runKind: "aiAnswer",
    category: "content",
    agentKind: "blog",
    label: "Answer",
    reason: "Generates or replaces the leading `<h2>Answer</h2>` direct-answer block for AI Overviews and featured snippets.",
    elementSlotTitle: "Answer",
    elementFileName: "answer.html",
    pipelineTitles: ["Answer", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  aiOverview: {
    runKind: "aiOverview",
    category: "content",
    agentKind: "blog",
    label: "Overview",
    reason: "Generates the `<h2>Overview</h2>` summary with bold-label key-point bullets and `#anchor` scroll citations to every body H2.",
    elementSlotTitle: "Overview",
    elementFileName: "overview.html",
    pipelineTitles: ["Overview", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  aiHeaders: {
    runKind: "aiHeaders",
    category: "content",
    agentKind: "blog",
    label: "Headers",
    reason: "Rewrites generic or weak body H2 headings in place to align with GSC queries, SERP intent, and focus keyword variations.",
    elementSlotTitle: "Headers",
    elementFileName: "headers-plan.json",
    pipelineTitles: ["Headers", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  aiLinks: {
    runKind: "aiLinks",
    category: "content",
    agentKind: "blog",
    label: "Links",
    reason: "Audits, replaces, and weaves contextual internal links (`<a href>`) from the connected site's verified Posts/Pages/SAP inventory.",
    elementSlotTitle: "Links",
    elementFileName: "links-plan.json",
    pipelineTitles: ["Links", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  aiWikipediaLink: {
    runKind: "aiWikipediaLink",
    category: "content",
    agentKind: "research",
    label: "Wikipedia link",
    reason: "Resolves the canonical Wikipedia entity URL for the row's place/topic and weaves an external authority citation at first mention.",
    elementSlotTitle: "Wikipedia link",
    elementFileName: "wikipedia-link.json",
    pipelineTitles: ["Wikipedia link", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  contentCleanup: {
    runKind: "contentCleanup",
    category: "content",
    agentKind: "none",
    label: "Clean Up",
    reason: "Strips duplicate body `<h1>` blocks and converts raw Markdown pipe tables into semantic HTML `<table>` markup.",
    elementSlotTitle: "Clean Up",
    elementFileName: "cleanup.json",
    pipelineTitles: ["Clean Up", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  aiInContentImage: {
    runKind: "aiInContentImage",
    category: "image",
    agentKind: "image",
    label: "In Content Image",
    reason: "Selects the best H2 section, generates or reuses a grounded 16:9 visual (or SAP local place photo), uploads to WP Media, and inserts `<figure>`.",
    elementSlotTitle: "In content image",
    elementFileName: "in-content-image.md",
    pipelineTitles: ["In content image", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  aiFeaturedImage: {
    runKind: "aiFeaturedImage",
    category: "image",
    agentKind: "image",
    label: "Featured image",
    reason: "Builds an image checklist from post HTML, generates a grounded 16:9 featured image, uploads to WP Media, and sets `featured_media`.",
    elementSlotTitle: "Featured image",
    elementFileName: "image-requirements.json",
    pipelineTitles: ["Featured image", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  extraText: {
    runKind: "extraText",
    category: "content",
    agentKind: "research",
    label: "Extra Text",
    reason: "Generates supplementary `<h2>` + `<h3>` HTML with internal links for the page's `seo_extra_text` ACF field.",
    elementSlotTitle: "Extra text",
    elementFileName: "extra-text.html",
    pipelineTitles: ["Extra text", AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  wpUpload: {
    runKind: "wpUpload",
    category: "site",
    agentKind: "none",
    label: "WordPress Upload",
    reason: "Pushes staged row title, meta, focus keyword, FAQ, and HTML body to WordPress and records the `wordpress.json` upload receipt.",
    elementSlotTitle: null,
    elementFileName: null,
    pipelineTitles: [AISEO_POST_CONTENT_SLOT_TITLE, AISEO_WP_UPLOAD_SLOT_TITLE],
  },
  content: {
    runKind: "content",
    category: "content",
    agentKind: "blog",
    label: "Blog Optimization (Content)",
    reason: "Full multi-section blog optimization (Checklist -> Blueprint -> Link targets -> H2 Section writers -> Post content -> WordPress upload) without re-running Research.",
    elementSlotTitle: null,
    elementFileName: null,
    pipelineTitles: [],
  },
};

export function listAiseoElementLibrary(): AiseoRowArtifactContract[] {
  return Object.values(AISEO_ROW_ARTIFACT_REGISTRY);
}

export function isAiseoFileSlotRunKind(
  runKind: BulkOptimizationState["runKind"] | undefined,
): runKind is AiseoFileSlotRunKind {
  return (
    runKind != null &&
    runKind in AISEO_ROW_ARTIFACT_REGISTRY &&
    runKind !== "content" &&
    runKind !== "aiFeaturedImage"
  );
}

export function getAiseoRowArtifactContract(
  runKind: BulkOptimizationState["runKind"] | undefined,
): AiseoRowArtifactContract | undefined {
  if (!runKind || runKind === "research") {
    return undefined;
  }
  return AISEO_ROW_ARTIFACT_REGISTRY[runKind as AiseoFileSlotRunKind];
}

export function aiseoRowPipelineTitles(
  runKind: BulkOptimizationState["runKind"] | undefined,
): readonly string[] {
  return getAiseoRowArtifactContract(runKind)?.pipelineTitles ?? [];
}

