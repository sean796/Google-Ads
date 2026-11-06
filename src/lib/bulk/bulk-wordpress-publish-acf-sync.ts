/**
 * ACF and SEO research sync for bulk WordPress publish rows.
 */

import type { WordPressSite } from '@/components/integrations/types';
import type { CSVRow } from '@/lib/bulk/bulk-csv-parser';
import type { BulkProcessingOptions } from '@/lib/bulk/bulk-auto-generate-types';
import type { BulkGeneratedFile } from '@/lib/bulk-file-manager';
import type { KeywordData } from '@/lib/keyword-types';
import type { PrecomputedAcfSeoBundle } from '@/lib/content-generation/bulk-acf-seo-bundle';
import type { FaqEntry } from '@/lib/faq-entries';
import type { IntelligentKeywordResearchMergeResult } from '@/lib/bulk/intelligent-keyword-research-merge';
import type { SemrushBulkEnrichmentResult } from '@/lib/wordpress-api/semrush';
import {
  mergeSemrushFieldsIntoSeoResearchJson,
  resolveRankMathFromKeywordResearch,
  safeTrimSemrushOverviewForAcf,
} from '@/lib/bulk/bulk-keyword-research-artifacts';
import { parseOptimizedMetaFromSeoResearchJson } from '@/lib/bulk/bulk-row-acf-meta';
import { buildOptimizedMetaFromKeywordResearch } from '@/lib/content-generation/apply-bulk-meta-from-seo-json';
import { mergeSeoResearchWithMeta, buildAcfPayload } from '@/lib/content-generation/apply-meta-acf-payload';
import { generateBulkFaqEntriesInContext, napLocationsFromSite } from '@/lib/content-generation/bulk-faq-in-context';
import { buildFAQSchemaScriptFromEntries } from '@/lib/content-generation/wordpress-uploader';
import {
  patchPostLinkInSeoResearchJson,
  resolveFaqEntriesForVisibleTable,
} from '@/lib/content-generation/bulk-acf-seo-bundle';
import { appendVisibleFaqTableWithIntro, FLO_FAQ_CLASS } from '@/lib/overview/overview-blog-faq-append';
import { updateWordPressPost } from '@/lib/wordpress-api';
import { updateOverviewSeoItem } from '@/lib/wordpress-api/meta';
import { NEO_PULSE_DEFAULT_FIELD_MAPPING } from '@/lib/content-generation/acf-field-mapper';
import { parseFaqEntries } from '@/lib/faq-entries';
import { loadApiKey } from '@/lib/api';
import { extractOriginFromSapTitle } from '@/lib/sap-origin-from-title';
import { acfOriginAppliesForRow } from '@/lib/acf-origin-applies';
import { acfCompetitorAppliesForRow } from '@/lib/acf-competitor-applies';
import { addBulkSeoResearchArtifact } from '@/lib/bulk/bulk-wordpress-publish-artifacts';
import type { BulkFileManager } from '@/lib/bulk-file-manager';


export async function appendEarlyBulkFaqTable(args: {
  contentForUpload: string;
  precomputedAcfSeoBundle: PrecomputedAcfSeoBundle | null;
  options: BulkProcessingOptions;
  bulkPrimaryKw: string;
  keywordData: KeywordData;
  postTitle: string;
  rowIndex: number;
}): Promise<string> {
  const { precomputedAcfSeoBundle, options, bulkPrimaryKw, keywordData, postTitle, rowIndex } = args;
  let { contentForUpload } = args;
          // Content Opt parity: stitch backend FAQ Q/A into flo-faq table before first publish.
          {
            const earlyEntries = resolveFaqEntriesForVisibleTable(
              precomputedAcfSeoBundle?.faqEntries
            );
            const openRouterApiKeyEarly = (options.openRouterApiKey || loadApiKey() || '').trim();
            if (
              earlyEntries.length &&
              openRouterApiKeyEarly &&
              contentForUpload.trim() &&
              !contentForUpload.toLowerCase().includes(`class="${FLO_FAQ_CLASS}"`)
            ) {
              options.onProgress?.(rowIndex, 0, 'Appending FAQ table to post body...');
              const appendedEarly = await appendVisibleFaqTableWithIntro({
                sourceHtml: contentForUpload,
                entries: earlyEntries,
                apiKey: openRouterApiKeyEarly,
                focusKeyword: bulkPrimaryKw || keywordData.keyword,
                pageTitle: postTitle,
              });
              if (appendedEarly?.html) {
                contentForUpload = appendedEarly.html;
              }
            }
          }
  return contentForUpload;
}

