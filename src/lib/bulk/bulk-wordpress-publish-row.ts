/**
 * WordPress publish phase for one bulk row (multi-site loop, ACF, harness proofs).
 */
import type { WordPressSite } from '@/components/integrations/types';
import type { CSVRow } from '@/lib/bulk/bulk-csv-parser';
import type { BulkProcessingOptions } from '@/lib/bulk/bulk-auto-generate-types';
import { BulkFileManager, type BulkGeneratedFile } from '@/lib/bulk-file-manager';
import type { KeywordData } from '@/lib/keyword-types';
import type { PrecomputedAcfSeoBundle } from '@/lib/content-generation/bulk-acf-seo-bundle';
import type { FaqEntry } from '@/lib/faq-entries';
import type { IntelligentKeywordResearchMergeResult } from '@/lib/bulk/intelligent-keyword-research-merge';
import type { SemrushBulkEnrichmentResult } from '@/lib/wordpress-api/semrush';
import { buildSitesToPostFromPosting, getBulkPreValidatedUrlsForSite } from '@/lib/bulk/bulk-wordpress-link-prefetch';
import {
  mergeSemrushFieldsIntoSeoResearchJson,
  resolveRankMathFromKeywordResearch,
  safeTrimSemrushOverviewForAcf,
} from '@/lib/bulk/bulk-keyword-research-artifacts';
import { parseOptimizedMetaFromSeoResearchJson } from '@/lib/bulk/bulk-row-acf-meta';
import { uploadDirectFeaturedMedia } from '@/lib/bulk/blog-import-direct-extras';
import {
  fetchGoogleMapsImageForEntityWithFallback,
  peekGoogleMapsImageCache,
} from '@/lib/content-generation/google-maps-image-api';
import { prepareHarnessContentForUpload } from '@/lib/content-generation/harness-upload-prep';
import { sanitizeContentForUpload } from '@/lib/content-generation/content-sanitizer';
import { ensureWhatWeOfferTablePageLinks } from '@/lib/content-generation/what-we-offer-table-page-links';
import { buildOptimizedMetaFromKeywordResearch } from '@/lib/content-generation/apply-bulk-meta-from-seo-json';
import { mergeSeoResearchWithMeta, buildAcfPayload } from '@/lib/content-generation/apply-meta-acf-payload';
import { generateBulkFaqEntriesInContext, napLocationsFromSite } from '@/lib/content-generation/bulk-faq-in-context';
import { buildFAQSchemaScriptFromEntries } from '@/lib/content-generation/wordpress-uploader';
import {
  patchPostLinkInSeoResearchJson,
  resolveFaqEntriesForVisibleTable,
} from '@/lib/content-generation/bulk-acf-seo-bundle';
import { appendVisibleFaqTableWithIntro, FLO_FAQ_CLASS, stripTrailingFaqSection } from '@/lib/overview/overview-blog-faq-append';
import {
  buildContentOptimizeHarnessPayload,
  buildContentOptimizePipelineTitles,
  buildGoogleImageEntitySapPipelineTitles,
  extractBodyHarnessTitlesFromRowFiles,
  rowUsesGoogleImageFeatured,
} from '@/lib/overview/overview-content-optimize-pipeline';
import { wpUploadHarnessGeneratedFiles } from '@/lib/overview/overview-wp-upload-harness-artifacts';
import { extractOriginFromSapTitle } from '@/lib/sap-origin-from-title';
import { buildSapSlugFromKeywordEntity } from '@/lib/sap-slug-from-keyword-entity';
import { acfOriginAppliesForRow } from '@/lib/acf-origin-applies';
import { acfCompetitorAppliesForRow } from '@/lib/acf-competitor-applies';
import {
  resolveEntityEndpointForRow,
  resolveEntitySitemapUrlForRow,
} from '@/lib/competitor/competitor-entity-sitemap';
import { loadApiKey } from '@/lib/api';
import { generateExcerpt } from '@/lib/markdown-to-html';
import { sanitizeWordPressSlugSegment } from '@/lib/rank-math-redirect-csv';
import {
  formatWordPressDate,
  resolveBulkWordPressPublishDate,
  resolveWordPressPostStatusForSchedule,
} from '@/lib/wordpress-scheduler';
import {
  createWordPressPost,
  updateWordPressPost,
  uploadWordPressMedia,
} from '@/lib/wordpress-api';
import { updateOverviewSeoItem } from '@/lib/wordpress-api/meta';
import { resolveRecommendedAuthor } from '@/lib/wordpress-api/author-resolver';
import { validateAndStripInvalidLinksFromContent } from '@/lib/wordpress-api/validate-internal-links';
import { NEO_PULSE_DEFAULT_FIELD_MAPPING } from '@/lib/content-generation/acf-field-mapper';
import {
  getSapMapsMediaId,
  sapMapsImageFileName,
  setSapMapsMediaId,
} from '@/lib/bulk/sap-maps-media-bank';
import { parseFaqEntries } from '@/lib/faq-entries';

