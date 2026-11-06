import type { KeywordAIAnalysis } from "../keyword-types";
import type { PromptBulkSitemapInventoryBuckets } from "../bulk/prompt-bulk-sitemap-inventory";
import { CRITICAL_LINK_RULE } from "./core";
import {
  BULK_CONTENT_BLOG_EDITORIAL_RULES,
  BULK_CONTENT_BLOG_TITLE_COLON_BAN,
  BULK_SERVICE_AREA_GAP_CSV_FEATURED_IMAGE,
  BULK_SERVICE_AREA_GEO_EDITORIAL_RULES,
  GEO_LANDING_KEYWORD_INTENT_RULES,
  GEO_LANDING_TITLE_AI_RULES,
  GLOBAL_TOPIC_EXCLUSIONS,
  KEYWORD_INTENT_RULES,
  MACHINE_CHECKLIST_PARSE_RULES,
  META_DESCRIPTION_RULES,
  MODIFIER_ALL,
  OUTPUT_FORMAT_LINE,
  SOURCE_PRIORITY,
  TITLE_RULES,
  WITHIN_CHECKLIST_EXCLUSIVITY,
  buildBulkIdeasTodayDateBlock,
  type BulkBlogIdeasContentKind,
} from "./bulk-ideas-rules";
import {
  appendSiteInventoryBucketsToUserPrompt,
  buildContentVarietyInstruction,
  buildExampleFormat,
  buildGeneralIntentBlock,
  buildGscKeywordsBlock,
  buildKbBlock,
  buildKeywordAnalysisBlock,
  buildSiteInventorySystemBlock,
  buildSiteKwJsonStepBlock,
  buildSlotKeywordsBlock,
  buildSlotModifiersBlock,
  buildTargetSiteBlock,
  buildTitleInstruction,
  countFilledSlotKeywords,
  hasSitemapInventory,
} from "./bulk-ideas-blocks";

export {
  BULK_SERVICE_AREA_GAP_CSV_MODIFIER,
  BULK_SERVICE_AREA_GAP_CSV_FEATURED_IMAGE,
  type BulkBlogIdeasContentKind,
} from "./bulk-ideas-rules";
export {
  appendSiteInventoryBucketsToUserPrompt,
  buildGscKeywordsBlock,
  buildSiteInventorySystemBlock,
  countNonemptySitemapBuckets,
} from "./bulk-ideas-blocks";

/**
 * Builds a system prompt for generating blog ideas from user prompts
 */
