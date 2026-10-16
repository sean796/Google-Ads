import { DEFAULT_IMAGE_MODEL } from "@/lib/image-model-defaults";
import { extractImageFromOpenRouterAssistantMessage } from "@/lib/image-openrouter-response-extract";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { readOpenRouterResponseJson } from "@/lib/openrouter-response-body";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { logFeaturedImagePipeline } from "@/lib/image-generator/featured-image-pipeline-log";

/** Gemini image + multiple SERP refs often fail; cap attachment count. */
const MAX_REFERENCE_IMAGES = 2;

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
      throw new Error(`Image generation failed: ${response.status} ${response.statusText}. ${errorText.substring(0, 200)}`);
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
      const errorMsg = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
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
    
    // Handle different response formats
    // Some models return image URLs, others return base64
    
    // Format 0: Check for top-level data field (standard image API format)
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const firstItem = data.data[0];
      if (firstItem.url) {
        return { imageUrl: firstItem.url };
      }
      if (firstItem.b64_json) {
        return { imageBase64: `data:image/png;base64,${firstItem.b64_json}` };
      }
      if (firstItem.image_url) {
        return { imageUrl: firstItem.image_url };
      }
    }
    
    // Format 0b: Check for direct data fields at top level
    if (data.url) {
      return { imageUrl: data.url };
    }
    if (data.b64_json) {
      return { imageBase64: `data:image/png;base64,${data.b64_json}` };
    }
    if (data.image_url) {
      return { imageUrl: data.image_url };
    }
    
    // Format 1: OpenRouter image generation - images are in message.images array
    // Check for images array first (OpenRouter image generation format)
    if (data.choices && data.choices[0]?.message?.images && Array.isArray(data.choices[0].message.images)) {
      const images = data.choices[0].message.images;
      if (images.length > 0) {
        const firstImage = images[0];
        // Handle image_url - it might be a string or an object
        if (firstImage.image_url) {
          let imageUrl: string;
          if (typeof firstImage.image_url === 'string') {
            imageUrl = firstImage.image_url;
          } else if (typeof firstImage.image_url === 'object' && firstImage.image_url !== null) {
            // Extract URL from object (common properties: url, image_url, href)
            imageUrl = (firstImage.image_url as any).url || (firstImage.image_url as any).image_url || (firstImage.image_url as any).href;
if (!imageUrl || typeof imageUrl !== 'string') {
              console.error('Could not extract URL from image_url object:', firstImage.image_url);
              // Continue to next check
            } else {
// CRITICAL FIX: If image_url is a data: URL, return it as base64 instead
              if (imageUrl.startsWith('data:')) {
return { imageBase64: imageUrl };
              }
              return { imageUrl: imageUrl };
            }
          } else {
            // Not a string or object, skip
            console.warn('firstImage.image_url is neither string nor object:', typeof firstImage.image_url);
          }
        }
        
        // Handle url - it might be a string or an object
        if (firstImage.url) {
          let url: string;
          if (typeof firstImage.url === 'string') {
            url = firstImage.url;
          } else if (typeof firstImage.url === 'object' && firstImage.url !== null) {
            // Extract URL from object
            url = (firstImage.url as any).url || (firstImage.url as any).image_url || (firstImage.url as any).href;
if (!url || typeof url !== 'string') {
              console.error('Could not extract URL from url object:', firstImage.url);
              // Continue to next check
            } else {
// CRITICAL FIX: If url is a data: URL, return it as base64 instead
              if (url.startsWith('data:')) {
return { imageBase64: url };
              }
              return { imageUrl: url };
            }
          } else {
            // Not a string or object, skip
            console.warn('firstImage.url is neither string nor object:', typeof firstImage.url);
          }
        }
        if (firstImage.b64_json) {
          return { imageBase64: `data:image/png;base64,${firstImage.b64_json}` };
        }
      }
    }
    
    // Format 1b: Check if images are directly in message (not in an array)
    if (data.choices && data.choices[0]?.message) {
      const message = data.choices[0].message;
      // Check all possible image fields
      if (message.image_url) {
        return { imageUrl: message.image_url };
      }
      if (message.url) {
        return { imageUrl: message.url };
      }
      if (message.b64_json) {
        return { imageBase64: `data:image/png;base64,${message.b64_json}` };
      }
      if (message.image) {
        if (message.image.url) return { imageUrl: message.image.url };
        if (message.image.image_url) return { imageUrl: message.image.image_url };
        if (message.image.b64_json) return { imageBase64: `data:image/png;base64,${message.image.b64_json}` };
      }
    }
    
    // Format 2: OpenRouter chat completions with image in content
    // Check message.content for image data
    if (data.choices && data.choices[0]?.message?.content) {
      const content = data.choices[0].message.content;
console.log('=== CONTENT INSPECTION ===');
      console.log('Content type:', typeof content);
      console.log('Is array:', Array.isArray(content));
      if (Array.isArray(content)) {
        console.log('Content array length:', content.length);
        if (content.length === 0) {
          console.warn('Content array is empty');
        } else {
          content.forEach((part, index) => {
            console.log(`Part ${index}:`, {
              type: part.type,
              keys: Object.keys(part),
              hasText: !!part.text,
              hasImageUrl: !!part.image_url,
              hasImage: !!part.image,
              fullPart: part
            });
          });
        }
      } else if (typeof content === 'object' && content !== null) {
        console.log('Content object keys:', Object.keys(content));
        console.log('Full content object:', content);
      } else {
        console.log('Content value (first 500 chars):', typeof content === 'string' ? content.substring(0, 500) : String(content).substring(0, 500));
      }
      
      // Check if content is a URL string
      if (typeof content === 'string' && (content.startsWith('http://') || content.startsWith('https://'))) {
return { imageUrl: content };
      }
      
      // Check if content is base64 string (with or without data: prefix)
      if (typeof content === 'string') {
if (content.startsWith('data:image/')) {
return { imageBase64: content };
        }
        // Check if it's raw base64 (Nano Banana might return this)
        if (content.length > 100 && /^[A-Za-z0-9+/=]+$/.test(content.substring(0, 100))) {
return { imageBase64: `data:image/png;base64,${content}` };
        }
        // Check if content contains image URL in markdown format
        const urlMatch = content.match(/https?:\/\/[^\s\)\"\']+\.(png|jpg|jpeg|webp|gif)(\?[^\s\)\"\']*)?/i);
        if (urlMatch) {
return { imageUrl: urlMatch[0] };
        }
        // Check for base64 embedded in text
        const base64Match = content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=\s]+)/);
        if (base64Match) {
return { imageBase64: base64Match[0].trim() };
        }
        // Check for URL in JSON format within text
        try {
          const jsonMatch = content.match(/\{[^}]*"url"[^}]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.url) {
return { imageUrl: parsed.url };
            }
          }
        } catch (e) {
          // Not valid JSON, continue
        }
        
        // Try parsing entire content as JSON (Gemini might return JSON string)
        try {
          const parsedContent = JSON.parse(content);
if (parsedContent.url) return { imageUrl: parsedContent.url };
          if (parsedContent.image_url) return { imageUrl: parsedContent.image_url };
          if (parsedContent.base64) return { imageBase64: parsedContent.base64.startsWith('data:') ? parsedContent.base64 : `data:image/png;base64,${parsedContent.base64}` };
        } catch (e) {
          // Not JSON, continue
        }
      }
      
      // Check if content is an object with image data
      if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
        if (content.type === 'image_url' && content.image_url?.url) {
          return { imageUrl: content.image_url.url };
        }
        if (content.type === 'image' && content.image) {
          if (content.image.url) return { imageUrl: content.image.url };
          if (content.image.base64) return { imageBase64: `data:image/png;base64,${content.image.base64}` };
        }
        if (content.url) {
          return { imageUrl: content.url };
        }
        if (content.base64) {
          return { imageBase64: `data:image/png;base64,${content.base64}` };
        }
        // Check for Gemini-specific format
        if (content.inlineData) {
          if (content.inlineData.data) {
            return { imageBase64: `data:${content.inlineData.mimeType || 'image/png'};base64,${content.inlineData.data}` };
          }
        }
      }
      
      // Check if content is an array of content parts (multimodal response)
      if (Array.isArray(content)) {
        // Handle empty array - might indicate error or different response format
        if (content.length === 0) {
          console.warn('Content array is empty, checking other locations...');
        }
        
        for (const part of content) {
          if (!part || typeof part !== 'object') continue;
          
          console.log('Checking content part:', part.type, Object.keys(part));
          
          // Check for image type parts
          if (part.type === 'image') {
            console.log('Found image part:', part);
            if (part.image?.url) {
              console.log('Extracting image URL from part.image.url');
              return { imageUrl: part.image.url };
            }
            if (part.image?.image_url?.url) {
              console.log('Extracting image URL from part.image.image_url.url');
              return { imageUrl: part.image.image_url.url };
            }
            if (part.image?.inlineData?.data) {
              console.log('Extracting base64 from part.image.inlineData.data');
              return { imageBase64: `data:${part.image.inlineData.mimeType || 'image/png'};base64,${part.image.inlineData.data}` };
            }
            if (part.image?.base64) {
              console.log('Extracting base64 from part.image.base64');
              return { imageBase64: `data:image/png;base64,${part.image.base64}` };
            }
            // Check if image is directly in part
            if (part.url) {
              console.log('Extracting URL from part.url');
              return { imageUrl: part.url };
            }
            if (part.base64) {
              console.log('Extracting base64 from part.base64');
              return { imageBase64: `data:image/png;base64,${part.base64}` };
            }
          }
          // OpenAI/DALL-E format
          if (part.type === 'image_url' && part.image_url?.url) {
            console.log('Extracting image URL from OpenAI format');
            return { imageUrl: part.image_url.url };
          }
          // Generic checks for any URL or base64 fields
          if (part.url && typeof part.url === 'string') {
            console.log('Extracting URL from part.url (generic)');
            return { imageUrl: part.url };
          }
          if (part.base64 && typeof part.base64 === 'string') {
            console.log('Extracting base64 from part.base64 (generic)');
            return { imageBase64: `data:image/png;base64,${part.base64}` };
          }
          if (part.b64_json && typeof part.b64_json === 'string') {
            console.log('Extracting base64 from part.b64_json');
            return { imageBase64: `data:image/png;base64,${part.b64_json}` };
          }
          // Check text parts for embedded image URLs or base64
          if (part.type === 'text' && typeof part.text === 'string') {
            // Check for base64 in text
            const base64Match = part.text.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=\s]+)/);
            if (base64Match) {
              console.log('Extracting base64 from text content');
              return { imageBase64: base64Match[0].trim() };
            }
            // Check for URL in text (more flexible pattern)
            const urlMatch = part.text.match(/https?:\/\/[^\s\)\"\']+\.(png|jpg|jpeg|webp|gif)(\?[^\s\)\"\']*)?/i);
            if (urlMatch) {
              console.log('Extracting URL from text content');
              return { imageUrl: urlMatch[0] };
            }
            // Check for JSON with URL in text
            try {
              const jsonMatch = part.text.match(/\{[^}]*"url"[^}]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.url && typeof parsed.url === 'string') {
                  console.log('Extracting URL from JSON in text');
                  return { imageUrl: parsed.url };
                }
              }
            } catch (e) {
              // Not valid JSON, continue
            }
          }
          // Check for any nested structure
          if (part.image_url && typeof part.image_url === 'string') {
            console.log('Extracting image_url as string');
            return { imageUrl: part.image_url };
          }
        }
      }
    }
    
    // Format 2b: Check if message.content is null/empty but response has image elsewhere
    if (data.choices && data.choices[0]?.message) {
      const message = data.choices[0].message;
// Check if content is null or empty array - might need to check other fields
      if (!message.content || (Array.isArray(message.content) && message.content.length === 0)) {
        console.log('Message content is empty/null, checking other message fields...');
        // Check for any direct image references in message
        if (message.refs && Array.isArray(message.refs)) {
          for (const ref of message.refs) {
            if (ref.url) return { imageUrl: ref.url };
          }
        }
      }
      
      // Check for other possible fields in message (Gemini-specific formats)
      if (message.parts && Array.isArray(message.parts)) {
for (const part of message.parts) {
          if (part.inlineData?.data) {
return { imageBase64: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}` };
          }
          if (part.url) {
return { imageUrl: part.url };
          }
        }
      }
    }
    
    // Also check message.parts (Gemini sometimes uses this)
    if (data.choices && data.choices[0]?.message?.parts) {
      const parts = data.choices[0].message.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            return { imageBase64: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}` };
          }
        }
      }
    }
    
    // Format 2: Direct image URL in response
    if (data.image_url || data.url) {
      return { imageUrl: data.image_url || data.url };
    }
    
    // Format 3: Base64 in response
    if (data.image_base64 || data.b64_json) {
      const base64 = data.image_base64 || data.b64_json;
      const base64String = typeof base64 === 'string' && base64.startsWith('data:') 
        ? base64 
        : `data:image/png;base64,${base64}`;
      return { imageBase64: base64String };
    }
    
    // Format 4: Array format (like OpenAI DALL-E)
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const firstItem = data.data[0];
      if (firstItem.url) {
        return { imageUrl: firstItem.url };
      }
      if (firstItem.b64_json) {
        return { imageBase64: `data:image/png;base64,${firstItem.b64_json}` };
      }
    }
    
    // Format 5: Check for nested content in choices (array of choices)
    if (data.choices && Array.isArray(data.choices)) {
      for (const choice of data.choices) {
        if (choice.message?.content) {
          const content = choice.message.content;
          // Try to parse as JSON if it's a string
          if (typeof content === 'string') {
            try {
              const parsed = JSON.parse(content);
              if (parsed.url) return { imageUrl: parsed.url };
              if (parsed.image_url) return { imageUrl: parsed.image_url };
            } catch {
              // Not JSON, continue
            }
          }
        }
        // Check for image_url in choice directly
        if (choice.image_url) {
          return { imageUrl: choice.image_url };
        }
      }
    }

    // Last resort: Deep search for any URL or base64 in the entire response
    console.log('=== DEEP SEARCH FOR IMAGE DATA ===');
    const deepSearch = (obj: any, path: string = '', visited: Set<any> = new Set()): string | null => {
      // Prevent infinite loops with circular references
      if (visited.has(obj)) return null;
      if (!obj || typeof obj !== 'object') return null;
      visited.add(obj);
      
      // Check for common image fields first
      if (obj.url && typeof obj.url === 'string') {
        if (obj.url.startsWith('http') || obj.url.startsWith('data:image') || obj.url.match(/\.(png|jpg|jpeg|webp|gif)(\?|$)/i)) {
          console.log(`Found URL at path: ${path}.url`);
          return obj.url;
        }
      }
      if (obj.image_url && typeof obj.image_url === 'string') {
        console.log(`Found image_url at path: ${path}.image_url`);
        return obj.image_url;
      }
      if (obj.b64_json && typeof obj.b64_json === 'string') {
        console.log(`Found b64_json at path: ${path}.b64_json`);
        return `data:image/png;base64,${obj.b64_json}`;
      }
      if (obj.base64 && typeof obj.base64 === 'string') {
        console.log(`Found base64 at path: ${path}.base64`);
        return obj.base64.startsWith('data:') ? obj.base64 : `data:image/png;base64,${obj.base64}`;
      }
      // Check for data field that might contain image
      if (obj.data && typeof obj.data === 'string' && (obj.data.startsWith('data:image') || obj.data.startsWith('http'))) {
        console.log(`Found data field at path: ${path}.data`);
        return obj.data;
      }
      
      // Recursively search nested objects and arrays
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          const newPath = `${path}[${i}]`;
          const result = deepSearch(obj[i], newPath, visited);
          if (result) return result;
        }
      } else {
        for (const key in obj) {
          if (obj.hasOwnProperty(key) && key !== 'usage' && key !== 'created') { // Skip common metadata
            const newPath = path ? `${path}.${key}` : key;
            const result = deepSearch(obj[key], newPath, visited);
            if (result) return result;
          }
        }
      }
      
      return null;
    };
    
    const foundImage = deepSearch(data);
    if (foundImage) {
      console.log('Found image data via deep search:', foundImage.substring(0, 100));
      if (foundImage.startsWith('http') || foundImage.startsWith('https')) {
        return { imageUrl: foundImage };
      }
      if (foundImage.startsWith('data:image')) {
        return { imageBase64: foundImage };
      }
    }

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
