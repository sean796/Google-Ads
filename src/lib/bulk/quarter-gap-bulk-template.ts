import { notify } from "@/lib/app-notifications";
import { NOTIFY_ADD_YOUR_OPENROUTER_API_KEY_IN_SETTINGS_, NOTIFY_COULD_NOT_PARSE_BLOG_IDEAS_FROM_THE_MODE, NOTIFY_COULD_NOT_PARSE_IDEAS_FROM_THE_MODEL_RES, NOTIFY_COULD_NOT_PARSE_LOCAL_GEO_LANDING_IDEAS_, NOTIFY_INVALID_OPENROUTER_API_KEY_CHECK_SETTING, NOTIFY_INVALID_TARGET_SITE_EXAMPLE_COM_IS_NOT_A_2, NOTIFY_KNOWLEDGE_BASE_IS_EMPTY_IDEAS_WILL_USE_S, NOTIFY_QUARTER_COUNTS_ARE_NOT_READY_OR_THERE_IS, NOTIFY_RATE_LIMIT_EXCEEDED_WAIT_A_MOMENT_AND_TR, NOTIFY_REQUEST_TOO_LARGE_REDUCE_KNOWLEDGE_BASE_, NOTIFY_WORDPRESS_CREDENTIALS_ARE_REQUIRED_FOR_S, notifyFailedToGenerateIdeasX } from "@/lib/notify-messages";
import { loadApiKey, streamChatCompletion } from "@/lib/api";
import {
  buildBulkBlogIdeasSystemPrompt,
  buildBulkBlogIdeasUserPrompt,
  type BulkBlogIdeasContentKind,
  BULK_SERVICE_AREA_GAP_CSV_FEATURED_IMAGE,
  BULK_SERVICE_AREA_GAP_CSV_MODIFIER,
} from "@/lib/prompt-builders";
import { parseBlogIdeasChecklist } from "@/lib/bulk/bulk-csv-parser";
import { loadKnowledgeBaseForBulkIdeas } from "@/lib/kb-for-bulk-ideas";
import { getSitePostInventory, getSitePageInventory } from "@/lib/wordpress-api";
import type { SitePostInventoryKbPayload, QuarterEditorialTileStats } from "@/lib/wordpress-api/types";
import type { WordPressSite } from "@/components/integrations/types";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { downloadBulkTemplateCsvRows } from "@/lib/backlink-research/backlink-bulk-csv-export";
import { entityForBulkCsvExport } from "@/lib/backlink-research/backlink-tile-enriched";
import {
  allocateQuarterGapRunCounts,
  QUARTER_EDITORIAL_ENTITIES_GOAL,
  QUARTER_EDITORIAL_POSTS_GOAL,
} from "@/lib/quarter-editorial-gap";
import { staggerPublishDatesAcrossQuarter, staggerPublishDatesAcrossRange } from "@/lib/quarter-bounds";
import { logger } from "@/lib/logger";

/** Single-phase quarter gap CSV: blog checklist rows only, or geo/entity landing rows only. */
export type QuarterGapBulkTemplateMode = "posts" | "entities";

/** Quarter counts and this download size so the model can tune titles for shortage + scheduling context. */
function editorialGapContextForPrompt(
  stats: QuarterEditorialTileStats,
  allocation: { blogRows: number; sapRows: number },
  mode: QuarterGapBulkTemplateMode,
): string {
  const parts: string[] = [];
  const ql = stats.quarterLabel;
  const spanWord = stats.countsPeriodMode === "rolling" ? "this rolling editorial period" : "this calendar quarter";
  if (stats.postsLive !== null && stats.postsScheduled !== null) {
    const postsTotal = stats.postsLive + stats.postsScheduled;
    const shortPosts = Math.max(0, QUARTER_EDITORIAL_POSTS_GOAL - postsTotal);
    parts.push(
      `${ql} editorial posts (live + scheduled in ${spanWord}): ${postsTotal}; goal ${QUARTER_EDITORIAL_POSTS_GOAL}${shortPosts > 0 ? ` (short by ${shortPosts})` : ""}.`,
    );
  }
  if (
    stats.entityConfigured &&
    stats.entityCountsAvailable &&
    stats.entityLive !== null &&
    stats.entityScheduled !== null
  ) {
    const entTotal = stats.entityLive + stats.entityScheduled;
    const shortEnt = Math.max(0, QUARTER_EDITORIAL_ENTITIES_GOAL - entTotal);
    parts.push(
      `${ql} entity pages (live + scheduled in ${spanWord}): ${entTotal}; goal ${QUARTER_EDITORIAL_ENTITIES_GOAL}${shortEnt > 0 ? ` (short by ${shortEnt})` : ""}.`,
    );
  }
  parts.push(
    mode === "posts"
      ? `This CSV checklist includes ${allocation.blogRows} blog row(s) toward filling gaps.`
      : `This CSV checklist includes ${allocation.sapRows} geo landing row(s) toward filling gaps.`,
  );
  parts.push(
    `CSV publish_date_gmt is prefilled with suggested staggered calendar dates across ${ql} (edit in the sheet); titles stay evergreen.`,
  );
  return parts.join(" ");
}

