import type { WordPressSite } from "@/components/integrations/types";
import type { BulkProcessingOptions } from "@/lib/bulk-auto-generate";
import {
  addKeywordResearchSnapshotToBulkFiles,
  resolveRankMathFromKeywordResearch,
} from "@/lib/bulk-auto-generate";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { htmlTextFingerprint } from "@/lib/bulk/blog-import-format-blocks";
import { generateFeaturedImage, generateImageChecklist } from "@/lib/bulk/bulk-image-generator";
import { BulkFileManager, type BulkGeneratedFile } from "@/lib/bulk-file-manager";
import { fetchGoogleMapsImageForEntity } from "@/lib/content-generation/google-maps-image-api";
import { NEO_PULSE_DEFAULT_FIELD_MAPPING } from "@/lib/content-generation/acf-field-mapper";
import { buildAcfPayload } from "@/lib/content-generation/apply-meta-acf-payload";
import { buildOptimizedMetaFromKeywordResearch } from "@/lib/content-generation/apply-bulk-meta-from-seo-json";
import {
  buildPostMarkdownAcfSeoFaqBundle,
  buildPreBlogSeoResearchSkeleton,
  patchPostLinkInSeoResearchJson,
  resolveFaqEntriesForVisibleTable,
  type PrecomputedAcfSeoBundle,
} from "@/lib/content-generation/bulk-acf-seo-bundle";
import { generateSEOImageFilename } from "@/lib/image-filename-generator";
import type { KeywordAIAnalysis, KeywordAnalysisComplete, KeywordAnalysisOptions, KeywordData } from "@/lib/keyword-types";
import {
  extractAnswerSectionHtml,
  extractOverviewSectionHtml,
  generateAndPrependOverviewHtml,
  stripLeadingAnswerSection,
  stripLeadingOverviewSection,
} from "@/lib/overview/overview-blog-overview-prepend";
import {
  appendVisibleFaqTableWithIntro,
  stripTrailingFaqSection,
} from "@/lib/overview/overview-blog-faq-append";
import { buildBlogImportKeywordResearchStub } from "@/lib/bulk/blog-import-parse";
import { uploadWordPressMedia } from "@/lib/wordpress-api";
import { updateOverviewSeoItem } from "@/lib/wordpress-api/meta";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";

export type DirectAnalyzeKeywordFn = (
  keyword: string,
  analysisOptions: KeywordAnalysisOptions,
) => Promise<KeywordAnalysisComplete | null>;

export type DirectFeaturedImageMode = "y" | "n" | "google-maps";

export function resolveDirectFeaturedImageMode(
  row: Pick<CSVRow, "featuredImage">,
  formMode?: DirectFeaturedImageMode,
): DirectFeaturedImageMode {
  const fromRow = row.featuredImage?.trim().toLowerCase();
  if (fromRow === "y" || fromRow === "n" || fromRow === "google-maps") return fromRow;
  return formMode === "n" || formMode === "google-maps" ? formMode : "y";
}

export function directImportBodyFingerprint(html: string): string {
  const withoutFaq = stripTrailingFaqSection(html);
  const body = stripLeadingOverviewSection(stripLeadingAnswerSection(withoutFaq));
  return htmlTextFingerprint(body);
}

export async function prependDirectAnswerAndOverview(args: {
  bodyHtml: string;
  articleTitle: string;
  focusKeyword: string;
  pageUrl?: string;
  site: WordPressSite;
  entity?: string;
  seoResearchBrief?: string;
  apiKey: string;
  model?: string;
}): Promise<string> {
  const result = await generateAndPrependOverviewHtml({
    sourceHtml: args.bodyHtml,
    articleTitle: args.articleTitle,
    focusKeyword: args.focusKeyword,
    pageUrl: args.pageUrl,
    connectedSite: { name: args.site.name, siteUrl: args.site.siteUrl },
    site: args.site,
    entity: args.entity,
    seoResearchBrief: args.seoResearchBrief,
    apiKey: args.apiKey,
    model: args.model,
  });
  if (!result?.html?.trim()) {
    throw new Error("Direct Answer and Overview returned no HTML");
  }
  if (!extractAnswerSectionHtml(result.html).trim()) {
    throw new Error("Direct Answer section is empty");
  }
  if (!extractOverviewSectionHtml(result.html).trim()) {
    throw new Error("Direct Overview section is empty");
  }
  return result.html;
}

