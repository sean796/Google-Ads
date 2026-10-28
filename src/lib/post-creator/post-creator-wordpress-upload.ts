import type { WordPressSite } from "@/components/integrations/types";
import type { AgentConfig } from "@/types/agent-config";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { BulkGenerationLinkable } from "@/lib/bulk/bulk-generation-wp-inventory";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { resolveRankMathFromKeywordResearch } from "@/lib/bulk-auto-generate";
import {
  buildPostMarkdownAcfSeoFaqBundle,
  patchPostLinkInSeoResearchJson,
  resolveFaqEntriesForVisibleTable,
} from "@/lib/content-generation/bulk-acf-seo-bundle";
import { buildOptimizedMetaFromKeywordResearch } from "@/lib/content-generation/apply-bulk-meta-from-seo-json";
import { NEO_PULSE_DEFAULT_FIELD_MAPPING } from "@/lib/content-generation/acf-field-mapper";
import { buildAcfPayload } from "@/lib/content-generation/apply-meta-acf-payload";
import { sanitizeContentForUpload } from "@/lib/content-generation/content-sanitizer";
import { prepareHarnessContentForUpload } from "@/lib/content-generation/harness-upload-prep";
import type { KeywordData } from "@/lib/keyword-types";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { generateExcerpt } from "@/lib/markdown-to-html";
import {
  appendVisibleFaqTableWithIntro,
  FLO_FAQ_CLASS,
  stripTrailingFaqSection,
} from "@/lib/overview/overview-blog-faq-append";
import { generateSEOSlug } from "@/lib/seo-slug-generator";
import { extractOriginFromSapTitle } from "@/lib/sap-origin-from-title";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { createWordPressPost, updateWordPressPost } from "@/lib/wordpress-api";
import { updateOverviewSeoItem } from "@/lib/wordpress-api/meta";

export type PostCreatorWordPressUploadResult = {
  postId: number;
  postUrl: string;
  title: string;
  slug?: string;
  status: "publish" | "draft";
  htmlContent: string;
  seoResearchJson: string;
  wordpressArtifactJson: string;
};

export type PostCreatorWordPressUploadArgs = {
  site: WordPressSite;
  row: CSVRow;
  markdownContent: string;
  blueprintAgents: AgentConfig[];
  wordPressPosts: BulkGenerationLinkable[];
  keywordResearch?: Record<string, unknown> | null;
  postDestination?: "wordpress" | "draft";
  featuredImageId?: number;
  openRouterApiKey?: string;
  onProgress?: (message: string) => void;
};

function stubKeywordData(keyword: string, research?: Record<string, unknown> | null): KeywordData {
  const primary = keyword.trim() || "topic";
  const kd = research?.keywordData;
  if (kd && typeof kd === "object" && !Array.isArray(kd)) {
    const obj = kd as Record<string, unknown>;
    return {
      keyword: String(obj.keyword ?? primary),
      difficulty: Number(obj.difficulty ?? 0),
      searchVolume: Number(obj.searchVolume ?? 0),
      cpc: Number(obj.cpc ?? 0),
      competition: (obj.competition as KeywordData["competition"]) ?? "MEDIUM",
      intent: (obj.intent as KeywordData["intent"]) ?? "informational",
      relatedKeywords: Array.isArray(obj.relatedKeywords) ? obj.relatedKeywords.map(String) : [],
      serpFeatures: Array.isArray(obj.serpFeatures) ? obj.serpFeatures.map(String) : [],
    };
  }
  return {
    keyword: primary,
    difficulty: 0,
    searchVolume: 0,
    cpc: 0,
    competition: "MEDIUM",
    intent: "informational",
    relatedKeywords: [],
    serpFeatures: [],
  };
}

