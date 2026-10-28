import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getMetaModel } from "./optimization-settings-storage";

/**
 * Sanitizes a string to be used as a filename
 * Converts to lowercase, replaces spaces and special chars with hyphens
 */
export function sanitizeImageFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .substring(0, 100); // Limit length
}

/**
 * Generates an SEO-optimized image filename using AI
 * @param sourceText - The blog title (for featured) or section name (for sections)
 * @param apiKey - OpenRouter API key
 * @param model - Model to use (defaults to "google/gemini-2.5-flash")
 * @param imageType - "featured" or "section"
 * @returns Promise resolving to a sanitized, SEO-friendly filename with .png extension
 */
function filenameFromTitleFallback(
  sourceText: string,
  imageType: "featured" | "section",
): string {
  let filename = sanitizeImageFilename(sourceText);
  if (imageType === "featured") {
    filename = `${filename}-featured`;
  }
  return `${filename.substring(0, 50)}.png`;
}

function looksLikeFilenamePromptLeak(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.includes("answer-only") ||
    lower.includes("30-50") ||
    lower.includes("need-answer") ||
    lower.includes("filename-eed") ||
    lower.includes("chars-exclud") ||
    lower.includes("no-extension")
  );
}

export async function generateSEOImageFilename(
  sourceText: string,
  apiKey: string,
  model?: string,
  imageType: "featured" | "section" = "featured"
): Promise<string> {
  if (!sourceText || !sourceText.trim()) {
    return `image-${Date.now()}.png`;
  }

  try {
    const systemPrompt = `Return one SEO filename slug only.
Rules: lowercase, hyphens, 3-8 words from the title, no file extension, no quotes, no instructions echoed back.
Featured images should end with -featured when it fits.`;

    const userPrompt = imageType === "featured"
      ? `Title: ${sourceText.trim()}\nReply with the slug only.`
      : `Section: ${sourceText.trim()}\nReply with the slug only.`;

    const { content } = await callOpenRouterChatCompletion({
      apiKey,
      model: model?.trim() || getMetaModel(),
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.2,
      maxTokens: 1024,
    });

    const responseText = content.trim();

    let filename = responseText
      .trim()
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/^```\w*\n?|\n?```$/g, '') // Remove markdown code blocks
      .replace(/\.png$/i, '') // Remove .png if included (case insensitive)
      .replace(/\.png$/i, '') // Remove again in case of double extension
      .replace(/\.(jpg|jpeg|webp|gif)$/i, '') // Remove other image extensions
      .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
      .toLowerCase()
      .substring(0, 50);

    if (filename.length < 3 || looksLikeFilenamePromptLeak(filename)) {
      return filenameFromTitleFallback(sourceText, imageType);
    }

    return `${filename}.png`;
  } catch (error) {
    console.error("Error generating SEO filename:", error);
    return filenameFromTitleFallback(sourceText, imageType);
  }
}