/** Use DataForSEO when Labs returns keyword_info. Long-tail phrases with empty items keep the row keyword. */
export function resolveDirectKeywordResearchFromAnalyze(
  row: CSVRow,
  research: KeywordAnalysisComplete | null,
): { keywordData: KeywordData; aiAnalysis: KeywordAIAnalysis } {
  const keyword = row.keyword?.trim() || row.keyword_focus?.trim() || "";
  if (!keyword) throw new Error("Direct import meta is missing keyword");
  const stub = buildBlogImportKeywordResearchStub(row);
  if (!research?.result?.keywordData) {
    return { keywordData: stub.keywordData, aiAnalysis: stub.aiAnalysis };
  }
  return {
    keywordData: { ...research.result.keywordData, keyword },
    aiAnalysis: research.aiAnalysis ?? stub.aiAnalysis,
  };
}

export async function runDirectKeywordResearch(args: {
  rowIndex: number;
  row: CSVRow;
  options: BulkProcessingOptions;
  fileManager: BulkFileManager;
  analyzeKeyword: DirectAnalyzeKeywordFn;
  pageUrl: string;
}): Promise<{
  keywordData: KeywordData;
  seoResearchBrief: string;
  files: BulkGeneratedFile[];
}> {
  const keyword = args.row.keyword?.trim() || args.row.keyword_focus?.trim() || "";
  if (!keyword) throw new Error("Direct import meta is missing keyword");

  args.options.onProgress?.(args.rowIndex, 0, "Keyword research...");
  let research: KeywordAnalysisComplete | null = null;
  try {
    research = await args.analyzeKeyword(keyword, {
      location: "United States",
      language: "en",
      strict: false,
    });
  } catch (err) {
    console.warn("[Direct import] DataForSEO keyword overview empty or failed, using row keyword:", err);
    research = null;
  }

  const { keywordData, aiAnalysis } = resolveDirectKeywordResearchFromAnalyze(args.row, research);

  const timestamp = Date.now();
  const snapshot = addKeywordResearchSnapshotToBulkFiles(
    args.rowIndex,
    args.row,
    args.fileManager,
    args.options,
    timestamp,
    {
      keywordData,
      aiAnalysis,
      keywordsVolumeData: research?.keywordsVolumeData ?? [],
      paaRawResponse: research?.paaRawResponse ?? null,
      primaryKeyword: keyword,
      semrush: null,
      intelligentMerge: null,
      primaryExternalCitationUrl: null,
    },
  );

  const skeleton = buildPreBlogSeoResearchSkeleton({
    keywordData,
    enrichedRow: args.row,
    flowTitle: args.row.title.trim(),
  });
  skeleton.research_intent = keywordData.intent || "informational";

  return {
    keywordData,
    seoResearchBrief: JSON.stringify(skeleton),
    files: [snapshot],
  };
}