function scheduleDatesForGapExport(stats: QuarterEditorialTileStats, rowCount: number): string[] {
  const now = new Date();
  if (
    stats.countsPeriodMode === "rolling" &&
    stats.countsPeriodAfterIso &&
    stats.countsPeriodEndExclusiveIso
  ) {
    return staggerPublishDatesAcrossRange({
      rowCount,
      rangeStart: new Date(stats.countsPeriodAfterIso),
      rangeEndExclusive: new Date(stats.countsPeriodEndExclusiveIso),
      now,
    });
  }
  return staggerPublishDatesAcrossQuarter({
    rowCount,
    quarterLabel: stats.quarterLabel,
    now,
  });
}

const DEFAULT_TEMPERATURE = 1.0;
const DEFAULT_MAX_TOKENS = 4000;
const DEFAULT_TOP_P = 0.9;

function normalizeDomainForExampleCheck(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/\/$/, "")
    .replace(/^https?:\/\/(www\.)?/, "")
    .split("/")[0];
}

type PitchRow = {
  keyword: string;
  entity: string;
  title: string;
  modifier: string;
  featuredImage: string;
  publish_date_gmt?: string;
};

async function streamBulkIdeasChecklist(options: {
  openRouterApiKey: string;
  siteId: string | undefined;
  systemPrompt: string;
  userPrompt: string;
  onProgress?: (message: string) => void;
  progressLabel: string;
}): Promise<string> {
  const checklistResearchModel = getResearchModel(options.siteId);
  let checklistContent = "";
  const safeMaxTokens = Math.min(DEFAULT_MAX_TOKENS, 16000);
  options.onProgress?.(options.progressLabel);
  try {
    await streamChatCompletion({
      apiKey: options.openRouterApiKey,
      model: checklistResearchModel,
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPrompt },
      ],
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: safeMaxTokens,
      topP: DEFAULT_TOP_P,
      onContentChunk: (chunk) => {
        checklistContent += chunk;
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("[Quarter gap] OpenRouter:", error);
    if (errorMessage.includes("400") || errorMessage.includes("Request too large")) {
      notify.error(
        "Request too large. Reduce knowledge base size in Settings or Knowledge base, then try again.",
      );
      return "";
    }
    if (errorMessage.includes("401") || errorMessage.includes("Invalid API key")) {
      notify.error(NOTIFY_INVALID_OPENROUTER_API_KEY_CHECK_SETTING);
      return "";
    }
    if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
      notify.error(NOTIFY_RATE_LIMIT_EXCEEDED_WAIT_A_MOMENT_AND_TR);
      return "";
    }
    notify.error(notifyFailedToGenerateIdeasX(errorMessage));
    return "";
  }
  return checklistContent;
}

function rowsToPitchRows(
  parsed: ReturnType<typeof parseBlogIdeasChecklist>,
  take: number,
  forceModifier?: string,
  forceFeaturedImage?: string,
): PitchRow[] {
  const trimmed = parsed.slice(0, take);
  return trimmed.map((row) => ({
    keyword: row.keyword,
    entity: entityForBulkCsvExport(row.entity),
    title: row.title,
    modifier: forceModifier ?? (row.modifier ?? "").trim(),
    featuredImage: (forceFeaturedImage ?? row.featuredImage?.trim()) || "y",
  }));
}