export type BulkWordPressPublishContext = {
  options: BulkProcessingOptions;
  rowIndex: number;
  row: CSVRow;
  enrichedRow: CSVRow;
  markdownContent: string;
  generatedFiles: BulkGeneratedFile[];
  fileManager: BulkFileManager;
  timestamp: number;
  bulkPrimaryKwResolved: string;
  bulkResolvedPostTitle: string;
  blueprintResult: { agents: unknown[]; title?: string };
  keywordData: KeywordData;
  postsForInternalLinks: Array<{
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    link: string;
    date_gmt: string;
    collection?: string;
    postType?: string;
  }>;
  rowExplicitExternalPairs: Array<{ url: string; anchor?: string }>;
  pipelineBlogModel: string;
  precomputedMetaDescription?: string;
  useGoogleMaps: boolean;
  entityForImage?: string;
  useAiImagePath: boolean;
  precomputedAcfSeoBundle: PrecomputedAcfSeoBundle | null;
  semrushCitationForAcf: string | null;
  intelligentMergeForAcf: IntelligentKeywordResearchMergeResult | null;
  semrushSnapshotForAcf: SemrushBulkEnrichmentResult | null;
  semrushKeywordsContext?: string;
  semrushScatterContext?: string;
  rowExternalUrlsForSanitize: string[];
};

export type BulkWordPressPublishResult = {
  /** Caller should return `generatedFiles` immediately (no sites resolved). */
  earlyExit: boolean;
};

