import { DEFAULT_IMAGE_MODEL } from "@/lib/image-model-defaults";
import { extractImageFromOpenRouterAssistantMessage } from "@/lib/image-openrouter-response-extract";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { readOpenRouterResponseJson } from "@/lib/openrouter-response-body";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { logFeaturedImagePipeline } from "@/lib/image-generator/featured-image-pipeline-log";

import { extractImageFromOpenRouterResponseData } from "./image-api-response";
import { MAX_REFERENCE_IMAGES, type AspectRatio, type ImageGenerationRequest, type ImageGenerationResponse } from "./image-api-types";

export type { AspectRatio, ImageGenerationRequest, ImageGenerationResponse };

function openRouterImageHttpError(status: number, body: string): string {
  let message = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    message = parsed.error?.message ?? parsed.message ?? body;
  } catch {
    // use raw body
  }
  if (/in-flight/i.test(message)) {
    return "OpenRouter is holding credits for other requests that are still running. This app now draws storyboard frames one at a time; wait for the batch to finish or redraw this scene in a moment.";
  }
  if (/credit/i.test(message)) {
    return message;
  }
  return `Image generation failed (${status}). ${message}`.slice(0, 400);
}

/**
 * Generates an image using OpenRouter's image generation API
 * Uses Gemini 3.1 Flash Image (Nano Banana 2) via OpenRouter by default.
 */
export const generateImage = async ({
  apiKey,
  prompt,
  model = DEFAULT_IMAGE_MODEL,
  aspectRatio = '1:1',
  referenceImageDataUrl,
  referenceImageDataUrls,
  maxReferenceImages = MAX_REFERENCE_IMAGES,
  _retryWithoutRefs = false,
}: ImageGenerationRequest): Promise<ImageGenerationResponse> => {
  const contentParts: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: prompt }];
  const refs: string[] = [];
  for (const u of referenceImageDataUrls ?? []) {
    const t = (u ?? '').trim();
    if (t.startsWith('data:image/')) refs.push(t);
  }
  const single = (referenceImageDataUrl ?? '').trim();
  if (single.startsWith('data:image/') && !refs.includes(single)) {
    refs.push(single);
  }
  for (const ref of refs.slice(0, maxReferenceImages)) {
    contentParts.push({ type: 'image_url', image_url: { url: ref } });
  }
  const hadReferenceAttachments = refs.length > 0;
  try {
    const response = await postOpenRouterAppChatFetch( {
      method: 'POST',
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: model,
        modalities: ['text', 'image'],
        messages: [
          {
            role: 'user',
            content: contentParts,
          },
        ],
        image_config: { aspect_ratio: aspectRatio },
        max_tokens: 16384,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Image generation error:', errorText);
      throw new Error(openRouterImageHttpError(response.status, errorText));
    }

    const data = (await readOpenRouterResponseJson(response)) as Record<string, unknown>;

    const assistantMessage =
      data.choices &&
      Array.isArray(data.choices) &&
      data.choices[0] &&
      typeof data.choices[0] === "object"
        ? (data.choices[0] as { message?: unknown }).message
        : undefined;
    const fromAssistant = extractImageFromOpenRouterAssistantMessage(assistantMessage);
    if (fromAssistant?.imageUrl || fromAssistant?.imageBase64) {
      return fromAssistant;
    }

    // Check for error in response
    if (data.error) {
      const errorMsg = typeof data.error === 'string' ? data.error : (typeof (data.error as { message?: unknown }).message === 'string' ? (data.error as { message: string }).message : JSON.stringify(data.error));
      console.error('Image generation API returned an error:', errorMsg);
throw new Error(`Image generation API error: ${errorMsg}`);
    }
    
    // CRITICAL: Check for empty choices array early
    if (data.choices && Array.isArray(data.choices) && data.choices.length === 0) {
      console.error('Image generation API returned empty choices array. This usually means the model failed to generate an image or the request format was incorrect.');
      console.error('Full response:', JSON.stringify(data, null, 2));
throw new Error(
        `Image generation API returned empty choices array. ` +
        `Model: ${data.model || 'unknown'}. ` +
        `This usually indicates the image generation request failed. ` +
        `The model may not support image generation, or the request format may be incorrect. ` +
        `Please check the API response in the console for more details.`
      );
    }
    
    const extractedImage = extractImageFromOpenRouterResponseData(data);
    if (extractedImage) return extractedImage;

    // Enhanced error reporting
    console.error('=== UNEXPECTED RESPONSE FORMAT ===');
    const failContent = data.choices?.[0]?.message?.content;
    const failPayload = {
      msgKeys: data.choices?.[0]?.message ? Object.keys(data.choices[0].message) : [],
      contentType: typeof failContent,
      contentPreview: typeof failContent === 'string' ? failContent.substring(0, 500) : JSON.stringify(failContent).substring(0, 500),
      parsedAsJson: typeof failContent === 'string' ? (() => { try { const p = JSON.parse(failContent); return Array.isArray(p) ? { type: 'array', len: p.length, firstKeys: p[0] && typeof p[0] === 'object' ? Object.keys(p[0]) : null } : { type: 'object', keys: Object.keys(p) }; } catch { return null; } })() : null
    };
    console.error('Response structure:', failPayload);

    if (hadReferenceAttachments && !_retryWithoutRefs) {
      logFeaturedImagePipeline(
        "OpenRouter Image: empty multimodal reply, retrying without reference attachments",
      );
      return generateImage({
        apiKey,
        prompt,
        model,
        aspectRatio,
        referenceImageDataUrl: undefined,
        referenceImageDataUrls: undefined,
        _retryWithoutRefs: true,
      });
    }
    
    throw new Error(
      `Unexpected response format from image generation API. ` +
      `Response keys: ${JSON.stringify(Object.keys(data))}. ` +
      `Model: ${data.model || 'unknown'}. ` +
      `Has choices: ${!!data.choices}. ` +
      `Content type: ${typeof data.choices?.[0]?.message?.content}. ` +
      `Please check the browser console for the full response structure.`
    );
  } catch (error) {
    console.error('Image generation error:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to generate image',
    };
  }
};
