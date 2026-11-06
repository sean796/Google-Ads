/**
 * Local Image: Wikipedia lead photo (when present) or DFS Google Images →
 * vision pick → AI replicate → disclaimer → WP insert.
 */

import { loadApiKey } from "@/lib/api";
import { generateImage } from "@/lib/image-api";
import { applyAiGeneratedImageDisclaimer } from "@/lib/images/ai-generated-image-disclaimer";
import { getImageModel, getResearchModel } from "@/lib/optimization-settings-storage";
import {
  buildInContentImageFigureHtml,
  inContentImageAltFromFocusKeyword,
  inContentImageFilenameFromFocusKeyword,
  inContentImageTitleFromFocusKeyword,
  insertFigureAfterH2,
} from "@/lib/overview/overview-blog-in-content-image-insert";
import { resolveLocalImagePlaceEntity } from "@/lib/overview/overview-local-image-dfs-normalize";
import { researchGoogleImageReferences } from "@/lib/image-reference-research";
import { uploadWordPressMedia } from "@/lib/wordpress-api";
import {
  isCurrentConnectedSite,
  searchSapCrossSiteInContentImage,
} from "@/lib/overview/sap-cross-site-image-search";
import type { WordPressSite } from "@/components/integrations/types";
import { buildLocalImageGoogleForcedTargets } from "@/lib/overview/overview-blog-local-image-pick";
import {
  imageBase64FromGenerateResult,
  prefetchImageDataUrl,
  prepareLocalImageDataUrl,
  tryWikipediaLocalImageReference,
  type LocalImageReference,
} from "@/lib/overview/overview-blog-local-image-reference";
import {
  base64FromDataUrl,
  resolveSectionHeaderForLocalImage,
} from "@/lib/overview/overview-blog-local-image-section";
export {
  LOCAL_IMAGE_CANDIDATE_LIMIT,
  LOCAL_IMAGE_QUALITY_MIN,
  assertImageQualityOrThrow,
  assertPlaceMatchOrThrow,
  buildLocalImageCommunityAcceptanceBrief,
  buildLocalImageGoogleForcedTargets,
  capGoogleImagesCandidates,
  parseLocalImagePlacePick,
  recoverLocalImagePickFromPartialText,
} from "@/lib/overview/overview-blog-local-image-pick";
export type { LocalImagePlacePick } from "@/lib/overview/overview-blog-local-image-pick";
export {
  isUsableWikipediaPlacePhotograph,
  prepareLocalImageDataUrl,
} from "@/lib/overview/overview-blog-local-image-reference";
export {
  isWeakLocalImageHeading,
  pickEarlyLocalImageSectionHeader,
} from "@/lib/overview/overview-blog-local-image-section";

export type GenerateLocalInContentImageOptions = {
  html: string;
  site: WordPressSite;
  /** Place entity already resolved; if empty, derived from pageUrl + flowTitle. */
  entity?: string;
  pageUrl?: string;
  focusKeyword?: string;
  flowTitle?: string;
  forcedSectionHeader?: string;
  apiKey?: string;
  model?: string;
  /** Connected Integration sites for Find Local Image (cross-site reuse). */
  peerSites?: WordPressSite[];
  /**
   * Both modes search peer SAP caches first (other connected sites).
   * `find` = reuse only (error if no peer image).
   * `generate` = reuse peer hit, else Wikipedia/Google Images + AI replicate. Default.
   */
  localImageMode?: "find" | "generate";
  /**
   * Fired as soon as same-city peer library CSVs are built (before prefetch / DFS / AI).
   * Used to host Downloads in Details during Generate.
   */
  onPeerLibrariesReady?: (
    files: Array<{ name: string; content: string; mimeType: string }>,
  ) => void;
  /** Fired when peer sites to scrape are known (eligible, then market) — before crawl. */
  onPeerPlanReady?: (
    peers: Array<{ name: string; siteUrl: string }>,
  ) => void;
  /** Fired after each peer CSV is built during the crawl. */
  onPeerCsvReady?: (file: {
    name: string;
    content: string;
    mimeType: string;
  }) => void;
  /** Live Looking / Found / Generating micro-status for Details + progress band. */
  onLocalImagePhase?: (info: {
    phase: "looking" | "found" | "not_found" | "reusing" | "generating";
    detail?: string;
  }) => void;
};

export type GenerateLocalInContentImageResult = {
  html: string;
  imageUrl: string;
  mediaId?: number;
  alt: string;
  sectionHeader: string;
  entity: string;
  /** Remote image file URL from Google Images (never WP / data:). */
  referenceImageUrl: string;
  /** Publisher page URL from Google Images when available. */
  referenceSourceUrl?: string;
  visualDescription: string;
  /** Peer SAP site that contributed the reused in-content image. */
  sharedFromSiteName?: string;
  sharedFromPageUrl?: string;
  reusedFromCrossSite?: boolean;
  /** One CSV per same-city peer SAP library (for Details downloads). */
  peerCsvFiles?: Array<{ name: string; content: string; mimeType: string }>;
};