export const buildBulkBlogIdeasSystemPrompt = (
  flowPurpose: string,
  activeKnowledgeBaseText: string,
  numberOfBlogs: number,
  entityMode: "auto" | "manual" | "blank" = "auto",
  entityValue: string = "",
  keywordMode: "same" | "per-blog" | "gsc-keywords" = "per-blog",
  keywordValue: string = "",
  optionalPrompt: string = "",
  titleTemplate: string = "",
  featuredImagePerBlog: boolean = true,
  connectedSite?: { name: string; siteUrl: string },
  siteInventoryJson?: string,
  gscExactKeywords?: string[],
  keywordAnalysisResults?: Map<string, KeywordAIAnalysis>,
  contentKind: BulkBlogIdeasContentKind = "content_blog",
  siteInventoryBuckets?: PromptBulkSitemapInventoryBuckets,
  slotKeywords?: string[],
  slotModifiers?: string[],
): string => {
  const n = numberOfBlogs;
  const isSap = contentKind === "service_area_sap";
  const hasSlotKeywords = Boolean(slotKeywords?.length);
  const hasSlotModifiers = Boolean(slotModifiers?.some((m) => m.trim()));
  const hasSiteInventory = hasSitemapInventory(siteInventoryBuckets, siteInventoryJson);
  const inventoryBucketCount = siteInventoryBuckets
    ? [siteInventoryBuckets.posts, siteInventoryBuckets.pages, siteInventoryBuckets.sap].filter((b) =>
        b.json.trim(),
      ).length
    : siteInventoryJson?.trim()
      ? 1
      : 0;
  const entityLabel =
    entityMode === "auto"
      ? isSap
        ? "Auto: named service area (place) per row"
        : "Auto-extract from KB"
      : entityMode === "manual"
        ? `Manual: "${entityValue}"`
        : "Blank (no entity)";
  const keywordLabel = hasSlotKeywords
    ? "Per blog (user slots + AI fill empty)"
    : keywordMode === "gsc-keywords"
      ? "GSC (use exactly)"
      : keywordMode === "same"
        ? `Same: "${keywordValue}"`
        : isSap
          ? "Per row (unique local intent each)"
          : "Per blog (different each)";

  const generalIntentBlock = buildGeneralIntentBlock(flowPurpose, n);
  const modifierBlock = optionalPrompt
    ? `\n**PROMPT MODIFIER (ALL ${n} IDEAS)**: "${optionalPrompt}"\n${MODIFIER_ALL(n, optionalPrompt)}\n`
    : "";

  const targetSiteBlock = connectedSite ? buildTargetSiteBlock(connectedSite) : "";
  const kbBlock =
    activeKnowledgeBaseText ? buildKbBlock(activeKnowledgeBaseText, connectedSite) : "";
  const inventoryInstructions =
    hasSiteInventory && inventoryBucketCount > 0
      ? buildSiteInventorySystemBlock(inventoryBucketCount)
      : "";

  const gscBlock =
    keywordMode === "gsc-keywords" && gscExactKeywords?.length
      ? buildGscKeywordsBlock(gscExactKeywords, n, flowPurpose)
      : "";
  const analysisBlock =
    keywordAnalysisResults?.size ? buildKeywordAnalysisBlock(keywordAnalysisResults, n) : "";

  const slotKeywordsBlock = hasSlotKeywords ? buildSlotKeywordsBlock(slotKeywords!) : "";
  const slotModifiersBlock = hasSlotModifiers ? buildSlotModifiersBlock(slotModifiers!) : "";

  const keywordReq = hasSlotKeywords
    ? "Follow USER KEYWORD SLOTS. Filled rows: copy the user Keyword verbatim into Keyword only. Do not use that string as Title. Empty rows only: pick one unique 2–3 word short-tail intent keyword (different each), no near-me / city spam; government/policy inventions must include jurisdiction."
    : isSap
      ? "One unique row per local geo landing: follow " + GEO_LANDING_KEYWORD_INTENT_RULES + " Distinct geography per row when possible."
      : keywordMode === "gsc-keywords" && gscExactKeywords?.length
        ? flowPurpose?.trim()
          ? "Use GSC/selected phrases ONLY when they fit the content topic and pass inventory exclusion; otherwise pick another SITE_KW_JSON line. Prefer selected keywords as written. Strip near-me / city proximity spam from commercial keywords. Preserve jurisdiction on government/policy/incentives/grants keywords. Never copy inventory titles."
          : "Align posts with GSC/selected phrases that pass inventory exclusion; skip any that overlap existing post topics and pick from SITE_KW_JSON instead. Use Keyword as written when already short-tail. Strip near-me / city proximity spam from commercial keywords. Preserve jurisdiction on government/policy/incentives/grants keywords. Never copy inventory titles."
        : keywordMode === "same"
          ? `Use one short-tail intent keyword for all (from "${keywordValue}" if already short; if longer, distill; strip near-me / city spam only; keep jurisdiction if it is a government/policy keyword).`
          : "One unique 2–3 word short-tail intent keyword per blog (different each), no near-me / city spam; government/policy inventions must include jurisdiction.";
  const entityReq =
    entityMode === "auto"
      ? isSap
        ? "Each row: Entity = the target place name (city, neighbourhood, or county) for that landing."
        : "Extract from KB or context."
      : entityMode === "manual"
        ? `Use "${entityValue}".`
        : "Leave blank.";
  const entityTitleRule =
    entityMode !== "blank"
      ? titleTemplate?.trim()
        ? " For title templates with [Entity]/[Location]: Title must be readable with NO repeated words (never two \"near\" or duplicate city). If the keyword already says \"near\" or \"near me\", use [Keyword] in [entity] or [Keyword] - [entity]; do not insert another \"near\". If the keyword has no \"near\", you may use [keyword] near [entity] when [Entity] is a place. Keyword = service/product ONLY. Never [entity] [keyword]."
        : isSap
          ? ""
          : " **Default content blogs:** Entity is usually the **brand/business name** - do NOT use \"near [Entity]\" or \"in [Entity]\" as if Entity were a city. Do NOT add city, region, province, or state names to titles unless the title template includes [Location]."
      : "";
  const titleReq =
    titleTemplate?.trim()
      ? buildTitleInstruction(titleTemplate, n, contentKind) + entityTitleRule
      : isSap
        ? `${TITLE_RULES} ${GEO_LANDING_TITLE_AI_RULES} All ${n} titles under 60 chars, no pipe; each row a distinct pattern from the rules above.`
        : buildTitleInstruction("", n, contentKind) + entityTitleRule;
  const exampleBlock = buildExampleFormat(
    n,
    "",
    entityMode,
    keywordMode,
    keywordValue,
    optionalPrompt,
    featuredImagePerBlog,
    contentKind,
  );

  const parts = [
    isSap
      ? "You are NEO Pulse, an expert local SEO strategist. Generate a structured checklist of **local geo service area landing page** ideas for the entity sitemap program, from user prompts."
      : "You are NEO Pulse, an expert AI content strategist. Generate a structured checklist of blog post ideas from user prompts.",
    buildBulkIdeasTodayDateBlock(),
    "\nFlow:",
    `Purpose: ${flowPurpose || "Not specified"}`,
    generalIntentBlock,
    modifierBlock,
    slotKeywordsBlock,
    slotModifiersBlock,
    targetSiteBlock,
    kbBlock,
    inventoryInstructions,
    "\nSettings:",
    `${isSap ? "Local geo landing pages to generate" : "Blogs to generate"}: ${n}`,
    `Entity: ${entityLabel}`,
    `Keyword: ${keywordLabel}`,
    isSap
      ? "Featured image: Google Maps based for every row (not AI)."
      : `Featured image: ${featuredImagePerBlog ? "Yes" : "No"}`,
    optionalPrompt ? `Instructions: "${optionalPrompt}"` : "",
    gscBlock,
    analysisBlock,
    `\nOutput: All ${n} ideas in one response. Numbered checklist only.`,
    flowPurpose?.trim()
      ? `\n**EACH OF THE ${n} IDEAS**: keyword and title MUST be about "${flowPurpose.trim()}".\n`
      : "",
    `\n${isSap ? GEO_LANDING_KEYWORD_INTENT_RULES : KEYWORD_INTENT_RULES}\n`,
    "\nEach idea:",
    flowPurpose?.trim()
      ? `- Topic: MUST be about "${flowPurpose.trim()}".`
      : "",
    `- Keyword: ${keywordReq}`,
    `- Entity: ${entityReq}`,
    `- Title: ${titleReq}.`,
    `- MetaDescription: ${META_DESCRIPTION_RULES}`,
    `- Modifier: ${isSap ? `empty for every row (entity URLs): Modifier: "" only` : optionalPrompt ? `Apply "${optionalPrompt}"` : "Optional context/tone"}`,
    `- FeaturedImage: ${isSap ? `exactly "${BULK_SERVICE_AREA_GAP_CSV_FEATURED_IMAGE}" (every row, Google Maps image not AI)` : featuredImagePerBlog ? '"y"' : '"n"'}`,
    `- Date / timeliness: every field above must follow the TODAY block — current info only, no stale years or outdated framing.`,
    optionalPrompt ? '- Rationale: One sentence why this idea matches the modifier.' : "",
    "\nRequirements:",
    isSap ? BULK_SERVICE_AREA_GEO_EDITORIAL_RULES : BULK_CONTENT_BLOG_EDITORIAL_RULES,
    GLOBAL_TOPIC_EXCLUSIONS,
    flowPurpose?.trim()
      ? `- MANDATORY FOR ALL ${n} IDEAS: keyword and title strictly within "${flowPurpose.trim()}". Do not copy inventory titles/keywords verbatim.`
      : "",
    `- Exactly ${n} ideas; each unique.`,
    `- ${WITHIN_CHECKLIST_EXCLUSIVITY(n)}`,
    `- ${TITLE_RULES}`,
    !isSap ? `- ${BULK_CONTENT_BLOG_TITLE_COLON_BAN}` : "",
    `- ${buildContentVarietyInstruction(hasSiteInventory)}`,
    connectedSite ? `- Relevant to ${connectedSite.name}.` : "",
    optionalPrompt ? `- ${MODIFIER_ALL(n, optionalPrompt)}` : "",
    connectedSite
      ? `\n**LINKS / URLs IN THIS CHECKLIST (NON-NEGOTIABLE)**:\n${CRITICAL_LINK_RULE}\nIf you mention any URL in checklist text, it MUST be under the connected site origin (${connectedSite.siteUrl}) or omitted - never example.com or placeholder domains.\n`
      : "",
    SOURCE_PRIORITY,
    "\nFormat:",
    MACHINE_CHECKLIST_PARSE_RULES,
    OUTPUT_FORMAT_LINE(n, entityMode, featuredImagePerBlog, !!optionalPrompt, contentKind),
    "\n" + exampleBlock,
  ];

  return parts.filter(Boolean).join("\n");
};