export async function appendDirectFaqAndSchema(args: {
  html: string;
  row: CSVRow;
  keywordData: KeywordData;
  excerpt: string;
  site: WordPressSite;
  postTitle: string;
  primaryKw: string;
  placeholderPostUrl: string;
  seoResearchBrief: string;
  apiKey: string;
  model?: string;
  onProgress?: (message: string) => void;
}): Promise<{ html: string; bundle: PrecomputedAcfSeoBundle }> {
  const rankMeta = resolveRankMathFromKeywordResearch(args.keywordData);
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.seoResearchBrief) as unknown;
  } catch {
    throw new Error("Direct SEO research JSON is invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Direct SEO research JSON is invalid");
  }
  const preBlogSkeleton = parsed as Record<string, unknown>;
  const bundle = await buildPostMarkdownAcfSeoFaqBundle({
    preBlogSkeleton,
    markdownContent: args.html,
    enrichedRow: args.row,
    keywordData: args.keywordData,
    blueprintTitle: args.postTitle,
    excerpt: args.excerpt,
    site: args.site,
    postTitle: args.postTitle,
    primaryKw: args.primaryKw,
    rankMeta,
    openRouterApiKey: args.apiKey,
    placeholderPostUrl: args.placeholderPostUrl,
    onProgress: args.onProgress,
  });
  if (!bundle?.faqForAcf || !bundle.seoResearchJson) {
    throw new Error("Direct FAQ schema was empty");
  }

  let html = args.html;
  const visibleFaqEntries = resolveFaqEntriesForVisibleTable(bundle.faqEntries);
  if (!visibleFaqEntries.length) {
    throw new Error("Direct FAQ entries were empty");
  }
  const appended = await appendVisibleFaqTableWithIntro({
    sourceHtml: html,
    entries: visibleFaqEntries,
    apiKey: args.apiKey,
    model: args.model,
    focusKeyword: args.primaryKw,
    pageTitle: args.postTitle,
  });
  if (!appended?.html) {
    throw new Error("Direct FAQ table was not appended");
  }
  return { html: appended.html, bundle };
}

export async function generateDirectFeaturedImagePayload(args: {
  mode: DirectFeaturedImageMode;
  title: string;
  bodyHtml: string;
  entity?: string;
  apiKey: string;
  model?: string;
}): Promise<{ imageBase64: string; filename: string } | undefined> {
  if (args.mode === "n") return undefined;

  let imageBase64: string;
  if (args.mode === "google-maps") {
    const entity = args.entity?.trim();
    if (!entity || entity === "N/A") {
      throw new Error("Direct Google Maps featured image needs an entity");
    }
    const maps = await fetchGoogleMapsImageForEntity(entity);
    imageBase64 = maps.imageBase64;
  } else {
    const purpose = `Featured image for ${args.title}`;
    const checklist = await generateImageChecklist(args.title, purpose, args.bodyHtml, {
      apiKey: args.apiKey,
      model: args.model || getResearchModel(),
    });
    const image = await generateFeaturedImage(args.title, purpose, args.bodyHtml, checklist, {
      apiKey: args.apiKey,
      model: args.model || getResearchModel(),
    });
    imageBase64 = image.imageBase64;
  }

  const filename = await generateSEOImageFilename(
    args.title,
    args.apiKey,
    args.model || getResearchModel(),
    "featured",
  );
  return { imageBase64, filename };
}

export async function uploadDirectFeaturedMedia(args: {
  site: WordPressSite;
  imageBase64: string;
  filename: string;
  title: string;
  keyword: string;
}): Promise<{ mediaId: number; url: string | null }> {
  const media = await uploadWordPressMedia(
    args.site.siteUrl,
    args.site.username,
    args.site.appPassword,
    args.imageBase64,
    args.filename,
    args.title,
    args.keyword,
  );
  if (!media.success || !media.mediaId) {
    throw new Error(media.error || "Direct featured image upload failed");
  }
  const url = media.url?.trim() || media.link?.trim() || null;
  return { mediaId: media.mediaId, url };
}

