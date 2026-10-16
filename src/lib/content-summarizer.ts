import { streamChatCompletion } from "./api";
import { resolveModelForAgentCategory } from "@/lib/openrouter-agent-category-api";

export interface SummarizationOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  onProgress?: (message: string) => void;
}

export interface SummarizationResult {
  summarizedContent: string;
  originalUrlCount: number;
  preservedUrls: string[];
  originalLength: number;
  summarizedLength: number;
}

/**
 * Extracts all URLs from content while preserving their positions
 * Returns URLs and a placeholder map for restoration
 */
function extractUrls(content: string): { 
  urls: string[]; 
  placeholders: Map<string, string>;
  contentWithoutUrls: string;
} {
  const urls: string[] = [];
  const placeholders = new Map<string, string>();
  
  // Match various URL patterns:
  // - http:// or https:// URLs
  // - Markdown links: [text](url)
  // - Plain URLs in text
  // - URLs in markdown image syntax: ![alt](url)
  
  const urlPatterns = [
    // Markdown links: [text](url)
    /\[([^\]]*)\]\(([^\)]+)\)/g,
    // Markdown images: ![alt](url)
    /!\[([^\]]*)\]\(([^\)]+)\)/g,
    // Plain HTTP/HTTPS URLs
    /https?:\/\/[^\s\)\]]+/g,
  ];
  
  let contentWithoutUrls = content;
  let placeholderIndex = 0;
  
  // First, handle markdown links and images (more specific patterns)
  contentWithoutUrls = contentWithoutUrls.replace(/\[([^\]]*)\]\(([^\)]+)\)/g, (match, text, url) => {
    if (!urls.includes(url)) {
      urls.push(url);
      const placeholder = `__URL_PLACEHOLDER_${placeholderIndex}__`;
      placeholders.set(placeholder, `[${text}](${url})`);
      placeholderIndex++;
      return placeholder;
    }
    return match;
  });
  
  contentWithoutUrls = contentWithoutUrls.replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, (match, alt, url) => {
    if (!urls.includes(url)) {
      urls.push(url);
      const placeholder = `__URL_PLACEHOLDER_${placeholderIndex}__`;
      placeholders.set(placeholder, `![${alt}](${url})`);
      placeholderIndex++;
      return placeholder;
    }
    return match;
  });
  
  // Then handle plain URLs
  contentWithoutUrls = contentWithoutUrls.replace(/https?:\/\/[^\s\)\]]+/g, (match) => {
    if (!urls.includes(match)) {
      urls.push(match);
      const placeholder = `__URL_PLACEHOLDER_${placeholderIndex}__`;
      placeholders.set(placeholder, match);
      placeholderIndex++;
      return placeholder;
    }
    return match;
  });
  
  return {
    urls,
    placeholders,
    contentWithoutUrls,
  };
}

/**
 * Restores URLs from placeholders back into the content
 */
function restoreUrls(content: string, placeholders: Map<string, string>): string {
  let restoredContent = content;
  
  for (const [placeholder, originalUrl] of placeholders.entries()) {
    restoredContent = restoredContent.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), originalUrl);
  }
  
  return restoredContent;
}

/**
 * Counts words in text (excluding URLs)
 */
function countWords(text: string): number {
  // Remove URLs first, then count words
  const textWithoutUrls = text.replace(/https?:\/\/[^\s]+/g, '').replace(/\[([^\]]*)\]\(([^\)]+)\)/g, '');
  return textWithoutUrls.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Minimizes punctuation usage to reduce token count
 * Preserves URLs and URL placeholders
 */
