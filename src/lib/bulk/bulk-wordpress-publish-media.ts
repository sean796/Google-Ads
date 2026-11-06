/**
 * Featured image media handling for bulk WordPress publish rows.
 */

import type { WordPressSite } from '@/components/integrations/types';
import type { CSVRow } from '@/lib/bulk/bulk-csv-parser';
import type { BulkProcessingOptions } from '@/lib/bulk/bulk-auto-generate-types';
import type { BulkGeneratedFile } from '@/lib/bulk-file-manager';
import { uploadDirectFeaturedMedia } from '@/lib/bulk/blog-import-direct-extras';
import {
  fetchGoogleMapsImageForEntityWithFallback,
  peekGoogleMapsImageCache,
} from '@/lib/content-generation/google-maps-image-api';
import { uploadWordPressMedia } from '@/lib/wordpress-api';
import {
  getSapMapsMediaId,
  sapMapsImageFileName,
  setSapMapsMediaId,
} from '@/lib/bulk/sap-maps-media-bank';


export async function resolveInitialBulkFeaturedImage(args: {
  options: BulkProcessingOptions;
  rowIndex: number;
  sitesToPost: Array<{ site: WordPressSite; sitemapType: 'post' | 'entity' }>;
  useGoogleMaps: boolean;
  entityForImage?: string;
  enrichedRow: CSVRow;
  blueprintResult: { title?: string };
  bulkPrimaryKw: string;
  generatedFiles: BulkGeneratedFile[];
  useAiImagePath: boolean;
}): Promise<{
  featuredImageId: number | undefined;
  featuredImageLink: string | null;
  directFeaturedPayload: { imageBase64: string; filename: string } | undefined;
  imageFile: { fileName: string; content: string } | undefined;
}> {
  const { options, rowIndex, sitesToPost, useGoogleMaps, entityForImage, enrichedRow, blueprintResult, bulkPrimaryKw, generatedFiles, useAiImagePath } = args;
      let featuredImageId: number | undefined;
      let featuredImageLink: string | null = null;
      let directFeaturedPayload: { imageBase64: string; filename: string } | undefined;
      let imageFile: { fileName: string; content: string } | undefined;

      if (useGoogleMaps && entityForImage) {
        if (options.googleMapsImagePromise) {
          await options.googleMapsImagePromise;
        }
        const mapsPayload =
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
  return { featuredImageId, featuredImageLink, directFeaturedPayload, imageFile };
}

export async function resolveBulkSiteFeaturedImage(args: {
  options: BulkProcessingOptions;
  site: WordPressSite;
  siteIndex: number;
  useGoogleMaps: boolean;
  entityForImage?: string;
  featuredImageId: number | undefined;
  featuredImageLink: string | null;
  directFeaturedPayload: { imageBase64: string; filename: string } | undefined;
  imageFile: { fileName: string; content: string } | undefined;
  enrichedRow: CSVRow;
  blueprintResult: { title?: string };
  bulkPrimaryKw: string;
}): Promise<{ siteFeaturedImageId: number | undefined; featuredImageLink: string | null }> {
  const { options, site, siteIndex, useGoogleMaps, entityForImage, featuredImageId, directFeaturedPayload, imageFile, enrichedRow, blueprintResult, bulkPrimaryKw } = args;
  let { featuredImageLink } = args;
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
  return { siteFeaturedImageId, featuredImageLink };
}

export async function ensureBulkSiteFeaturedImageFromMaps(args: {
  options: BulkProcessingOptions;
  site: WordPressSite;
  useGoogleMaps: boolean;
  entityForImage?: string;
  siteFeaturedImageId: number | undefined;
  featuredImageLink: string | null;
  enrichedRow: CSVRow;
  blueprintResult: { title?: string };
  bulkPrimaryKw: string;
}): Promise<{ siteFeaturedImageId: number | undefined; featuredImageLink: string | null }> {
  const { options, site, useGoogleMaps, entityForImage, enrichedRow, blueprintResult, bulkPrimaryKw } = args;
  let { siteFeaturedImageId, featuredImageLink } = args;
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
  return { siteFeaturedImageId, featuredImageLink };
}