export async function generateLocalInContentImageFromHtml(
  options: GenerateLocalInContentImageOptions,
): Promise<GenerateLocalInContentImageResult> {
  const apiKey = options.apiKey || loadApiKey();
  if (!apiKey?.trim()) {
    throw new Error("OpenRouter API key not found. Please set it in settings.");
  }

  const entity =
    (options.entity || "").trim() ||
    (await resolveLocalImagePlaceEntity({
      url: options.pageUrl,
      title: options.flowTitle,
      apiKey,
    }));

  const html = (options.html ?? "").trim();
  if (!html) throw new Error("No HTML body for Local Image");

  const researchModel = options.model || getResearchModel();
  const focusKeyword = (options.focusKeyword ?? "").trim() || entity;
  const localImageMode = options.localImageMode === "find" ? "find" : "generate";
  // Never search the site we are writing to — local images live on other connected sites.
  const peerSites = (options.peerSites ?? []).filter(
    (s) => !isCurrentConnectedSite(s, options.site),
  );

  const emitPhase = (info: {
    phase: "looking" | "found" | "not_found" | "reusing" | "generating";
    detail?: string;
  }) => {
    options.onLocalImagePhase?.(info);
  };

  // #region agent log
  // #endregion

  // Search OTHER connected SAP sites (all same-city peers; first image hit for reuse).
  if (peerSites.length) {
    emitPhase({
      phase: "looking",
      detail: "Looking for image on city peers",
    });
  }
  const peerSearch = peerSites.length
    ? await searchSapCrossSiteInContentImage({
        sites: peerSites,
        placeEntity: entity,
        apiKey,
        model: researchModel,
        excludePageUrl: options.pageUrl,
        excludeSite: options.site,
        onPeerPlanReady: options.onPeerPlanReady,
        onPeerCsvReady: options.onPeerCsvReady,
      })
    : { hit: null, peerCsvFiles: [] };
  const crossHit = peerSearch.hit;
  const peerCsvFiles = peerSearch.peerCsvFiles;
  if (peerCsvFiles.length) {
    options.onPeerLibrariesReady?.(peerCsvFiles);
  }

  // #region agent log
  // #endregion

  if (crossHit) {
    emitPhase({
      phase: "found",
      detail: `Found on ${crossHit.sourceSiteName}`,
    });
    const dataUrl = await prefetchImageDataUrl(crossHit.imageUrl);
    // #region agent log
    // #endregion
    if (!dataUrl) {
      emitPhase({
        phase: "not_found",
        detail: "Peer image found but download failed",
      });
      throw new Error(`Could not download shared Local Image for "${entity}"`);
    }
    emitPhase({
      phase: "reusing",
      detail: "Uploading peer image",
    });
    let preparedDataUrl = dataUrl;
    try {
      const prepared = await prepareLocalImageDataUrl(dataUrl);
      preparedDataUrl = prepared.dataUrl;
    } catch {
      preparedDataUrl = dataUrl;
    }
    const sectionHeader = await resolveSectionHeaderForLocalImage({
      html,
      entity,
      focusKeyword,
      flowTitle: options.flowTitle,
      forcedSectionHeader: options.forcedSectionHeader,
      apiKey,
      researchModel,
    });
    // Connected-site media meta only (never keep peer alt/title).
    const altText = inContentImageAltFromFocusKeyword(focusKeyword, sectionHeader);
    const mediaTitle = inContentImageTitleFromFocusKeyword(focusKeyword, sectionHeader);
    const imageFileName = inContentImageFilenameFromFocusKeyword(focusKeyword);
    const uploadResult = await uploadWordPressMedia(
      options.site.siteUrl,
      options.site.username,
      options.site.appPassword,
      base64FromDataUrl(preparedDataUrl),
      imageFileName,
      mediaTitle,
      altText,
    );
    if (!uploadResult.success || !uploadResult.url) {
      throw new Error(
        uploadResult.error || "Failed to upload shared Local Image to WordPress",
      );
    }
    const htmlFigure = buildInContentImageFigureHtml({
      imageUrl: uploadResult.url,
      alt: altText,
      mediaId: uploadResult.mediaId,
    });
    return {
      html: insertFigureAfterH2(html, sectionHeader, htmlFigure),
      imageUrl: uploadResult.url,
      mediaId: uploadResult.mediaId,
      alt: altText,
      sectionHeader,
      entity,
      referenceImageUrl: crossHit.imageUrl,
      referenceSourceUrl: crossHit.sourcePageUrl,
      visualDescription: `Shared from ${crossHit.sourceSiteName}`,
      sharedFromSiteName: crossHit.sourceSiteName,
      sharedFromPageUrl: crossHit.sourcePageUrl,
      reusedFromCrossSite: true,
      peerCsvFiles,
    };
  } else if (peerSites.length) {
    emitPhase({
      phase: "not_found",
      detail: "Not found on peers",
    });
  }

  if (localImageMode === "find") {
    const err = new Error(`No shared Local Image found for "${entity}"`) as Error & {
      peerCsvFiles?: typeof peerCsvFiles;
    };
    err.peerCsvFiles = peerCsvFiles;
    throw err;
  }

  emitPhase({
    phase: "looking",
    detail: "Looking on Wikipedia",
  });
  let ref: LocalImageReference | null = null;
  try {
    ref = await tryWikipediaLocalImageReference({
      apiKey,
      model: researchModel,
      entity,
    });
  } catch {
    ref = null;
  }

  if (ref) {
    emitPhase({
      phase: "found",
      detail: "Found on Wikipedia",
    });
  } else {
    emitPhase({
      phase: "not_found",
      detail: "Not found on Wikipedia",
    });
    // #region agent log
    // #endregion
    emitPhase({
      phase: "looking",
      detail: "Looking on Google Images",
    });
    const research = await researchGoogleImageReferences({
      apiKey,
      model: researchModel,
      context: {
        title: options.flowTitle,
        purpose: `Local place photograph of ${entity}`,
        sectionHeader: entity,
      },
      forcedTargets: buildLocalImageGoogleForcedTargets(entity),
      requireReferences: true,
    });
    const picked = research.references[0];
    if (!picked) {
      emitPhase({
        phase: "not_found",
        detail: "Not found on Google Images",
      });
      throw new Error(`No image references found for "${entity}"`);
    }
    emitPhase({
      phase: "found",
      detail: `Found on Google Images`,
    });
    ref = {
      dataUrl: picked.dataUrl,
      imageUrl: picked.imageUrl,
      sourceUrl: picked.sourceUrl,
      visualDescription: picked.visualDescription,
    };
  }

  emitPhase({
    phase: "generating",
    detail: "Generating image",
  });

  const referenceDataUrl = ref.dataUrl;

  const prompt = [
    `Replicate the attached reference photograph as a faithful visual copy.`,
    `Place: "${entity}".`,
    `Visual notes (for matching only, do not invent beyond the reference): ${ref.visualDescription}`,
    "CRITICAL RULES:",
    "- Do not embellish, stylize, enhance, restyle, color-grade, or alter the image in any way.",
    "- Do not add, remove, or invent objects, buildings, signs, people, animals, text, logos, or watermarks.",
    "- Match composition, architecture, materials, lighting, and viewpoint from the reference exactly.",
    "- Keep the image sharp and clear without inventing new detail that is not in the reference.",
    "- No Blind Magic, Hunter Douglas storefronts, retail shops, or product displays unless they are literally in the reference.",
  ].join(" ");

  const imageResult = await generateImage({
    apiKey,
    prompt,
    model: getImageModel(options.site?.id),
    aspectRatio: "16:9",
    referenceImageDataUrl: referenceDataUrl,
  });
  if (imageResult.error) throw new Error(imageResult.error);

  let imageBase64 = await imageBase64FromGenerateResult(imageResult);
  imageBase64 = await applyAiGeneratedImageDisclaimer(imageBase64);

  const sectionHeader = await resolveSectionHeaderForLocalImage({
    html,
    entity,
    focusKeyword,
    flowTitle: options.flowTitle,
    forcedSectionHeader: options.forcedSectionHeader,
    apiKey,
    researchModel,
  });

  const altText = inContentImageAltFromFocusKeyword(focusKeyword, sectionHeader);
  const mediaTitle = inContentImageTitleFromFocusKeyword(focusKeyword, sectionHeader);
  const imageFileName = inContentImageFilenameFromFocusKeyword(focusKeyword);

  const uploadResult = await uploadWordPressMedia(
    options.site.siteUrl,
    options.site.username,
    options.site.appPassword,
    imageBase64,
    imageFileName,
    mediaTitle,
    altText,
  );
  if (!uploadResult.success || !uploadResult.url) {
    throw new Error(uploadResult.error || "Failed to upload Local Image to WordPress");
  }

  const htmlFigure = buildInContentImageFigureHtml({
    imageUrl: uploadResult.url,
    alt: altText,
    mediaId: uploadResult.mediaId,
  });
  const updatedHtml = insertFigureAfterH2(html, sectionHeader, htmlFigure);

  const referenceImageUrl = ref.imageUrl;
  const referenceSourceUrl = ref.sourceUrl;

  return {
    html: updatedHtml,
    imageUrl: uploadResult.url,
    mediaId: uploadResult.mediaId,
    alt: altText,
    sectionHeader,
    entity,
    referenceImageUrl,
    referenceSourceUrl,
    visualDescription: ref.visualDescription,
    reusedFromCrossSite: false,
    peerCsvFiles,
  };
}