/**
 * Builds a user prompt for generating blog ideas from natural language input
 */
export const buildBulkBlogIdeasUserPrompt = (
  userPrompt: string,
  numberOfBlogs: number,
  optionalPrompt: string = "",
  siteInventoryJson?: string,
  gscExactKeywords?: string[],
  flowPurpose?: string,
  contentKind: BulkBlogIdeasContentKind = "content_blog",
  siteInventoryBuckets?: PromptBulkSitemapInventoryBuckets,
  siteKwJsonText?: string,
  slotKeywords?: string[],
): string => {
  const n = numberOfBlogs;
  const isSap = contentKind === "service_area_sap";
  const hasInv = hasSitemapInventory(siteInventoryBuckets, siteInventoryJson);
  const filledUserSlots = countFilledSlotKeywords(slotKeywords);
  const slotKeywordsBlock = slotKeywords?.length ? buildSlotKeywordsBlock(slotKeywords) : "";
  const generalIntentBlock = flowPurpose?.trim()
    ? `CONTENT TOPIC (MANDATORY FOR EVERY IDEA): All ${n} ideas must be about "${flowPurpose.trim()}". Do not copy titles or keywords from the site inventory; use it only to avoid cannibalization.\n\n`
    : "";
  const modifierBlock = optionalPrompt
    ? `PROMPT MODIFIER (apply to all ${n} ideas): "${optionalPrompt}"\nEvery title must reflect this; no generic titles.\n\n`
    : "";

  const editorialLead = isSap
    ? `${BULK_SERVICE_AREA_GEO_EDITORIAL_RULES}\n\n`
    : `${BULK_CONTENT_BLOG_EDITORIAL_RULES}\n\n`;
  const generateLead = isSap
    ? `Generate exactly ${n} local geo service area landing page ideas:\n\n${userPrompt}`
    : `Generate exactly ${n} blog post ideas:\n\n${userPrompt}`;

  const parts = [
    buildBulkIdeasTodayDateBlock(),
    generalIntentBlock,
    modifierBlock,
    editorialLead,
    generateLead,
    optionalPrompt
      ? `\nApply modifier "${optionalPrompt}" to all ${n} ideas. Include Rationale for each item.`
      : "",
    flowPurpose?.trim()
      ? `\nCRITICAL: All ${n} ideas must be about "${flowPurpose.trim()}".`
      : "\nSource priority: Knowledge base = primary (topics, gaps). Site inventory JSON = cannibalization only.",
    `\n${GLOBAL_TOPIC_EXCLUSIONS}\n`,
    `\n${isSap ? GEO_LANDING_KEYWORD_INTENT_RULES : KEYWORD_INTENT_RULES}\n`,
    `\n${TITLE_RULES}`,
    !isSap ? `\n${BULK_CONTENT_BLOG_TITLE_COLON_BAN}` : "",
    `\n${buildContentVarietyInstruction(hasInv)}`,
    `\n${WITHIN_CHECKLIST_EXCLUSIVITY(n)}`,
  ];

  if (gscExactKeywords && gscExactKeywords.length > 0) {
    parts.push(
      filledUserSlots > 0
        ? "\nUse GSC keywords from the system prompt ONLY for empty USER KEYWORD SLOTS, and only when each fits the content topic and passes inventory exclusion."
        : flowPurpose?.trim()
          ? "\nUse GSC keywords from the system prompt ONLY when each fits the content topic and passes inventory exclusion."
          : "\nUse GSC keywords from the system prompt only when they do not overlap site inventory intent.",
    );
  }

  parts.push(
    `\nOutput: Checklist of exactly ${n} ideas per system format (machine checklist lines: N. then Keyword/Title with straight quotes, no fences, no indent). Maximum title variety; different format per title. Every Title: a fresh editorial headline about the row topic, not the Keyword pasted as the title. Zero colons.`,
  );
  if (slotKeywordsBlock) {
    parts.push(
      `\nMUST FOLLOW LAST: ${slotKeywordsBlock}Filled user Keywords are locked in the Keyword field only. Do not paste a locked Keyword as Title. Do not replace a locked Keyword with GSC, SITE_KW_JSON, or a distilled short-tail.`,
    );
  }

  let out = "";
  if (siteKwJsonText?.trim()) {
    out += buildSiteKwJsonStepBlock(siteKwJsonText, gscExactKeywords, filledUserSlots);
  }
  if (hasInv && siteInventoryBuckets) {
    out +=
      `STEP 1 — READ SITE INVENTORY (mandatory before any ideas):\n` +
      `The JSON blocks below are every existing URL on the site: published posts, scheduled posts, pages, and entity landings.\n` +
      `Do not copy, paraphrase, or target the same search intent as any title or URL in that inventory.\n` +
      `Your ${n} ideas must be gaps only — zero cannibalization.\n`;
    out = appendSiteInventoryBucketsToUserPrompt(out, siteInventoryBuckets);
    out += `\nSTEP 2 — GENERATE ${n} NEW IDEAS (only after reading inventory above):\n\n`;
  } else if (siteInventoryJson?.trim()) {
    out +=
      `STEP 1 — READ SITE INVENTORY (mandatory):\n` +
      `Do not copy or paraphrase any existing title or keyword in the JSON below.\n\n` +
      `=== SITE_INVENTORY_JSON ===\n${siteInventoryJson.trim()}\n=== END SITE_INVENTORY_JSON ===\n\n` +
      `STEP 2 — GENERATE ${n} NEW IDEAS:\n\n`;
  }

  out += parts.join("");
  return out;
};