async function runOneGapPhase(options: {
  openRouterApiKey: string;
  site: WordPressSite;
  count: number;
  quarterLabel: string;
  contentKind: BulkBlogIdeasContentKind;
  flowPurpose: string;
  limitedKnowledgeBaseText: string;
  siteInventoryJson: string;
  connectedSite: { name: string; siteUrl: string };
  onProgress?: (message: string) => void;
  progressLabel: string;
  userLead: string;
  forceModifier?: string;
  forceFeaturedImage?: string;
}): Promise<PitchRow[]> {
  if (options.count <= 0) return [];
  const n = options.count;
  const systemPrompt = buildBulkBlogIdeasSystemPrompt(
    options.flowPurpose,
    options.limitedKnowledgeBaseText,
    n,
    "auto",
    "",
    "per-blog",
    "",
    "",
    "",
    true,
    options.connectedSite,
    options.siteInventoryJson,
    undefined,
    undefined,
    options.contentKind,
  );
  const userPrompt = buildBulkBlogIdeasUserPrompt(
    options.userLead,
    n,
    "",
    options.siteInventoryJson,
    undefined,
    options.flowPurpose,
    options.contentKind,
  );

  const raw = await streamBulkIdeasChecklist({
    openRouterApiKey: options.openRouterApiKey,
    siteId: options.site.id,
    systemPrompt,
    userPrompt,
    onProgress: options.onProgress,
    progressLabel: options.progressLabel,
  });
  if (!raw) return [];

  const parsed = parseBlogIdeasChecklist(raw, "", "", "", "", "", options.site.name);
  if (parsed.length === 0) return [];
  return rowsToPitchRows(parsed, n, options.forceModifier, options.forceFeaturedImage);
}

/**
 * Fetches post + page inventory (same two calls as prompt-mode bulk), runs one or two OpenRouter
 * checklist passes (content blogs for post gap, local geo landing rows for entity gap), then downloads one CSV
 * matching `bulk-auto-generate-template.csv`.
 */
