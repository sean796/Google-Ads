/**
 * WordPress publish phase for one bulk row (multi-site loop, ACF, harness proofs).
 */
import type { WordPressSite } from '@/components/integrations/types';
import type { CSVRow } from '@/lib/bulk/bulk-csv-parser';
import type { BulkProcessingOptions } from '@/lib/bulk/bulk-auto-generate-types';
import { BulkFileManager, type BulkGeneratedFile } from '@/lib/bulk-file-manager';
import type { KeywordData } from '@/lib/keyword-types';
import type { PrecomputedAcfSeoBundle } from '@/lib/content-generation/bulk-acf-seo-bundle';
import type { IntelligentKeywordResearchMergeResult } from '@/lib/bulk/intelligent-keyword-research-merge';
import type { SemrushBulkEnrichmentResult } from '@/lib/wordpress-api/semrush';
import type { AgentConfig } from '@/types/agent-config';
import type { ExternalLinkPair } from '@/lib/content-generation/external-link-placeholders';
import { buildSitesToPostFromPosting, getBulkPreValidatedUrlsForSite } from '@/lib/bulk/bulk-wordpress-link-prefetch';
import { resolveRankMathFromKeywordResearch } from '@/lib/bulk/bulk-keyword-research-artifacts';
import { prepareHarnessContentForUpload } from '@/lib/content-generation/harness-upload-prep';
import { sanitizeContentForUpload } from '@/lib/content-generation/content-sanitizer';
import { ensureWhatWeOfferTablePageLinks } from '@/lib/content-generation/what-we-offer-table-page-links';
import { stripTrailingFaqSection } from '@/lib/overview/overview-blog-faq-append';
import { buildSapSlugFromKeywordEntity } from '@/lib/sap-slug-from-keyword-entity';
import {
  resolveEntityEndpointForRow,
  resolveEntitySitemapUrlForRow,
} from '@/lib/competitor-research/competitor-entity-sitemap';
import { loadApiKey } from '@/lib/api';
import { generateExcerpt } from '@/lib/markdown-to-html';
import {
  formatWordPressDate,
  resolveWordPressPostStatusForSchedule,
} from '@/lib/wordpress-scheduler';
import { createWordPressPost, updateWordPressPost } from '@/lib/wordpress-api';
import { validateAndStripInvalidLinksFromContent } from '@/lib/wordpress-api/validate-internal-links';
import {
  ensureBulkSiteFeaturedImageFromMaps,
  resolveBulkSiteFeaturedImage,
  resolveInitialBulkFeaturedImage,
} from '@/lib/bulk/bulk-wordpress-publish-media';
import {
  appendEarlyBulkFaqTable,
  syncBulkRowAcfForPost,
} from '@/lib/bulk/bulk-wordpress-publish-acf-sync';
import {
  addBulkWordPressFailureArtifacts,
  addBulkWordPressPostArtifacts,
  resolveBulkPublishSchedule,
  resolveBulkWordPressAuthor,
  resolveBulkWordPressSlug,
} from '@/lib/bulk/bulk-wordpress-publish-artifacts';

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
  blueprintResult: { agents: AgentConfig[]; title?: string };
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
  rowExplicitExternalPairs: ExternalLinkPair[];
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
      const { scheduledDate, bulkPublishDateSource } = resolveBulkPublishSchedule({
        options,
        scheduleSlotIndex,
        enrichedRow,
        row,
      });
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
      const initialFeatured = await resolveInitialBulkFeaturedImage({
        options,
        rowIndex,
        sitesToPost,
        useGoogleMaps,
        entityForImage,
        enrichedRow,
        blueprintResult,
        bulkPrimaryKw,
        generatedFiles,
        useAiImagePath,
      });
      const featuredImageId = initialFeatured.featuredImageId;
      let featuredImageLink = initialFeatured.featuredImageLink;
      const directFeaturedPayload = initialFeatured.directFeaturedPayload;
      const imageFile = initialFeatured.imageFile;
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

          const siteFeatured = await resolveBulkSiteFeaturedImage({
            options,
            site,
            siteIndex,
            useGoogleMaps,
            entityForImage,
            featuredImageId,
            featuredImageLink,
            directFeaturedPayload,
            imageFile,
            enrichedRow,
            blueprintResult,
            bulkPrimaryKw,
          });
          let siteFeaturedImageId = siteFeatured.siteFeaturedImageId;
          featuredImageLink = siteFeatured.featuredImageLink;

          const postTitle = bulkResolvedPostTitle;
          const slug = resolveBulkWordPressSlug({
            options,
            enrichedRow,
            sitemapType,
            bulkPrimaryKw,
          });
          const wpPostStatus = options.wordPressPosting.draftOnly
            ? ('draft' as const)
            : resolveWordPressPostStatusForSchedule(scheduledDate);
          const contractDestination = enrichedRow.destination_url?.trim();
          const authorId = await resolveBulkWordPressAuthor({
            options,
            site,
            entityEndpoint,
          });
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
          contentForUpload = await appendEarlyBulkFaqTable({
            contentForUpload,
            precomputedAcfSeoBundle,
            options,
            bulkPrimaryKw,
            keywordData,
            postTitle,
            rowIndex,
          });
          const ensuredFeatured = await ensureBulkSiteFeaturedImageFromMaps({
            options,
            site,
            useGoogleMaps,
            entityForImage,
            siteFeaturedImageId,
            featuredImageLink,
            enrichedRow,
            blueprintResult,
            bulkPrimaryKw,
          });
          siteFeaturedImageId = ensuredFeatured.siteFeaturedImageId;
          featuredImageLink = ensuredFeatured.featuredImageLink;
          let postResult: { success: boolean; postId?: number; link?: string; status?: string } = { success: false };
          if (options.updateTargetPostId != null && options.updateTargetPostId > 0) {
            // updateWordPressPost only accepts draft | publish; a scheduled update is published.
            const wpUpdateStatus: 'draft' | 'publish' = wpPostStatus === 'draft' ? 'draft' : 'publish';
            const updateResult = await updateWordPressPost(
              site.siteUrl,
              site.username,
              site.appPassword,
              options.updateTargetPostId,
              postTitle,
              contentForUpload,
              excerpt,
              wpUpdateStatus,
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
              status: updateResult.status,
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

          let acfUpdatedList: string[] | undefined;
          if (postResult.success && postResult.postId) {
            const acfSync = await syncBulkRowAcfForPost({
              options,
              rowIndex,
              enrichedRow,
              row,
              markdownContent,
              generatedFiles,
              fileManager,
              timestamp,
              bulkPrimaryKw,
              postTitle,
              keywordData,
              excerpt,
              rankMeta,
              precomputedAcfSeoBundle,
              semrushCitationForAcf,
              intelligentMergeForAcf,
              semrushSnapshotForAcf,
              semrushKeywordsContext,
              semrushScatterContext,
              site,
              sitemapType,
              entityEndpoint,
              postResult,
              contractDestination,
              contentForUpload,
              slug,
              siteFeaturedImageId,
              siteIndex,
              blueprintResult,
            });
            acfUpdatedList = acfSync.acfUpdatedList;
            contentForUpload = acfSync.contentForUpload;
            addBulkWordPressPostArtifacts({
              site,
              siteIndex,
              enrichedRow,
              row,
              generatedFiles,
              fileManager,
              timestamp,
              postResult,
              postTitle,
              scheduledDate,
              bulkPublishDateSource,
              entityEndpoint,
              sitemapType,
              contentForUpload,
              excerpt,
              siteFeaturedImageId,
              featuredImageLink,
              options,
              rowIndex,
            });
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
          addBulkWordPressFailureArtifacts({
            siteIndex,
            site,
            featuredImageId,
            featuredImageLink,
            uploadPageUrl,
            bulkResolvedPostTitle,
            excerpt,
            sitemapType,
            enrichedRow,
            generatedFiles,
            fileManager,
            timestamp,
            row,
            options,
            errMsg,
            rowIndex,
          });
        }
      }
  return { earlyExit: false };
}
