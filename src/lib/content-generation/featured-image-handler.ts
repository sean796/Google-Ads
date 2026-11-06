/**
 * Featured Image Handler Module
 * Handles featured image generation, upload, and management
 */

import { logger } from "@/lib/logger";
import { notify } from "@/lib/app-notifications";
import { buildImagePrompt } from "@/lib/image-prompt-builder";
import { NOTIFY_FEATURED_IMAGE_GENERATED_BUT_UPLOAD_FAIL, NOTIFY_GOOGLE_MAPS_FEATURED_IMAGE_GENERATED_BUT, notifyFeaturedImageGeneratedAndUploadedId, notifyGoogleMapsFeaturedImageGeneratedAnd, notifyGoogleMapsFeaturedImageGenerationFa, notifyKeepingExistingFeaturedImageIdX } from "@/lib/notify-messages";
import { IMAGE_SCENE_PLAUSIBILITY_PROMPT } from "@/lib/image-scene-plausibility";
import { windowTreatmentImagePromptSuffix } from "@/lib/image-window-treatment-prompt-rules";
import { getMuteOptimizationToasts } from "@/hooks/content-optimization/optimization-toast-mute";
import { streamChatCompletion } from "@/lib/api";
import { uploadWordPressMedia } from "@/lib/wordpress-api";
import { generateImage } from "@/lib/image-api";
import { buildFocusedArticlePurpose } from "@/lib/content-generation/article-length-policy";
import {
  buildGroundedImagePromptSuffix,
  collectReferenceDataUrls,
  researchGoogleImageReferences,
} from "@/lib/image-reference-research";
import { generateSEOImageFilename } from "@/lib/image-filename-generator";
import { dataUrlToBase64, fetchImageDataUrlViaApi } from "@/lib/proxy-fetch-text";
import { buildImageChecklistSystemPrompt, buildImageChecklistUserPrompt, parseImageChecklist, type ImageChecklistItem } from "@/lib/image-checklist-builder";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { WordPressSite } from "@/components/integrations/types";
import { fetchGoogleMapsImageForEntity } from "@/lib/content-generation/google-maps-image-api";
import { getImageModel, getResearchModel } from "@/lib/optimization-settings-storage";
import type { WpExistingPostLike } from "@/hooks/content-optimization/use-optimization-state";

export interface FeaturedImageHandlerOptions {
  blueprintResult: { title?: string; purpose?: string };
  existingTitle: string;
  primaryKeyword: string;
  site: WordPressSite;
  markdownContent: string;
  existingContent: string;
  existingPost?: WpExistingPostLike;
  fileManager: OptimizationFileManager;
  setProgress: (progress: { step: string; progress: number; message?: string }) => void;
  shouldOptimizeFeaturedImage: boolean;
  apiKey: string;
  featuredImageType?: 'ai-generated' | 'google-maps';
  entity?: string;
}

export interface FeaturedImageHandlerResult {
  featuredImageId?: number;
}