export async function runQuarterGapBulkTemplateDownload(options: {
  site: WordPressSite;
  quarterStats: QuarterEditorialTileStats;
  mode: QuarterGapBulkTemplateMode;
  onProgress?: (message: string) => void;
}): Promise<void> {
  const { site, quarterStats, onProgress, mode } = options;
  const allocation = allocateQuarterGapRunCounts(quarterStats);
  if (!allocation) {
    notify.error(NOTIFY_QUARTER_COUNTS_ARE_NOT_READY_OR_THERE_IS);
    return;
  }
  const rowsForMode = mode === "posts" ? allocation.blogRows : allocation.sapRows;
  if (rowsForMode <= 0) {
    notify.error(
      mode === "posts"
        ? "No post gap for this quarter."
        : "No entity gap for this quarter.",
    );
    return;
  }

  const openRouterApiKey = loadApiKey()?.trim();
  if (!openRouterApiKey) {
    notify.error(NOTIFY_ADD_YOUR_OPENROUTER_API_KEY_IN_SETTINGS_);
    return;
  }

  const u = site.siteUrl?.trim();
  const user = site.username?.trim();
  const pass = site.appPassword?.trim();
  if (!u || !user || !pass) {
    notify.error(NOTIFY_WORDPRESS_CREDENTIALS_ARE_REQUIRED_FOR_S);
    return;
  }

  const domain = normalizeDomainForExampleCheck(getPublicSiteUrl(site));
  if (domain === "example.com" || domain.endsWith(".example.com")) {
    notify.error(NOTIFY_INVALID_TARGET_SITE_EXAMPLE_COM_IS_NOT_A_2);
    return;
  }

  const connectedSite = { name: site.name, siteUrl: getPublicSiteUrl(site) };
  const quarterLabel = quarterStats.quarterLabel;

  onProgress?.("Fetching WordPress post and page inventory…");
  const [postsInv, pagesInv] = await Promise.all([
    getSitePostInventory(site.siteUrl, user, pass),
    getSitePageInventory(site.siteUrl, user, pass),
  ]);

  if (postsInv.error) {
    logger.error("[Quarter gap] Post inventory:", postsInv.error);
  }
  if (pagesInv.error) {
    logger.error("[Quarter gap] Page inventory:", pagesInv.error);
  }

  const postRows = postsInv.posts ?? [];
  const pageRows = pagesInv.posts ?? [];
  const mergedRows = [...postRows, ...pageRows];

  if (mergedRows.length === 0 && (postsInv.error || pagesInv.error)) {
    notify.error(
      postsInv.error ||
        pagesInv.error ||
        "WordPress inventory returned no rows. Fix the connection or REST access and try again.",
    );
    return;
  }

  const kbPayload: SitePostInventoryKbPayload = {
    site: postsInv.site?.url ? postsInv.site : pagesInv.site?.url ? pagesInv.site : { url: connectedSite.siteUrl },
    generatedAt: new Date().toISOString(),
    posts: mergedRows,
  };
  const siteInventoryJson = JSON.stringify(kbPayload, null, 2);

  onProgress?.("Loading knowledge base…");
  const { activeKnowledgeBaseText } = loadKnowledgeBaseForBulkIdeas();
  if (!activeKnowledgeBaseText.trim() && !siteInventoryJson.trim()) {
    notify.warning(
      "Knowledge base is empty. Ideas will use site inventory for exclusions only; add KB files for stronger topics.",
    );
  }

  const limitedKnowledgeBaseText =
    activeKnowledgeBaseText.length > 5000
      ? `${activeKnowledgeBaseText.slice(0, 5000)}\n\n[Knowledge base truncated for token optimization...]`
      : activeKnowledgeBaseText;

  const combined: PitchRow[] = [];
  const gapEditorialContext = editorialGapContextForPrompt(quarterStats, allocation, mode);

  if (mode === "posts" && allocation.blogRows > 0) {
    const flowPurposeBlog = `Content blog ideas for ${site.name} to reach at least ${quarterLabel} post targets. National or educational angles; no local service-area landing cannibalization. Stay on-brand and avoid overlapping existing inventory URLs.`;
    const userBlog = `Generate ${allocation.blogRows} informational **blog post** ideas (not service-area landings) for ${quarterLabel}.

${gapEditorialContext}`;
    const blogRows = await runOneGapPhase({
      openRouterApiKey,
      site,
      count: allocation.blogRows,
      quarterLabel,
      contentKind: "content_blog",
      flowPurpose: flowPurposeBlog,
      limitedKnowledgeBaseText,
      siteInventoryJson,
      connectedSite,
      onProgress,
      progressLabel: "Generating blog post ideas with OpenRouter…",
      userLead: userBlog,
    });
    if (blogRows.length === 0) {
      notify.error(NOTIFY_COULD_NOT_PARSE_BLOG_IDEAS_FROM_THE_MODE);
      return;
    }
    combined.push(...blogRows);
  }

  if (mode === "entities" && allocation.sapRows > 0) {
    const flowPurposeGeo = `Local geo service area landing page ideas for ${site.name} to reach ${quarterLabel} entity sitemap targets. Each row is one geo-targeted entity landing; Entity must be a real place name.`;
    const userGeo = `Generate ${allocation.sapRows} local geo **service area landing** ideas for the entity program in ${quarterLabel}. **Modifier must be empty** on every line (Modifier: ""); FeaturedImage must be ${BULK_SERVICE_AREA_GAP_CSV_FEATURED_IMAGE} on every line (Google Maps image, not AI). Each Title: natural phrase combining that row's Keyword and Entity with varied connectors (in, near, for, serving, around, etc.), not the same "[Place] [Keyword]" pattern every row.

${gapEditorialContext}`;
    const geoRows = await runOneGapPhase({
      openRouterApiKey,
      site,
      count: allocation.sapRows,
      quarterLabel,
      contentKind: "service_area_sap",
      flowPurpose: flowPurposeGeo,
      limitedKnowledgeBaseText,
      siteInventoryJson,
      connectedSite,
      onProgress,
      progressLabel: "Generating local geo landing ideas with OpenRouter…",
      userLead: userGeo,
      forceModifier: BULK_SERVICE_AREA_GAP_CSV_MODIFIER,
      forceFeaturedImage: BULK_SERVICE_AREA_GAP_CSV_FEATURED_IMAGE,
    });
    if (geoRows.length === 0) {
      notify.error(NOTIFY_COULD_NOT_PARSE_LOCAL_GEO_LANDING_IDEAS_);
      return;
    }
    combined.push(...geoRows);
  }

  const filtered = combined.filter((r) => r.keyword?.trim() && r.title?.trim());
  if (filtered.length === 0) {
    notify.error(NOTIFY_COULD_NOT_PARSE_IDEAS_FROM_THE_MODEL_RES);
    return;
  }

  const scheduleDates = scheduleDatesForGapExport(quarterStats, filtered.length);
  const filteredWithSchedule: PitchRow[] = filtered.map((r, i) => ({
    ...r,
    publish_date_gmt: scheduleDates[i] ?? "",
  }));

  const safeName = site.name.replace(/\s+/g, "-").slice(0, 60) || "site";
  const modeSlug = mode === "posts" ? "posts" : "entities";
  downloadBulkTemplateCsvRows(
    filteredWithSchedule,
    `quarter-gap-bulk-${modeSlug}-${safeName}`,
    mode === "posts" ? { blankEntityColumn: true } : undefined,
  );
}