function minimizePunctuation(text: string): string {
  let result = text;
  
  // Store and replace URLs/placeholders with temporary markers
  const preserved: Array<{ original: string; marker: string }> = [];
  let markerIndex = 0;
  
  // Preserve URL placeholders
  result = result.replace(/__URL_PLACEHOLDER_\d+__/g, (match) => {
    const marker = `__PRESERVED_${markerIndex}__`;
    preserved.push({ original: match, marker });
    markerIndex++;
    return marker;
  });
  
  // Preserve markdown links
  result = result.replace(/\[([^\]]*)\]\(([^\)]+)\)/g, (match) => {
    const marker = `__PRESERVED_${markerIndex}__`;
    preserved.push({ original: match, marker });
    markerIndex++;
    return marker;
  });
  
  // Preserve markdown images
  result = result.replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, (match) => {
    const marker = `__PRESERVED_${markerIndex}__`;
    preserved.push({ original: match, marker });
    markerIndex++;
    return marker;
  });
  
  // Preserve plain URLs
  result = result.replace(/https?:\/\/[^\s\)\]]+/g, (match) => {
    const marker = `__PRESERVED_${markerIndex}__`;
    preserved.push({ original: match, marker });
    markerIndex++;
    return marker;
  });
  
  // Now minimize punctuation
  // Remove multiple consecutive punctuation marks
  result = result.replace(/[.,;:!?]{2,}/g, '.');
  
  // Remove unnecessary commas in common patterns
  result = result.replace(/,\s+and\s+/gi, ' and ');
  result = result.replace(/,\s+or\s+/gi, ' or ');
  result = result.replace(/,\s+but\s+/gi, ' but ');
  
  // Remove trailing commas before line breaks
  result = result.replace(/,\s*\n/g, '\n');
  
  // Remove parentheses and content (short parentheticals only, be conservative)
  result = result.replace(/\([^()]{0,20}\)(?!\w)/g, ' ');
  
  // Remove quotation marks around words
  result = result.replace(/["']([^"']+)["']/g, '$1');
  
  // Replace semicolons with periods
  result = result.replace(/;\s+/g, '. ');
  
  // Replace colons with spaces in most cases
  result = result.replace(/:\s+/g, ' ');
  
  // Simplify dashes
  result = result.replace(/ - +/g, '-');
  result = result.replace(/–+/g, '-');
  result = result.replace(/\s*-\s+/g, ' '); // Remove dashes with spaces before
  
  // Remove bullets and replace with simple line breaks or minimal markers
  result = result.replace(/^[\s]*[-•*]\s+/gm, ' '); // Remove bullet markers
  result = result.replace(/^[\s]*\d+\.\s+/gm, ' '); // Remove numbered bullets
  
  // Remove excessive whitespace
  result = result.replace(/\s{2,}/g, ' ');
  result = result.replace(/\n{3,}/g, '\n\n');
  
  // Restore preserved URLs and placeholders
  preserved.forEach(({ original, marker }) => {
    result = result.replace(marker, original);
  });
  
  return result.trim();
}

/**
 * Summarizes content using AI while preserving all URLs
 * URLs are extracted before summarization and restored after
 */