/** Direct import: post body unchanged; write keyword, SEO title, meta description, and Rank Math only. */
export async function writeDirectImportMetaOnly(args: {
  site: WordPressSite;
  postId: number;
  postTypeForAcf: string;
  entityEndpoint: string;
  postLink: string;
  postTitle: string;
  excerpt: string;
  primaryKw: string;
  baseAcf: Record<string, string>;
  apiKey: string;
}): Promise<Record<string, string>> {
  const rankMeta = {
    seoTitle: args.postTitle,
    metaDescription: args.baseAcf.meta_description || args.excerpt,
    focusKeyword: args.primaryKw,
  };
  const optimizedMeta = buildOptimizedMetaFromKeywordResearch(
    rankMeta,
    args.postTitle,
    args.excerpt,
    args.primaryKw,
    args.postLink,
    args.site.siteUrl,
  );

  const existingAcfFields: Record<string, unknown> = {};
  const fieldMapping = { ...NEO_PULSE_DEFAULT_FIELD_MAPPING };

  const acfWrite: Record<string, string> = { ...args.baseAcf };
  acfWrite[fieldMapping.keywordFocus] = args.primaryKw.slice(0, 500);
  const mappedMeta = buildAcfPayload(
    fieldMapping,
    optimizedMeta,
    args.primaryKw,
    existingAcfFields,
    "",
    { includeSeoResearchInPayload: false },
  );
  Object.assign(acfWrite, mappedMeta);

  const pulseRes = await updateOverviewSeoItem(
    args.site.siteUrl,
    args.site.username,
    args.site.appPassword,
    {
      postId: args.postId,
      postType: args.postTypeForAcf,
      postTypeEndpoint: args.entityEndpoint,
      postTitle: acfWrite.seo_title || args.postTitle,
      postExcerpt: acfWrite.meta_description || args.excerpt,
      acf: acfWrite,
    },
  );
  if (!pulseRes.ok) {
    throw new Error(pulseRes.error || "Direct NEO Pulse SEO write failed");
  }

  return acfWrite;
}

export async function writeDirectSeoAcfAndRankMath(args: {
  site: WordPressSite;
  postId: number;
  postTypeForAcf: string;
  entityEndpoint: string;
  postLink: string;
  postTitle: string;
  excerpt: string;
  primaryKw: string;
  keywordData: KeywordData;
  bundle: PrecomputedAcfSeoBundle;
  baseAcf: Record<string, string>;
  apiKey: string;
}): Promise<Record<string, string>> {
  const rankMeta = resolveRankMathFromKeywordResearch(args.keywordData);
  const seoResearchJson = patchPostLinkInSeoResearchJson(
    args.bundle.seoResearchJson,
    args.postLink,
    args.site.siteUrl,
    args.postTitle,
    args.excerpt,
    args.primaryKw,
    rankMeta,
  );
  const optimizedMeta = buildOptimizedMetaFromKeywordResearch(
    rankMeta,
    args.postTitle,
    args.excerpt,
    args.primaryKw,
    args.postLink,
    args.site.siteUrl,
  );

  const existingAcfFields: Record<string, unknown> = {};
  const fieldMapping = { ...NEO_PULSE_DEFAULT_FIELD_MAPPING };

  const acfWrite: Record<string, string> = { ...args.baseAcf };
  acfWrite[fieldMapping.keywordFocus] = args.primaryKw.slice(0, 500);
  acfWrite[fieldMapping.seoResearch] = seoResearchJson;
  acfWrite[fieldMapping.faq] = args.bundle.faqForAcf;
  const mappedMeta = buildAcfPayload(
    fieldMapping,
    optimizedMeta,
    args.primaryKw,
    existingAcfFields,
    seoResearchJson,
    { includeSeoResearchInPayload: false },
  );
  Object.assign(acfWrite, mappedMeta);

  const pulseRes = await updateOverviewSeoItem(
    args.site.siteUrl,
    args.site.username,
    args.site.appPassword,
    {
      postId: args.postId,
      postType: args.postTypeForAcf,
      postTypeEndpoint: args.entityEndpoint,
      postTitle: acfWrite.seo_title || args.postTitle,
      postExcerpt: acfWrite.meta_description || args.excerpt,
      acf: acfWrite,
    },
  );
  if (!pulseRes.ok) {
    throw new Error(pulseRes.error || "Direct NEO Pulse SEO write failed");
  }

  return acfWrite;
}

export function directPageUrl(site: WordPressSite, slug: string): string {
  const base = getPublicSiteUrl(site).replace(/\/+$/, "");
  return slug ? `${base}/${slug}` : base;
}