export async function handleFeaturedImage(
  options: FeaturedImageHandlerOptions
): Promise<FeaturedImageHandlerResult> {
  const {
    blueprintResult,
    existingTitle,
    primaryKeyword,
    site,
    markdownContent,
    existingContent,
    existingPost,
    fileManager,
    setProgress,
    shouldOptimizeFeaturedImage,
    apiKey,
    featuredImageType = 'ai-generated',
    entity,
  } = options;

  let featuredImageId: number | undefined = undefined;

  if (!shouldOptimizeFeaturedImage && existingPost) {
    // Featured image optimization disabled - keep existing featured image
    const fullData =
      existingPost.fullData && typeof existingPost.fullData === 'object'
        ? (existingPost.fullData as {
            featured_media?: unknown;
            _embedded?: { featured_media?: Array<{ id?: unknown }> };
          })
        : undefined;
    const existingFeaturedMedia: unknown =
      fullData?.featured_media || fullData?._embedded?.featured_media?.[0]?.id || existingPost.featured_media;
    if (existingFeaturedMedia) {
      featuredImageId =
        typeof existingFeaturedMedia === 'number'
          ? existingFeaturedMedia
          : typeof existingFeaturedMedia === 'object' &&
              typeof (existingFeaturedMedia as { id?: unknown }).id === 'number'
            ? (existingFeaturedMedia as { id: number }).id
            : undefined;
      if (featuredImageId && !getMuteOptimizationToasts()) notify.info(notifyKeepingExistingFeaturedImageIdX(featuredImageId), { duration: 3000 });
    } else {
      /* no existing featured image to keep */
    }
  } else if (shouldOptimizeFeaturedImage && (markdownContent || existingContent)) {
    // Check if Google Maps image is requested and entity is available
    const useGoogleMaps = featuredImageType === 'google-maps' && entity && entity.trim() && entity.trim() !== 'N/A';
    
    if (useGoogleMaps) {
      try {
        setProgress({ step: 'Generating Google Maps featured image...', progress: 88, message: `Generating Google Maps screenshot for ${entity}...` });

        const mapsImage = await fetchGoogleMapsImageForEntity(entity.trim());
        const imageBase64 = mapsImage.imageBase64;
        const mimeType = mapsImage.mimeType || 'image/jpeg';
        
        // Generate SEO-friendly filename
        const imageFileName = await generateSEOImageFilename(
          `${entity.trim()} Google Maps`,
          apiKey,
          getResearchModel(site.id),
          'featured'
        );
        
        // Ensure filename has .jpg extension for Google Maps images
        const fileNameWithoutExt = imageFileName.replace(/\.(png|jpg|jpeg)$/i, '');
        const finalImageFileName = `${fileNameWithoutExt}.jpg`;
        
        // Save image file to fileManager
        const imageDataUrl = `data:${mimeType};base64,${imageBase64}`;
        fileManager.addFile(
          finalImageFileName,
          imageDataUrl,
          mimeType
        );
        
        setProgress({ step: 'Uploading Google Maps featured image...', progress: 90, message: 'Uploading Google Maps image to WordPress...' });
        
        // Upload to WordPress
        const uploadResult = await uploadWordPressMedia(
          site.siteUrl,
          site.username,
          site.appPassword,
          imageBase64,
          finalImageFileName,
          `${entity.trim()} - Google Maps`
        );
        
        if (uploadResult.success && uploadResult.mediaId) {
          featuredImageId = uploadResult.mediaId;
          if (!getMuteOptimizationToasts()) notify.success(notifyGoogleMapsFeaturedImageGeneratedAnd(featuredImageId), { duration: 3000 });
        } else {
          logger.warn('[Optimize Content] Failed to upload Google Maps featured image:', uploadResult.error);
          if (!getMuteOptimizationToasts()) notify.warning(NOTIFY_GOOGLE_MAPS_FEATURED_IMAGE_GENERATED_BUT, { duration: 5000 });
        }
      } catch (error) {
        logger.error('[Optimize Content] Error generating/uploading Google Maps featured image:', error);
        if (!getMuteOptimizationToasts()) notify.error(notifyGoogleMapsFeaturedImageGenerationFa(error instanceof Error ? error.message : 'Unknown error'), { duration: 5000 });
      }
    }
    
    // Use AI-generated image only when google-maps was not requested
    if (!featuredImageId && !useGoogleMaps) {
      // Generate new featured image using AI
      const contentForImage = markdownContent || existingContent || '';
      try {
      setProgress({ step: 'Generating featured image...', progress: 88, message: 'Creating image checklist and generating featured image...' });
      
      // Generate image checklist
      const flowTitle = blueprintResult.title || existingTitle || primaryKeyword;
      const flowPurpose = blueprintResult.purpose || buildFocusedArticlePurpose(primaryKeyword);
      
      let imageChecklistContent = '';
      const checklistResult = await streamChatCompletion({
        apiKey: apiKey,
        model: getResearchModel(site.id),
        messages: [
          { role: 'system', content: buildImageChecklistSystemPrompt(flowTitle, flowPurpose, contentForImage) },
          { role: 'user', content: buildImageChecklistUserPrompt({
            flowTitle,
            flowPurpose,
            finalOutput: contentForImage,
            includeText: false,
            includePeople: false,
            includeAnimals: false,
            includeCars: false,
            isInfographic: false,
            aspectRatio: '16:9',
            style: 'professional',
            colorScheme: 'vibrant',
          }) },
        ],
        temperature: 1.0,
        maxTokens: 2000,
        topP: 0.9,
        onContentChunk: (chunk) => {
          imageChecklistContent += chunk;
        },
      });
      
      // Get final content from result
      imageChecklistContent = checklistResult.content || imageChecklistContent;
      
      const imageChecklist: ImageChecklistItem[] = parseImageChecklist(
        imageChecklistContent,
        { strictFeatured: true },
      );
      
      // Save checklist file to fileManager
      const checklistFileName = OptimizationFileManager.generateFilename('featured-image-checklist', primaryKeyword, 'json');
      fileManager.addFile(
        checklistFileName,
        JSON.stringify({
          title: blueprintResult.title || existingTitle || primaryKeyword,
          purpose: blueprintResult.purpose || buildFocusedArticlePurpose(primaryKeyword),
          primaryKeyword,
          imageChecklist: imageChecklist.map(item => ({
            title: item.title,
            description: item.description
          })),
          metadata: {
            aspectRatio: '16:9',
            style: 'professional',
            colorScheme: 'vibrant',
            includeText: false,
            includePeople: false,
            includeAnimals: false,
            includeCars: false,
            generatedAt: new Date().toISOString(),
          }
        }, null, 2),
        'application/json'
      );
      
      // Build image prompt
      const basePrompt = buildImagePrompt(
        {
          flowTitle: blueprintResult.title || existingTitle || primaryKeyword,
          flowPurpose: blueprintResult.purpose || buildFocusedArticlePurpose(primaryKeyword),
          finalOutput: contentForImage,
        },
        {
          includeText: false, // No text - WordPress style
          includePeople: false,
          includeAnimals: false,
          includeCars: false,
          isInfographic: false,
          aspectRatio: '16:9', // WordPress featured image aspect ratio
          style: 'professional',
          colorScheme: 'vibrant',
        }
      );
      
      const checklistText = imageChecklist.length > 0 
        ? `\n\nImage Generation Checklist:\n${imageChecklist.map((item, idx) => `${idx + 1}. ${item.title}\n   ${item.description}`).join('\n')}`
        : '';
      
      const prompt =
        basePrompt +
        checklistText +
        `\n\nFollow the checklist above EXACTLY. Ensure all requirements are met, especially regarding what should and should NOT be included. This is a WordPress featured image - no text, words, or labels should be included. ${IMAGE_SCENE_PLAUSIBILITY_PROMPT}${windowTreatmentImagePromptSuffix(
          blueprintResult.title || existingTitle || primaryKeyword,
          contentForImage,
          primaryKeyword,
        )}`;
      
      setProgress({ step: 'Generating featured image...', progress: 89, message: 'Generating image with AI...' });

      const research = await researchGoogleImageReferences({
        apiKey,
        model: getResearchModel(site.id),
        context: {
          title: blueprintResult.title || existingTitle || primaryKeyword,
          purpose: blueprintResult.purpose || buildFocusedArticlePurpose(primaryKeyword),
          body: contentForImage,
        },
        groundingProfile: 'featured',
      });
      const groundedPrompt = prompt + buildGroundedImagePromptSuffix(research.references);
      
      // Generate image
      const imageResult = await generateImage({
        apiKey: apiKey,
        prompt: groundedPrompt,
        model: getImageModel(site.id),
        aspectRatio: '16:9',
        referenceImageDataUrls: collectReferenceDataUrls(research.references),
      });
      
      if (imageResult.error) {
        throw new Error(imageResult.error);
      }
      
      if (!imageResult.imageBase64 && !imageResult.imageUrl) {
        throw new Error('No image data returned from image generation API');
      }
      
      // Convert URL to base64 if needed
      let imageBase64: string;
      if (imageResult.imageBase64) {
        imageBase64 = imageResult.imageBase64;
      } else if (imageResult.imageUrl) {
        const dataUrl = await fetchImageDataUrlViaApi(imageResult.imageUrl);
        imageBase64 = dataUrlToBase64(dataUrl);
      } else {
        throw new Error('No image data available');
      }
      
      // Generate SEO-friendly filename
      const imageFileName = await generateSEOImageFilename(
        blueprintResult.title || existingTitle || primaryKeyword,
        apiKey,
        getResearchModel(site.id),
        'featured'
      );
      
      // Save image file to fileManager (as data URL for proper download handling)
      let imageDataUrl: string;
      if (imageBase64.startsWith('data:')) {
        imageDataUrl = imageBase64;
      } else {
        imageDataUrl = `data:image/png;base64,${imageBase64}`;
      }
      
      fileManager.addFile(
        imageFileName,
        imageDataUrl,
        'image/png'
      );
      
      setProgress({ step: 'Uploading featured image...', progress: 90, message: 'Uploading generated image to WordPress...' });
      
      // Upload to WordPress
      const uploadResult = await uploadWordPressMedia(
        site.siteUrl,
        site.username,
        site.appPassword,
        imageBase64,
        imageFileName,
        blueprintResult.title || existingTitle || primaryKeyword
      );
      
      if (uploadResult.success && uploadResult.mediaId) {
        featuredImageId = uploadResult.mediaId;
        if (!getMuteOptimizationToasts()) notify.success(notifyFeaturedImageGeneratedAndUploadedId(featuredImageId), { duration: 3000 });
      } else {
        logger.warn('[Optimize Content] Failed to upload featured image:', uploadResult.error);
        if (!getMuteOptimizationToasts()) notify.warning(NOTIFY_FEATURED_IMAGE_GENERATED_BUT_UPLOAD_FAIL, { duration: 5000 });
      }
    } catch (error) {
      logger.error('[Optimize Content] Error generating/uploading featured image:', error);
    }
    }
  }

  return { featuredImageId };
}