export async function summarizeContentWithAI(
  content: string,
  options: SummarizationOptions
): Promise<SummarizationResult> {
  if (!content || !content.trim()) {
    return {
      summarizedContent: content,
      originalUrlCount: 0,
      preservedUrls: [],
      originalLength: 0,
      summarizedLength: 0,
    };
  }
  
  const {
    apiKey,
    model = resolveModelForAgentCategory("research"),
    temperature = 0.7,
    maxTokens = 4000,
    topP = 0.9,
    onProgress,
  } = options;
  
  if (!apiKey || !apiKey.trim()) {
    throw new Error("OpenRouter API key is required for content summarization");
  }
  
  onProgress?.(`Extracting URLs from content...`);
  
  // Extract URLs and create content without URLs
  const { urls, placeholders, contentWithoutUrls } = extractUrls(content);
  
  const originalUrlCount = urls.length;
  const originalWordCount = countWords(contentWithoutUrls);
  
  onProgress?.(`Found ${originalUrlCount} URLs. Summarizing ${originalWordCount} words...`);
  
  // If content is already short or has no meaningful text, return as-is
  if (originalWordCount < 50 || contentWithoutUrls.trim().length < 200) {
    return {
      summarizedContent: content,
      originalUrlCount,
      preservedUrls: urls,
      originalLength: content.length,
      summarizedLength: content.length,
    };
  }
  
  const systemPrompt = `You are a content brief creator that transforms web page content into a structured, easy-to-understand content brief. Your task is to create a clear, organized summary that mimics the original page layout and structure.

CRITICAL RULES FOR CONTENT BRIEF CREATION:
1. PRESERVE ALL ## HEADERS - Keep every ## header (H2) from the original content exactly as they appear - these represent the page structure
2. PRESERVE ALL URLs - Keep ALL URL placeholders like __URL_PLACEHOLDER_0__ exactly as they appear - URLs are critical for context
3. MIMIC PAGE LAYOUT - Maintain the original structure and flow of the page as it appears to users
4. CREATE CONTENT BRIEF FORMAT - Write each section as a clear, concise content brief that explains what that section contains
5. MAINTAIN LOGICAL FLOW - Keep sections in their original order to preserve the page's narrative structure
6. USE CLEAR LANGUAGE - Write in simple, direct sentences that are easy for AI to parse and understand
7. PRESERVE KEY INFORMATION - Keep all important facts, technical terms, proper nouns, names, dates, and critical details
8. REMOVE FLUFF - Eliminate marketing speak, redundant phrases, and verbose explanations while keeping essential content
9. STRUCTURE FOR AI - Format content so AI can easily understand the page structure and extract information

CONTENT BRIEF FORMAT:
- Each ## header represents a section of the page
- Under each header, write 2-4 clear sentences that summarize what that section covers
- Use simple, direct language
- Focus on facts and key information
- Maintain the logical flow from section to section
- Preserve all URL placeholders exactly as they appear

Your goal is to create a structured content brief that mimics the original page layout, making it easy for AI to understand the page structure and content. Return the content brief maintaining all ## headers and URL placeholders exactly as they appear.`;

  const userPrompt = `Transform the following web page content into a structured content brief that mimics the original page layout. Preserve ALL ## headers and ALL URLs. For each ## header, write a clear 2-4 sentence summary of that section's content. Keep URL placeholders __URL_PLACEHOLDER_X__ unchanged:

${contentWithoutUrls}

Create a content brief that:
- Preserves ALL ## headers exactly as they appear (maintains page structure)
- Keeps ALL URL placeholders __URL_PLACEHOLDER_X__ unchanged
- Writes clear, concise summaries under each header (2-4 sentences)
- Mimics the original page layout and flow
- Uses simple, direct language easy for AI to understand
- Maintains logical flow between sections
- Focuses on facts and key information
- Removes marketing fluff while keeping essential content`;

  let summarizedText = "";
  
  try {
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      maxTokens,
      topP,
      onContentChunk: (chunk) => {
        summarizedText += chunk;
      },
    });
    
    onProgress?.(`Summarization complete. Restoring URLs...`);
    
    // Restore URLs from placeholders
    let summarizedContent = restoreUrls(summarizedText.trim(), placeholders);
    
    // Post-process to minimize punctuation for token optimization
    summarizedContent = minimizePunctuation(summarizedContent);
    
    const summarizedWordCount = countWords(summarizedContent);
    
    onProgress?.(`Summary complete: ${originalWordCount} → ${summarizedWordCount} words (${originalUrlCount} URLs preserved)`);
    
    return {
      summarizedContent,
      originalUrlCount,
      preservedUrls: urls,
      originalLength: content.length,
      summarizedLength: summarizedContent.length,
    };
  } catch (error) {
    console.error("[Content Summarizer] Error during AI summarization:", error);
    // Fallback to original content on error
    return {
      summarizedContent: content,
      originalUrlCount,
      preservedUrls: urls,
      originalLength: content.length,
      summarizedLength: content.length,
    };
  }
}

