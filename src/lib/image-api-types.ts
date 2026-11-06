/** Gemini image + multiple SERP refs often fail; cap attachment count. */
export const MAX_REFERENCE_IMAGES = 2;

export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '9:19';

export interface ImageGenerationRequest {
  apiKey: string;
  prompt: string;
  model?: string;
  /** Sent as OpenRouter `image_config.aspect_ratio`; without it Gemini copies the aspect of the reference images. */
  aspectRatio?: AspectRatio;
  /** When set, sent as multimodal image_url so the model can replicate the photo. */
  referenceImageDataUrl?: string;
  /** Multiple SERP reference data URLs (place + product, etc.). */
  referenceImageDataUrls?: string[];
  /** How many references to attach (default `MAX_REFERENCE_IMAGES`); the video storyboard sends harness + hero + scene upload. */
  maxReferenceImages?: number;
  /** @internal One retry without refs when multimodal output is empty. */
  _retryWithoutRefs?: boolean;
}

export interface ImageGenerationResponse {
  imageUrl?: string;
  imageBase64?: string;
  error?: string;
}