export async function syncBulkRowAcfForPost(args: {
  options: BulkProcessingOptions;
  rowIndex: number;
  enrichedRow: CSVRow;
  row: CSVRow;
  markdownContent: string;
  generatedFiles: BulkGeneratedFile[];
  fileManager: BulkFileManager;
  timestamp: number;
  bulkPrimaryKw: string;
  postTitle: string;
  keywordData: KeywordData;
  excerpt: string;
  rankMeta: ReturnType<typeof resolveRankMathFromKeywordResearch>;
  precomputedAcfSeoBundle: PrecomputedAcfSeoBundle | null;
  semrushCitationForAcf: string | null;
  intelligentMergeForAcf: IntelligentKeywordResearchMergeResult | null;
  semrushSnapshotForAcf: SemrushBulkEnrichmentResult | null;
  semrushKeywordsContext?: string;
  semrushScatterContext?: string;
  site: WordPressSite;
  sitemapType: 'post' | 'entity';
  entityEndpoint: string;
  postResult: { success: boolean; postId?: number; link?: string; status?: string };
  contractDestination: string | undefined;
  contentForUpload: string;
  slug: string | undefined;
  siteFeaturedImageId: number | undefined;
  siteIndex: number;
  blueprintResult: { title?: string };
}): Promise<{ acfUpdatedList: string[] | undefined; contentForUpload: string }> {
  const { options, rowIndex, enrichedRow, row, markdownContent, generatedFiles, fileManager, timestamp, bulkPrimaryKw, postTitle, keywordData, excerpt, rankMeta, precomputedAcfSeoBundle, semrushCitationForAcf, intelligentMergeForAcf, semrushSnapshotForAcf, semrushKeywordsContext, semrushScatterContext, site, sitemapType, entityEndpoint, postResult, contractDestination, slug, siteFeaturedImageId, siteIndex, blueprintResult } = args;
  let { contentForUpload } = args;
            // Update ACF fields after successful post creation (discover field names like wordpress-uploader)
            const entity = enrichedRow.entity && enrichedRow.entity.trim() && enrichedRow.entity.trim() !== 'N/A'
              ? enrichedRow.entity.trim()
              : undefined;
            let acfUpdatedList: string[] | undefined;
            const postTypeForAcf = sitemapType === 'entity' ? entityEndpoint : 'post';

            const postLink =
              contractDestination ||
              (typeof postResult.link === 'string' && postResult.link.trim()
                ? postResult.link.trim()
                : `${String(site.siteUrl).replace(/\/$/, '')}/?p=${postResult.postId}`);

            const optimizedMetaBootstrap = buildOptimizedMetaFromKeywordResearch(
              rankMeta,
              postTitle,
              excerpt,
              bulkPrimaryKw,
              postLink,
              site.siteUrl
            );

            let seoResearchJson = '';
            try {
              const openRouterApiKey = options.openRouterApiKey || loadApiKey();
              const existingAcfFields: Record<string, unknown> = {};
              const fieldMapping = { ...NEO_PULSE_DEFAULT_FIELD_MAPPING };
              const fieldNames = {
                dateModifier: fieldMapping.dateModifier,
                faq: fieldMapping.faq,
                promptModifier: fieldMapping.promptModifier,
                origin: fieldMapping.origin,
                competitor: 'competitor',
                keywordFocus: fieldMapping.keywordFocus,
                seoResearch: fieldMapping.seoResearch,
              };

              let faqForAcf = '';
              const semrushSeoExtras: Record<string, unknown> = {};
              if (semrushCitationForAcf) {
                semrushSeoExtras.semrush_primary_external_url = semrushCitationForAcf;
              }
              semrushSeoExtras.research_intent =
                intelligentMergeForAcf?.primaryIntent ?? keywordData.intent;
              {
                const ovAcf = safeTrimSemrushOverviewForAcf(semrushSnapshotForAcf?.keywordOverview);
                if (ovAcf !== undefined) {
                  semrushSeoExtras.semrush_keyword_overview = ovAcf;
                }
              }

              let visibleFaqEntries: FaqEntry[] | undefined;

              if (precomputedAcfSeoBundle) {
                seoResearchJson = patchPostLinkInSeoResearchJson(
                  precomputedAcfSeoBundle.seoResearchJson,
                  postLink,
                  site.siteUrl,
                  postTitle,
                  excerpt,
                  bulkPrimaryKw,
                  rankMeta
                );
                seoResearchJson = mergeSemrushFieldsIntoSeoResearchJson(
                  seoResearchJson,
                  semrushSeoExtras
                );
                faqForAcf = precomputedAcfSeoBundle.faqForAcf;
                visibleFaqEntries = resolveFaqEntriesForVisibleTable(
                  precomputedAcfSeoBundle.faqEntries
                );
              } else {
                const seoResearchObj: Record<string, unknown> = {
                  primary_keyword: bulkPrimaryKw || keywordData.keyword,
                  title: enrichedRow.title || blueprintResult.title,
                  generatedAt: new Date().toISOString(),
                  post_link: postLink,
                  seo_title: optimizedMetaBootstrap.rank_math_title,
                  meta_description: optimizedMetaBootstrap.rank_math_description,
                  focus_keyword: optimizedMetaBootstrap.rank_math_focus_keyword,
                  optimizedMeta: {
                    rank_math_title: optimizedMetaBootstrap.rank_math_title,
                    rank_math_description: optimizedMetaBootstrap.rank_math_description,
                    rank_math_focus_keyword: optimizedMetaBootstrap.rank_math_focus_keyword,
                    rank_math_canonical_url: optimizedMetaBootstrap.rank_math_canonical_url,
                    rank_math_robots: optimizedMetaBootstrap.rank_math_robots,
                  },
                  ...semrushSeoExtras,
                };
                if (semrushKeywordsContext?.trim()) {
                  try {
                    seoResearchObj.semrush_keywords = JSON.parse(semrushKeywordsContext);
                  } catch {
                    seoResearchObj.semrush_keywords_raw = semrushKeywordsContext.slice(0, 8000);
                  }
                }
                if (semrushScatterContext?.trim()) {
                  try {
                    seoResearchObj.semrush_scatter = JSON.parse(semrushScatterContext);
                  } catch {
                    seoResearchObj.semrush_scatter_raw = semrushScatterContext.slice(0, 8000);
                  }
                }

                if (enrichedRow.faq && enrichedRow.faq.trim()) {
                  const parsed = parseFaqEntries(enrichedRow.faq.trim());
                  if (parsed.length > 0) {
                    visibleFaqEntries = parsed;
                    const napLocs = napLocationsFromSite(site);
                    faqForAcf = buildFAQSchemaScriptFromEntries(
                      parsed,
                      bulkPrimaryKw,
                      entity,
                      site.siteUrl,
                      napLocs
                    );
                    seoResearchObj.faq_entries = parsed.map((e) => ({
                      question: e.question,
                      answer: e.answer.slice(0, 2000),
                    }));
                  }
                } else if (bulkPrimaryKw && markdownContent && openRouterApiKey?.trim()) {
                  const napLocs = napLocationsFromSite(site);
                  options.onProgress?.(
                    rowIndex,
                    0,
                    `Generating in-context FAQ...`
                  );
                  const briefForFaq = JSON.stringify(seoResearchObj).slice(0, 24000);
                  const entries = await generateBulkFaqEntriesInContext({
                    markdownContent,
                    postTitle,
                    pageMeta: excerpt,
                    primaryKeyword: bulkPrimaryKw,
                    postUrl: postLink,
                    seoResearchBrief: briefForFaq,
                    site,
                    apiKey: openRouterApiKey,
                    siteId: site.id,
                    pairCount: 4,
                  });
                  if (entries.length > 0) {
                    visibleFaqEntries = entries;
                    faqForAcf = buildFAQSchemaScriptFromEntries(
                      entries,
                      bulkPrimaryKw,
                      entity,
                      site.siteUrl,
                      napLocs
                    );
                    seoResearchObj.faq_entries = entries.map((e) => ({
                      question: e.question,
                      answer: e.answer.slice(0, 2000),
                    }));
                  }
                }

                visibleFaqEntries = resolveFaqEntriesForVisibleTable(visibleFaqEntries);

                if (faqForAcf) {
                  seoResearchObj.faq_schema_ld_json = faqForAcf;
                }

                seoResearchJson = mergeSeoResearchWithMeta(
                  JSON.stringify(seoResearchObj),
                  optimizedMetaBootstrap,
                  bulkPrimaryKw
                );
              }

              // Safety: append only if first publish still lacks flo-faq (e.g. no precomputed bundle).
              const bodyHasFloFaq = contentForUpload
                .toLowerCase()
                .includes(`class="${FLO_FAQ_CLASS}"`);
              if (
                !bodyHasFloFaq &&
                visibleFaqEntries?.length &&
                openRouterApiKey?.trim() &&
                contentForUpload.trim()
              ) {
                options.onProgress?.(rowIndex, 0, 'Appending FAQ table to post body...');
                const appended = await appendVisibleFaqTableWithIntro({
                  sourceHtml: contentForUpload,
                  entries: visibleFaqEntries,
                  apiKey: openRouterApiKey,
                  focusKeyword: bulkPrimaryKw || keywordData.keyword,
                  pageTitle: postTitle,
                });
                if (appended?.html) {
                  contentForUpload = appended.html;
                  await updateWordPressPost(
                    site.siteUrl,
                    site.username,
                    site.appPassword,
                    postResult.postId,
                    postTitle,
                    contentForUpload,
                    excerpt,
                    undefined,
                    postTypeForAcf,
                    siteFeaturedImageId,
                    undefined,
                    undefined,
                    slug,
                    entityEndpoint
                  );
                }
              }

              const acfMetaFields: Record<string, string> = {};
              acfMetaFields[fieldNames.dateModifier] = new Date().toISOString().split('T')[0];
              if (enrichedRow.prompt_modifier && enrichedRow.prompt_modifier.trim()) {
                acfMetaFields[fieldNames.promptModifier] = enrichedRow.prompt_modifier.trim();
              }
              const rowKeyword = enrichedRow.keyword?.trim() ?? '';
              if (acfCompetitorAppliesForRow(rowKeyword)) {
                if (enrichedRow.competitor?.trim()) {
                  acfMetaFields[fieldNames.competitor] = enrichedRow.competitor.trim();
                } else if (entity) {
                  acfMetaFields[fieldNames.competitor] = entity;
                }
                if (enrichedRow.competitor_fields?.trim()) {
                  acfMetaFields.competitor_fields = enrichedRow.competitor_fields.trim();
                }
              } else if (enrichedRow.service_area_fields && enrichedRow.service_area_fields.trim()) {
                acfMetaFields['service_area_fields'] = enrichedRow.service_area_fields.trim();
              }
              if (acfOriginAppliesForRow(rowKeyword, sitemapType)) {
                const titleForAcfOrigin = (enrichedRow.title ?? postTitle ?? '').trim();
                const originFromTitle = extractOriginFromSapTitle(titleForAcfOrigin);
                if (enrichedRow.origin && enrichedRow.origin.trim() && enrichedRow.origin.trim() !== 'N/A') {
                  acfMetaFields[fieldNames.origin] = enrichedRow.origin.trim();
                } else if (originFromTitle) {
                  acfMetaFields[fieldNames.origin] = originFromTitle;
                } else if (entity) {
                  acfMetaFields[fieldNames.origin] = entity;
                }
              }

              const optimizedMetaForSync =
                parseOptimizedMetaFromSeoResearchJson(seoResearchJson) ?? optimizedMetaBootstrap;

              const acfWritePayload: Record<string, string> = { ...acfMetaFields };
              if (bulkPrimaryKw) {
                acfWritePayload[fieldNames.keywordFocus] = bulkPrimaryKw;
              }
              if (seoResearchJson) {
                acfWritePayload[fieldNames.seoResearch] = seoResearchJson;
              }
              if (faqForAcf) {
                acfWritePayload[fieldNames.faq] = faqForAcf;
              }
              const mappedMetaFields = buildAcfPayload(
                fieldMapping,
                optimizedMetaForSync,
                bulkPrimaryKw,
                existingAcfFields as Record<string, unknown>,
                seoResearchJson,
                { includeSeoResearchInPayload: false },
              );
              for (const [key, value] of Object.entries(mappedMetaFields)) {
                if (value?.trim() && acfWritePayload[key] === undefined) {
                  acfWritePayload[key] = value;
                }
              }

              const seoResearchJsonForDownload = seoResearchJson;

              options.onProgress?.(
                rowIndex,
                0,
                `Syncing NEO Pulse SEO & fields for post ${postResult.postId}...`,
              );

              if (Object.keys(acfWritePayload).length > 0) {
                const pulseRes = await updateOverviewSeoItem(
                  site.siteUrl,
                  site.username,
                  site.appPassword,
                  {
                    postId: postResult.postId,
                    postType: postTypeForAcf,
                    postTypeEndpoint: entityEndpoint,
                    postTitle: acfWritePayload.seo_title || postTitle,
                    postExcerpt: acfWritePayload.meta_description || excerpt,
                    acf: acfWritePayload,
                  },
                );
                if (pulseRes.ok) {
                  acfUpdatedList = Object.keys(acfWritePayload);
                  console.log(
                    `[Bulk Upload] NEO Pulse SEO synced [${acfUpdatedList.join(', ')}] post ${postResult.postId}`,
                  );
                  options.onProgress?.(
                    rowIndex,
                    0,
                    `NEO Pulse saved: ${acfUpdatedList.join(', ')}`,
                  );
                } else {
                  console.warn(
                    `[Bulk Upload] NEO Pulse SEO sync failed for post ${postResult.postId}:`,
                    pulseRes.error,
                  );
                  options.onProgress?.(
                    rowIndex,
                    0,
                    `NEO Pulse sync failed: ${pulseRes.error || 'Unknown error'}`,
                  );
                }
              }

              addBulkSeoResearchArtifact({
                siteIndex,
                seoResearchJsonForDownload,
                enrichedRow,
                blueprintResult,
                timestamp,
                rowIndex,
                row,
                fileManager,
                generatedFiles,
              });
            } catch (seoError) {
              const errMsg = seoError instanceof Error ? seoError.message : String(seoError);
              console.warn(`[Bulk Upload] NEO Pulse SEO sync warning for post ${postResult.postId}:`, seoError);
              options.onProgress?.(rowIndex, 0, `NEO Pulse SEO sync warning: ${errMsg}`);
            }
  return { acfUpdatedList, contentForUpload };
}