export async function uploadPostCreatorRowToWordPress(
  args: PostCreatorWordPressUploadArgs,
): Promise<PostCreatorWordPressUploadResult> {
  const {
    site,
    row,
    markdownContent,
    blueprintAgents,
    wordPressPosts,
    keywordResearch,
    postDestination = "wordpress",
    featuredImageId,
    openRouterApiKey,
    onProgress,
  } = args;

  const apiKey = (openRouterApiKey?.trim() || (await resolveOpenRouterApiKeyForHarness())).trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key required for upload prep.");
  }
  if (!site.username || !site.appPassword) {
    throw new Error(`WordPress credentials missing for ${site.name}.`);
  }

  const primaryKw = (row.keyword ?? "").trim();
  const postTitle = (row.title ?? primaryKw).trim();
  if (!postTitle || !markdownContent.trim()) {
    throw new Error("Title and markdown content are required for upload.");
  }

  const keywordData = stubKeywordData(primaryKw, keywordResearch ?? undefined);
  const rankMeta = resolveRankMathFromKeywordResearch(keywordData);
  const excerpt =
    row.meta_description?.trim() ||
    rankMeta.metaDescription ||
    generateExcerpt(markdownContent);

  const isEntityRow = row.sitemap_type === "entity";
  const entityEndpoint =
    isEntityRow && site.entitySitemapUrl?.trim()
      ? extractEndpointFromEntitySitemapUrl(site.entitySitemapUrl)
      : "posts";
  const postTypeSubtype = isEntityRow ? entityEndpoint : "post";
  const postTypeEndpoint = isEntityRow ? entityEndpoint : "posts";

  onProgress?.("Preparing harness content for upload...");
  let htmlContent = await prepareHarnessContentForUpload({
    markdownContent,
    blueprintAgents,
    wordPressPosts,
    siteId: site.id,
    siteUrl: site.siteUrl,
    apiKey,
    keyword: primaryKw,
    articleTitle: postTitle,
    model: getResearchModel(site.id),
  });

  htmlContent = sanitizeContentForUpload(htmlContent, site.siteUrl, wordPressPosts);
  htmlContent = stripTrailingFaqSection(htmlContent);

  const baseUrl = site.siteUrl.replace(/\/$/, "");
  const placeholderLink = `${baseUrl}/blog/placeholder/`;

  onProgress?.("Building SEO research and FAQ bundle...");
  const preBlogSkeleton: Record<string, unknown> = {
    primary_keyword: primaryKw,
    title: postTitle,
    generatedAt: new Date().toISOString(),
    post_link: "",
  };

  const faqBundle = await buildPostMarkdownAcfSeoFaqBundle({
    preBlogSkeleton,
    markdownContent,
    enrichedRow: row,
    keywordData,
    blueprintTitle: postTitle,
    excerpt,
    site,
    postTitle,
    primaryKw,
    rankMeta,
    openRouterApiKey: apiKey,
    placeholderPostUrl: placeholderLink,
    onProgress,
  });

  const visibleFaqEntries = resolveFaqEntriesForVisibleTable(faqBundle?.faqEntries);
  if (
    visibleFaqEntries.length &&
    !htmlContent.toLowerCase().includes(`class="${FLO_FAQ_CLASS}"`)
  ) {
    onProgress?.("Appending FAQ table to post body...");
    const appended = await appendVisibleFaqTableWithIntro({
      sourceHtml: htmlContent,
      entries: visibleFaqEntries,
      apiKey,
      focusKeyword: primaryKw,
      pageTitle: postTitle,
    });
    if (appended?.html) {
      htmlContent = appended.html;
    }
  }

  let slug: string | undefined;
  try {
    const entity =
      row.entity?.trim() && row.entity.trim() !== "N/A" ? row.entity.trim() : undefined;
    slug = await generateSEOSlug(postTitle, primaryKw || postTitle, entity, apiKey);
    if (!slug || slug.length < 2) slug = undefined;
  } catch {
    slug = undefined;
  }

  const wpStatus = postDestination === "draft" ? ("draft" as const) : ("publish" as const);

  onProgress?.("Creating WordPress post...");
  const postResult = await createWordPressPost(
    site.siteUrl,
    site.username,
    site.appPassword,
    postTitle,
    htmlContent,
    excerpt,
    wpStatus,
    undefined,
    featuredImageId,
    undefined,
    undefined,
    postTypeSubtype,
    postTypeEndpoint,
    slug,
  );

  if (!postResult.success || !postResult.postId) {
    throw new Error(postResult.error || "WordPress upload failed.");
  }

  const postLink =
    (typeof postResult.link === "string" && postResult.link.trim()) ||
    `${baseUrl}/?p=${postResult.postId}`;

  let seoResearchJson = faqBundle?.seoResearchJson ?? "{}";
  seoResearchJson = patchPostLinkInSeoResearchJson(
    seoResearchJson,
    postLink,
    site.siteUrl,
    postTitle,
    excerpt,
    primaryKw,
    rankMeta,
  );

  const optimizedMeta = buildOptimizedMetaFromKeywordResearch(
    rankMeta,
    postTitle,
    excerpt,
    primaryKw,
    postLink,
    site.siteUrl,
  );

  onProgress?.("Writing NEO Pulse custom fields and SEO meta...");
  const existingAcfFields: Record<string, unknown> = {};
  const fieldMapping = { ...NEO_PULSE_DEFAULT_FIELD_MAPPING };

  const entity =
    row.entity?.trim() && row.entity.trim() !== "N/A" ? row.entity.trim() : undefined;
  const acfWrite: Record<string, string> = {};
  acfWrite[fieldMapping.dateModifier] = new Date().toISOString().split("T")[0]!;
  acfWrite[fieldMapping.keywordFocus] = primaryKw.slice(0, 500);
  acfWrite[fieldMapping.seoResearch] = seoResearchJson;
  if (faqBundle?.faqForAcf) {
    acfWrite[fieldMapping.faq] = faqBundle.faqForAcf;
  }
  const originFromTitle = extractOriginFromSapTitle(postTitle);
  if (row.origin?.trim() && row.origin.trim() !== "N/A") {
    acfWrite[fieldMapping.origin] = row.origin.trim();
  } else if (originFromTitle) {
    acfWrite[fieldMapping.origin] = originFromTitle;
  } else if (entity) {
    acfWrite[fieldMapping.origin] = entity;
  }

  const mappedMeta = buildAcfPayload(
    fieldMapping,
    optimizedMeta,
    primaryKw,
    existingAcfFields,
    seoResearchJson,
    { includeSeoResearchInPayload: false },
  );
  Object.assign(acfWrite, mappedMeta);

  await updateOverviewSeoItem(site.siteUrl, site.username, site.appPassword, {
    postId: postResult.postId,
    postType: postTypeSubtype,
    postTypeEndpoint,
    postTitle: acfWrite.seo_title || postTitle,
    postExcerpt: acfWrite.meta_description || excerpt,
    acf: acfWrite,
  });

  if (
    visibleFaqEntries.length &&
    htmlContent.toLowerCase().includes(`class="${FLO_FAQ_CLASS}"`)
  ) {
    await updateWordPressPost(
      site.siteUrl,
      site.username,
      site.appPassword,
      postResult.postId,
      postTitle,
      htmlContent,
      excerpt,
      undefined,
      postTypeSubtype,
      undefined,
      undefined,
      undefined,
      slug,
      postTypeEndpoint,
    );
  }

  const wordpressArtifact = {
    link: postLink,
    postId: postResult.postId,
    title: postTitle,
    status: wpStatus,
    slug,
    uploadedAt: new Date().toISOString(),
  };

  return {
    postId: postResult.postId,
    postUrl: postLink,
    title: postTitle,
    slug,
    status: wpStatus,
    htmlContent,
    seoResearchJson,
    wordpressArtifactJson: JSON.stringify(wordpressArtifact, null, 2),
  };
}
