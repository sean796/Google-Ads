/**
 * Publish schedule, post target, and generated file artifacts for bulk WordPress rows.
 */

import type { WordPressSite } from '@/components/integrations/types';
import type { CSVRow } from '@/lib/bulk/bulk-csv-parser';
import type { BulkProcessingOptions } from '@/lib/bulk/bulk-auto-generate-types';
import { BulkFileManager, type BulkGeneratedFile } from '@/lib/bulk-file-manager';
import { loadApiKey } from '@/lib/api';
import { sanitizeWordPressSlugSegment } from '@/lib/rank-math-redirect-csv';
import { buildSapSlugFromKeywordEntity } from '@/lib/sap-slug-from-keyword-entity';
import {
  formatWordPressDate,
  resolveBulkWordPressPublishDate,
} from '@/lib/wordpress-scheduler';
import { resolveRecommendedAuthor } from '@/lib/wordpress-api/author-resolver';
import {
  resolveEntityEndpointForRow,
} from '@/lib/competitor-research/competitor-entity-sitemap';
import { wpUploadHarnessGeneratedFiles } from '@/lib/overview/overview-wp-upload-harness-artifacts';
import {
  buildContentOptimizeHarnessPayload,
  buildContentOptimizePipelineTitles,
  buildGoogleImageEntitySapPipelineTitles,
  extractBodyHarnessTitlesFromRowFiles,
  rowUsesGoogleImageFeatured,
} from '@/lib/overview/overview-content-optimize-pipeline';


// Scheduled date for this row (shared across all sites): CSV `publish_date_gmt` when valid, else frequency-based
export function resolveBulkPublishSchedule(args: {
  options: BulkProcessingOptions;
  scheduleSlotIndex: number;
  enrichedRow: CSVRow;
  row: CSVRow;
}): {
  scheduledDate: Date;
  bulkPublishDateSource: import('@/lib/wordpress-scheduler').BulkPublishDateSource;
} {
  const { options, scheduleSlotIndex, enrichedRow, row } = args;
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
  return { scheduledDate, bulkPublishDateSource };
}

export function resolveBulkWordPressSlug(args: {
  options: BulkProcessingOptions;
  enrichedRow: CSVRow;
  sitemapType: 'post' | 'entity';
  bulkPrimaryKw: string;
}): string | undefined {
  const { options, enrichedRow, sitemapType, bulkPrimaryKw } = args;
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
  return slug;
}

export async function resolveBulkWordPressAuthor(args: {
  options: BulkProcessingOptions;
  site: WordPressSite;
  entityEndpoint: string;
}): Promise<number | undefined> {
  const { options, site, entityEndpoint } = args;
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
  return authorId;
}

export function addBulkSeoResearchArtifact(args: {
  siteIndex: number;
  seoResearchJsonForDownload: string;
  enrichedRow: CSVRow;
  blueprintResult: { title?: string };
  timestamp: number;
  rowIndex: number;
  row: CSVRow;
  fileManager: BulkFileManager;
  generatedFiles: BulkGeneratedFile[];
}): void {
  const { siteIndex, seoResearchJsonForDownload, enrichedRow, blueprintResult, timestamp, rowIndex, row, fileManager, generatedFiles } = args;
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
}

export function addBulkWordPressPostArtifacts(args: {
  site: WordPressSite;
  siteIndex: number;
  enrichedRow: CSVRow;
  row: CSVRow;
  generatedFiles: BulkGeneratedFile[];
  fileManager: BulkFileManager;
  timestamp: number;
  postResult: { success: boolean; postId?: number; link?: string; status?: string };
  postTitle: string;
  scheduledDate: Date;
  bulkPublishDateSource: import('@/lib/wordpress-scheduler').BulkPublishDateSource;
  entityEndpoint: string;
  sitemapType: 'post' | 'entity';
  contentForUpload: string;
  excerpt: string;
  siteFeaturedImageId: number | undefined;
  featuredImageLink: string | null;
  options: BulkProcessingOptions;
  rowIndex: number;
}): void {
  const { site, siteIndex, enrichedRow, row, generatedFiles, fileManager, timestamp, postResult, postTitle, scheduledDate, bulkPublishDateSource, entityEndpoint, sitemapType, contentForUpload, excerpt, siteFeaturedImageId, featuredImageLink, options, rowIndex } = args;
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
}

export function addBulkWordPressFailureArtifacts(args: {
  siteIndex: number;
  site: WordPressSite;
  featuredImageId: number | undefined;
  featuredImageLink: string | null;
  uploadPageUrl: string;
  bulkResolvedPostTitle: string;
  excerpt: string;
  sitemapType: 'post' | 'entity';
  enrichedRow: CSVRow;
  generatedFiles: BulkGeneratedFile[];
  fileManager: BulkFileManager;
  timestamp: number;
  row: CSVRow;
  options: BulkProcessingOptions;
  errMsg: string;
  rowIndex: number;
}): void {
  const { siteIndex, site, featuredImageId, featuredImageLink, uploadPageUrl, bulkResolvedPostTitle, excerpt, sitemapType, enrichedRow, generatedFiles, fileManager, timestamp, row, options, errMsg, rowIndex } = args;
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