export async function publishBulkRowToWordPressSites(
  ctx: BulkWordPressPublishContext,
): Promise<BulkWordPressPublishResult> {
  const {
    options,
    rowIndex,
    row,
    enrichedRow,
    markdownContent,
    generatedFiles,
    fileManager,
    timestamp,
    bulkPrimaryKwResolved,
    bulkResolvedPostTitle,
    blueprintResult,
    keywordData,
    postsForInternalLinks,
    rowExplicitExternalPairs,
    pipelineBlogModel,
    precomputedMetaDescription,
    useGoogleMaps,
    entityForImage,
    useAiImagePath,
    precomputedAcfSeoBundle,
    semrushCitationForAcf,
    intelligentMergeForAcf,
    semrushSnapshotForAcf,
    semrushKeywordsContext,
    semrushScatterContext,
    rowExternalUrlsForSanitize,
  } = ctx;

  const sitesToPost = buildSitesToPostFromPosting(
    options.wordPressPosting,
    enrichedRow.entity,
  );

  if (sitesToPost.length === 0) {
        const msg =
          'WordPress upload skipped: posting was enabled but no target sites were resolved. Check Integrations (saved site + app password) and bulk WordPress settings.';
        console.warn('[WordPress]', msg);
        options.onError?.(rowIndex, new Error(msg));
        return { earlyExit: true };
      }

      const scheduleSlotIndex = options.bulkScheduleSlotIndex ?? rowIndex;

      // Scheduled date for this row (shared across all sites): CSV `publish_date_gmt` when valid, else frequency-based
      const scheduleOpts = {
        frequency: options.wordPressPosting.frequency,
        customInterval: options.wordPressPosting.customInterval,
        customStaggerOptimized: options.wordPressPosting.customStaggerOptimized,
        dayOfWeek: options.wordPressPosting.dayOfWeek,
        startDate: options.wordPressPosting.startDate,
        startTime: options.wordPressPosting.startTime,
        totalRows: options.wordPressPosting.totalRows,
        useGapScheduling: options.wordPressPosting.useGapScheduling,
        scheduleOccupancy: options.wordPressPosting.scheduleOccupancy,
        publishDays: options.wordPressPosting.publishDays,
      };
      const gapSlotDate = options.wordPressPosting.gapDatesBySlot?.[scheduleSlotIndex];
      const useCsvPublishDates = options.wordPressPosting.useCsvPublishDates !== false;
      let scheduledDate: Date;
      let bulkPublishDateSource: import('@/lib/wordpress-scheduler').BulkPublishDateSource;
      if (useCsvPublishDates) {
        const resolved = resolveBulkWordPressPublishDate({
          rowPublishDateGmt: enrichedRow.publish_date_gmt ?? row.publish_date_gmt,
          rowIndex: scheduleSlotIndex,
          schedule: scheduleOpts,
          useCsvPublishDates: true,
        });
        if (resolved.source === 'csv') {
          scheduledDate = resolved.date;
          bulkPublishDateSource = resolved.source;
        } else if (gapSlotDate) {
          scheduledDate = gapSlotDate;
          bulkPublishDateSource = 'calculated';
        } else {
          scheduledDate = resolved.date;
          bulkPublishDateSource = resolved.source;
        }
      } else if (gapSlotDate) {
        scheduledDate = gapSlotDate;
        bulkPublishDateSource = 'calculated';
      } else {
        const resolved = resolveBulkWordPressPublishDate({
          rowPublishDateGmt: enrichedRow.publish_date_gmt ?? row.publish_date_gmt,
          rowIndex: scheduleSlotIndex,
          schedule: scheduleOpts,
          useCsvPublishDates: false,
        });
        scheduledDate = resolved.date;
        bulkPublishDateSource = resolved.source;
      }
      const firstSite = sitesToPost[0]?.site;
      const uploadBaseUrl = firstSite?.siteUrl?.replace(/\/+$/, "") ?? "";
      let uploadPageUrl = enrichedRow.destination_url?.trim() ?? "";
      if (!uploadPageUrl && uploadBaseUrl && options.useEntitySitemapTemplate) {
        const kw = (bulkPrimaryKwResolved || enrichedRow.keyword || "").trim();
        const ent =
          enrichedRow.entity?.trim() && enrichedRow.entity.trim() !== "N/A"
            ? enrichedRow.entity.trim()
            : "";
        const slugEarly = buildSapSlugFromKeywordEntity(kw, ent);
        if (slugEarly) uploadPageUrl = `${uploadBaseUrl}/${slugEarly}`;
      }
      options.onProgress?.(rowIndex, 0, 'Quality control: checking HTML...');
      options.onProgress?.(rowIndex, 0, 'Preparing harness content for upload...');
      let htmlContent = await prepareHarnessContentForUpload({
        markdownContent,
        blueprintAgents: blueprintResult.agents,
        wordPressPosts: postsForInternalLinks,
        postsForInternalLinks,
        siteId: firstSite?.id,
        siteUrl: firstSite?.siteUrl,
        currentPageUrl: uploadPageUrl || undefined,
        externalUrlPairs: rowExplicitExternalPairs,
        apiKey: options.openRouterApiKey || loadApiKey(),
        keyword: bulkPrimaryKwResolved,
        articleTitle: bulkResolvedPostTitle,
        model: pipelineBlogModel,
      });
      if (options.wordPressPagesForOfferTable?.length && firstSite?.siteUrl) {
        htmlContent = ensureWhatWeOfferTablePageLinks(
          htmlContent,
          options.wordPressPagesForOfferTable,
          uploadPageUrl || firstSite.siteUrl,
          firstSite.siteUrl,
        );
      }
      const rankMeta = resolveRankMathFromKeywordResearch(keywordData);
      // Prefer CSV meta when filled; then generator meta; then research / body
      const csvMeta = enrichedRow.meta_description?.trim() || "";
      const excerpt =
        csvMeta ||
        precomputedMetaDescription?.trim() ||
        rankMeta.metaDescription ||
        generateExcerpt(markdownContent);

      const bulkPrimaryKw = bulkPrimaryKwResolved;

      let featuredImageId: number | undefined;
      let featuredImageLink: string | null = null;
      let directFeaturedPayload: { imageBase64: string; filename: string } | undefined;
      let imageFile: { fileName: string; content: string } | undefined;

      if (useGoogleMaps && entityForImage) {
        if (options.googleMapsImagePromise) {
          await options.googleMapsImagePromise;
        }
        let mapsPayload =
          peekGoogleMapsImageCache(entityForImage) ??
          (await fetchGoogleMapsImageForEntityWithFallback(
            entityForImage,
            options.googleMapsImageSerpLocation,
          ));
        const bank = options.sapMapsMediaBank;
        const firstSite = sitesToPost[0].site;
        featuredImageId = bank ? getSapMapsMediaId(bank, firstSite.id, entityForImage) : undefined;
        if (featuredImageId == null && mapsPayload?.imageBase64?.trim()) {
          const extension = mapsPayload.mimeType === "image/jpeg" ? "jpg" : "png";
          directFeaturedPayload = {
            imageBase64: mapsPayload.imageBase64,
            filename: sapMapsImageFileName(entityForImage, extension),
          };
          const uploaded = await uploadDirectFeaturedMedia({
            site: firstSite,
            imageBase64: directFeaturedPayload.imageBase64,
            filename: directFeaturedPayload.filename,
            title: enrichedRow.title || blueprintResult.title || entityForImage,
            keyword: bulkPrimaryKw || entityForImage,
          });
          featuredImageId = uploaded.mediaId;
          featuredImageLink = uploaded.url;
          if (bank) {
            setSapMapsMediaId(bank, firstSite.id, entityForImage, featuredImageId);
          }
        }
      } else {
        const aiImageFile = generatedFiles.find(
          (f) =>
            f.fileName.endsWith('.png') ||
            f.fileName.endsWith('.jpg') ||
            f.fileName.endsWith('.jpeg'),
        );
        if (useAiImagePath && !aiImageFile?.content) {
          throw new Error('Featured image was required but no image file was available for upload');
        }
        if (aiImageFile?.content && sitesToPost[0]?.site) {
          imageFile = { fileName: aiImageFile.fileName, content: aiImageFile.content };
          try {
            options.onProgress?.(rowIndex, 0, 'Uploading featured image to WordPress...');
            let imageBase64 = aiImageFile.content;
            if (imageBase64.startsWith('data:')) {
              imageBase64 = imageBase64.split(',')[1];
            }
            const mediaTitle = enrichedRow.title || blueprintResult.title;
            const mediaResult = await uploadWordPressMedia(
              sitesToPost[0].site.siteUrl,
              sitesToPost[0].site.username,
              sitesToPost[0].site.appPassword,
              imageBase64,
              aiImageFile.fileName,
              mediaTitle,
              undefined,
            );
            if (mediaResult.success && mediaResult.mediaId) {
              featuredImageId = mediaResult.mediaId;
              options.onProgress?.(rowIndex, 0, `Featured image uploaded: Media ID ${featuredImageId}`);
            } else {
              options.onError?.(rowIndex, new Error('WordPress media upload failed'));
            }
          } catch (error) {
            options.onError?.(rowIndex, error instanceof Error ? error : new Error(String(error)));
          }
        }
      }

      const needsEntityWiki = sitesToPost.some((s) => s.sitemapType === 'entity');
      let entityWikiForSanitize: { url: string; label: string } | undefined;
      if (
        needsEntityWiki &&
        enrichedRow.entity?.trim() &&
        enrichedRow.entity.trim() !== 'N/A'
      ) {
        const url = enrichedRow.wikipedia_url?.trim();
        if (url) {
          entityWikiForSanitize = { url, label: enrichedRow.entity.trim() };
        }
      }

      // Post to all selected sites
      for (let siteIndex = 0; siteIndex < sitesToPost.length; siteIndex++) {
        const { site, sitemapType } = sitesToPost[siteIndex];
        
        try {
          options.onProgress?.(rowIndex, 0, `Uploading to WordPress (${site.name})...`);

          // Always attempt upload for each row. (We no longer skip when an entity label appears in the entity
          // sitemap - titles/slugs differ per post; users asked to never skip scheduled rows for that reason.)

          const standardRestEndpoint =
            options.wordPressPosting?.wordpressRestEndpoint === 'pages' ? 'pages' : 'posts';
          const entityEndpoint =
            sitemapType === 'entity'
              ? resolveEntityEndpointForRow(site, enrichedRow, sitemapType)
              : standardRestEndpoint;

          let siteFeaturedImageId = featuredImageId;
          if (siteIndex > 0 && useGoogleMaps && entityForImage) {
            const bank = options.sapMapsMediaBank;
            siteFeaturedImageId = bank ? getSapMapsMediaId(bank, site.id, entityForImage) : undefined;
            if (siteFeaturedImageId == null) {
              let payload = directFeaturedPayload;
              if (!payload) {
                const mapsPayload =
                  peekGoogleMapsImageCache(entityForImage) ??
                  (await fetchGoogleMapsImageForEntityWithFallback(
                    entityForImage,
                    options.googleMapsImageSerpLocation,
                  ));
                if (mapsPayload?.imageBase64?.trim()) {
                  const extension = mapsPayload.mimeType === "image/jpeg" ? "jpg" : "png";
                  payload = {
                    imageBase64: mapsPayload.imageBase64,
                    filename: sapMapsImageFileName(entityForImage, extension),
                  };
                }
              }
              if (payload) {
                const uploaded = await uploadDirectFeaturedMedia({
                  site,
                  imageBase64: payload.imageBase64,
                  filename: payload.filename,
                  title: enrichedRow.title || blueprintResult.title || entityForImage,
                  keyword: bulkPrimaryKw || entityForImage,
                });
                siteFeaturedImageId = uploaded.mediaId;
                if (!featuredImageLink) featuredImageLink = uploaded.url;
                if (bank) {
                  setSapMapsMediaId(bank, site.id, entityForImage, siteFeaturedImageId);
                }
              }
            }
          } else if (siteIndex > 0 && imageFile?.content) {
            let imageBase64 = imageFile.content;
            if (imageBase64.startsWith('data:')) {
              imageBase64 = imageBase64.split(',')[1];
            }
            const mediaTitle = enrichedRow.title || blueprintResult.title;
            const mediaResult = await uploadWordPressMedia(
              site.siteUrl,
              site.username,
              site.appPassword,
              imageBase64,
              imageFile.fileName,
              mediaTitle,
              undefined,
            );
            if (!mediaResult.success || !mediaResult.mediaId) {
              throw new Error('WordPress media upload failed');
            }
            siteFeaturedImageId = mediaResult.mediaId;
          }

          const postTitle = bulkResolvedPostTitle;

          let slug: string | undefined;
          const optimizeSlug = sanitizeWordPressSlugSegment(options.optimizePreserveSlug ?? "");
          if (optimizeSlug.length >= 2) {
            slug = optimizeSlug;
          } else {
          const lockedSlug = sanitizeWordPressSlugSegment(enrichedRow.target_slug ?? "");
          if (lockedSlug.length >= 2) {
            slug = lockedSlug;
          } else if (sitemapType === "entity") {
            const kw = (bulkPrimaryKw || enrichedRow.keyword || "").trim();
            const ent =
              enrichedRow.entity?.trim() && enrichedRow.entity.trim() !== "N/A"
                ? enrichedRow.entity.trim()
                : "";
            slug = buildSapSlugFromKeywordEntity(kw, ent);
            if (!slug || slug.length < 2) slug = undefined;
          } else {
            throw new Error(
              "Blog row is missing target_slug. Regenerate Ideas so the URL slug agent can set the permalink.",
            );
          }
          }

          const wpPostStatus = options.wordPressPosting.draftOnly
            ? ('draft' as const)
            : resolveWordPressPostStatusForSchedule(scheduledDate);
          const contractDestination = enrichedRow.destination_url?.trim();

          let authorId: number | undefined;
          try {
            authorId = await resolveRecommendedAuthor({
              site,
              postTypeEndpoint: entityEndpoint,
              apiKey: options.openRouterApiKey || loadApiKey(),
              siteId: site.id,
            });
          } catch {
            authorId = undefined;
          }

          // Sanitize: remove invalid internal links (not in WordPress list), non-Wikipedia external
          const isEntityUpload =
            sitemapType === 'entity' && !!resolveEntitySitemapUrlForRow(site, enrichedRow);
          const sanitizedHtmlContent = sanitizeContentForUpload(
            htmlContent,
            site.siteUrl,
            postsForInternalLinks,
            isEntityUpload && entityWikiForSanitize ? entityWikiForSanitize.url : undefined,
            rowExternalUrlsForSanitize,
            isEntityUpload && entityWikiForSanitize ? entityWikiForSanitize.label : undefined,
          );

          const preValidatedUrls = getBulkPreValidatedUrlsForSite(site.id);
          const { html: validatedHtml } = await validateAndStripInvalidLinksFromContent(
            sanitizedHtmlContent,
            undefined,
            site.siteUrl,
            (msg) => options.onProgress?.(rowIndex, 0, msg),
            undefined,
            preValidatedUrls ?? undefined
          );
          let contentForUpload = stripTrailingFaqSection(validatedHtml);

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

          if (useGoogleMaps && entityForImage && !siteFeaturedImageId) {
            const mapsPayload = await fetchGoogleMapsImageForEntityWithFallback(
              entityForImage,
              options.googleMapsImageSerpLocation,
            );
            if (mapsPayload?.imageBase64?.trim()) {
              const extension = mapsPayload.mimeType === "image/jpeg" ? "jpg" : "png";
              const uploaded = await uploadDirectFeaturedMedia({
                site,
                imageBase64: mapsPayload.imageBase64,
                filename: sapMapsImageFileName(entityForImage, extension),
                title: enrichedRow.title || blueprintResult.title || entityForImage,
                keyword: bulkPrimaryKw || entityForImage,
              });
              siteFeaturedImageId = uploaded.mediaId;
              featuredImageLink = uploaded.url ?? featuredImageLink;
              if (options.sapMapsMediaBank) {
                setSapMapsMediaId(options.sapMapsMediaBank, site.id, entityForImage, siteFeaturedImageId);
              }
            }
          }
          let postResult: { success: boolean; postId?: number; link?: string } = { success: false };
          if (options.updateTargetPostId != null && options.updateTargetPostId > 0) {
            const updateResult = await updateWordPressPost(
              site.siteUrl,
              site.username,
              site.appPassword,
              options.updateTargetPostId,
              postTitle,
              contentForUpload,
              excerpt,
              wpPostStatus,
              sitemapType === 'entity' ? entityEndpoint : 'post',
              siteFeaturedImageId,
              undefined,
              undefined,
              slug,
              entityEndpoint,
            );
            postResult = {
              success: true,
              postId: updateResult.postId ?? options.updateTargetPostId,
              link: updateResult.link,
            };
          } else {
            postResult = await createWordPressPost(
              site.siteUrl,
              site.username,
              site.appPassword,
              postTitle,
              contentForUpload,
              excerpt,
              wpPostStatus,
              options.wordPressPosting.draftOnly
                ? undefined
                : formatWordPressDate(scheduledDate),
              siteFeaturedImageId,
              undefined,
              undefined,
              undefined,
              entityEndpoint,
              slug,
              authorId,
            );
          }

          if (postResult.success && postResult.postId) {
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

              let seoResearchJsonForDownload = seoResearchJson;

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

              if (siteIndex === 0 && seoResearchJsonForDownload) {
                const researchSlug = (enrichedRow.title || blueprintResult.title || 'post')
                  .replace(/[^a-zA-Z0-9]+/g, '-')
                  .toLowerCase();
                const researchFileName = `seo-research-${researchSlug}-${timestamp}.json`;
                const researchFileId = BulkFileManager.createFileId(rowIndex, 'seo-research', timestamp);
                let formattedSeoResearch = seoResearchJsonForDownload;
                try {
                  formattedSeoResearch = JSON.stringify(JSON.parse(seoResearchJsonForDownload), null, 2);
                } catch {
                  formattedSeoResearch = seoResearchJsonForDownload;
                }
                const seoResearchFile: BulkGeneratedFile = {
                  id: researchFileId,
                  rowIndex,
                  fileName: researchFileName,
                  content: formattedSeoResearch,
                  mimeType: 'application/json',
                  status: 'completed',
                  timestamp,
                  rowData: row,
                };
                fileManager.addFile(seoResearchFile);
                generatedFiles.push(seoResearchFile);
              }
            } catch (seoError) {
              const errMsg = seoError instanceof Error ? seoError.message : String(seoError);
              console.warn(`[Bulk Upload] NEO Pulse SEO sync warning for post ${postResult.postId}:`, seoError);
              options.onProgress?.(rowIndex, 0, `NEO Pulse SEO sync warning: ${errMsg}`);
            }

            // Create wordpress-post JSON file for this site
            const siteNameSlug = site.name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
            const wordPressPostFileName = `wordpress-post-${siteNameSlug}-${enrichedRow.title.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${timestamp}.json`;
            const wordPressPostFileId = BulkFileManager.createFileId(rowIndex, `wordpress-post-${siteIndex}`, timestamp);

            const wordPressPostFile: BulkGeneratedFile = {
              id: wordPressPostFileId,
              rowIndex,
              fileName: wordPressPostFileName,
              content: JSON.stringify({
                postId: postResult.postId,
                title: postTitle,
                link: postResult.link,
                status: postResult.status,
                scheduledDate: scheduledDate.toISOString(),
                date_gmt: formatWordPressDate(scheduledDate),
                publishDateSource: bulkPublishDateSource,
                endpoint: entityEndpoint,
                sitemapType: sitemapType,
                siteName: site.name,
                siteUrl: site.siteUrl,
              }, null, 2),
              mimeType: 'application/json',
              status: 'completed',
              timestamp,
              rowData: row,
            };

            fileManager.addFile(wordPressPostFile);
            generatedFiles.push(wordPressPostFile);

            if (siteIndex === 0) {
              const finalHtmlTimestamp = Date.now();
              const finalContentHtmlFileName = BulkFileManager.generateFileName(
                row,
                "content",
                timestamp,
              ).replace(/\.md$/i, ".html");
              const finalContentHtmlFile: BulkGeneratedFile = {
                id: BulkFileManager.createFileId(rowIndex, "content-html-final", finalHtmlTimestamp),
                rowIndex,
                fileName: finalContentHtmlFileName,
                content: contentForUpload,
                mimeType: "text/html",
                status: "completed",
                timestamp: finalHtmlTimestamp,
                rowData: enrichedRow,
              };
              fileManager.addFile(finalContentHtmlFile);
              generatedFiles.push(finalContentHtmlFile);

              const pageUrl =
                (typeof postResult.link === "string" && postResult.link.trim()) ||
                `${String(site.siteUrl).replace(/\/$/, "")}/?p=${postResult.postId}`;
              const wordpressDoc = {
                success: true,
                postId: postResult.postId,
                link: postResult.link ?? null,
                pageUrl,
                title: postTitle,
                wordpressSite: site.siteUrl,
                wordpressSiteId: site.id,
                wordpressSiteName: site.name,
                uploadedAt: new Date().toISOString(),
                error: null,
                featuredMediaId: siteFeaturedImageId ?? null,
                featuredImageLink: featuredImageLink ?? null,
              };
              const payloadDoc = {
                pageUrl,
                postId: postResult.postId,
                postTitle,
                postExcerpt: excerpt,
                endpoint: entityEndpoint,
                sitemapType,
                featuredMediaId: siteFeaturedImageId ?? null,
                featuredImageLink: featuredImageLink ?? null,
              };
              for (const proof of wpUploadHarnessGeneratedFiles(
                pageUrl,
                JSON.stringify(payloadDoc, null, 2),
                JSON.stringify(wordpressDoc, null, 2),
              )) {
                const proofFile: BulkGeneratedFile = {
                  id: BulkFileManager.createFileId(rowIndex, proof.name, timestamp),
                  rowIndex,
                  fileName: proof.name,
                  content: proof.content,
                  mimeType: proof.mimeType,
                  status: "completed",
                  timestamp,
                  rowData: row,
                };
                fileManager.addFile(proofFile);
                generatedFiles.push(proofFile);
              }
              const bodyTitles = extractBodyHarnessTitlesFromRowFiles(
                generatedFiles.map((file) => ({
                  name: file.fileName,
                  fileName: file.fileName,
                  content: file.content,
                })),
              );
              const pipelineTitles = rowUsesGoogleImageFeatured(enrichedRow, options.featuredImageType)
                ? buildGoogleImageEntitySapPipelineTitles(bodyTitles)
                : buildContentOptimizePipelineTitles(bodyTitles);
              const wpSectionIndex = pipelineTitles.indexOf("WordPress upload");
              if (wpSectionIndex >= 0) {
                options.onHarnessSection?.(
                  buildContentOptimizeHarnessPayload(
                    rowIndex,
                    wpSectionIndex,
                    "done",
                    undefined,
                    pipelineTitles,
                  ),
                );
              }
            }

            options.onProgress?.(
              rowIndex,
              0,
              `WordPress post created on ${site.name}: ${postResult.link || postResult.postId} (ID ${postResult.postId}, scheduled for ${formatWordPressDate(scheduledDate)}${
                bulkPublishDateSource === 'csv' ? ', from CSV publish_date_gmt' : ''
              })`,
            );
            options.onAppendHistory?.({
              ts: Date.now(),
              entityOrTitle: enrichedRow.entity?.trim() || enrichedRow.title || undefined,
              site: site.name,
              step: 'upload',
              message: `Post created on ${site.name}: ID ${postResult.postId}${acfUpdatedList?.length ? `, ACF updated: ${acfUpdatedList.join(', ')}` : ''}`,
              outcome: 'ok',
              postId: postResult.postId,
              permalink: postResult.link,
              acfUpdated: acfUpdatedList,
              mode: sitemapType,
            });
          }
        } catch (uploadError) {
          const errMsg =
            uploadError instanceof Error ? uploadError.message : String(uploadError);
          console.error(`[WordPress] Upload failed for ${site.name}:`, uploadError);
          options.onProgress?.(rowIndex, 0, `WordPress upload failed: ${errMsg}`);
          options.onError?.(
            rowIndex,
            uploadError instanceof Error ? uploadError : new Error(errMsg),
          );
          if (siteIndex === 0) {
            const failEndpoint =
              sitemapType === "entity"
                ? resolveEntityEndpointForRow(site, enrichedRow, sitemapType)
                : "posts";
            const pageUrl =
              uploadPageUrl ||
              `${String(site.siteUrl).replace(/\/$/, "")}/?p=pending`;
            const wordpressDoc = {
              success: false,
              postId: null,
              link: null,
              pageUrl,
              title: bulkResolvedPostTitle,
              wordpressSite: site.siteUrl,
              wordpressSiteId: site.id,
              wordpressSiteName: site.name,
              uploadedAt: new Date().toISOString(),
              error: errMsg,
              featuredMediaId: featuredImageId ?? null,
              featuredImageLink: featuredImageLink ?? null,
            };
            const payloadDoc = {
              pageUrl,
              postId: null,
              postTitle: bulkResolvedPostTitle,
              postExcerpt: excerpt,
              endpoint: failEndpoint,
              sitemapType,
              featuredMediaId: featuredImageId ?? null,
              featuredImageLink: featuredImageLink ?? null,
              error: errMsg,
            };
            for (const proof of wpUploadHarnessGeneratedFiles(
              pageUrl,
              JSON.stringify(payloadDoc, null, 2),
              JSON.stringify(wordpressDoc, null, 2),
            )) {
              const proofFile: BulkGeneratedFile = {
                id: BulkFileManager.createFileId(rowIndex, proof.name, timestamp),
                rowIndex,
                fileName: proof.name,
                content: proof.content,
                mimeType: proof.mimeType,
                status: "completed",
                timestamp,
                rowData: row,
              };
              fileManager.addFile(proofFile);
              generatedFiles.push(proofFile);
            }
            const bodyTitles = extractBodyHarnessTitlesFromRowFiles(
              generatedFiles.map((file) => ({
                name: file.fileName,
                fileName: file.fileName,
                content: file.content,
              })),
            );
            const pipelineTitles = rowUsesGoogleImageFeatured(enrichedRow, options.featuredImageType)
              ? buildGoogleImageEntitySapPipelineTitles(bodyTitles)
              : buildContentOptimizePipelineTitles(bodyTitles);
            const wpSectionIndex = pipelineTitles.indexOf("WordPress upload");
            if (wpSectionIndex >= 0) {
              options.onHarnessSection?.(
                buildContentOptimizeHarnessPayload(
                  rowIndex,
                  wpSectionIndex,
                  "done",
                  undefined,
                  pipelineTitles,
                ),
              );
            }
          }
        }
      }
  return { earlyExit: false };
}
