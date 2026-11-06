/**
 * Content Sanitizer
 * Cleans content before WordPress upload to remove placeholder artifacts
 * and enforce image-per-section limits
 */

import { PLACEHOLDER_PATTERNS } from "@/lib/content-generation/sanitizer/placeholder-rules";

export { sanitizePlaceholders } from "@/lib/content-generation/sanitizer/placeholder-rules";
export { removeFeatureLabelArtifacts } from "@/lib/content-generation/sanitizer/feature-label-rules";
export { removeColons, removeEmDashes } from "@/lib/content-generation/sanitizer/typography-rules";
export {
  enforceOneImagePerSection,
  removeForbiddenSections,
  removeDuplicateHeadings,
  removeArticleTitleLabels,
} from "@/lib/content-generation/sanitizer/structure-rules";
export {
  removeEmptyTables,
  removeLinkColumnsFromTables,
  fixMalformedMarkdownTables,
} from "@/lib/content-generation/sanitizer/table-rules";
export {
  forceConvertMarkdownLinks,
  convertAllMarkdownToHtml,
} from "@/lib/content-generation/sanitizer/markdown-rules";
export {
  fixMalformedLinks,
  fixOrphanedListItems,
  flattenListItemBlockWrappers,
  deduplicateInternalLinksInMarkdown,
  deduplicateInternalLinksInHtml,
  ensureNoLinkEndsInPeriod,
  stripDanglingForMoreTail,
  removeInvalidInternalLinks,
  removeNonWikipediaExternalLinks,
  linkWikipediaEntityInBlockquotes,
} from "@/lib/content-generation/sanitizer/link-rules";
export { sanitizeContentForUpload } from "@/lib/content-generation/sanitizer/upload-pipeline";

export function stripTitleSeparatorSuffix(title: string): string {
  if (!title || !title.trim()) return title;
  const t = title.trim();
  const pipeIdx = t.indexOf(" | ");
  const dashIdx = t.indexOf(" – ");
  const hyphenIdx = t.indexOf(" - ");
  let cut = t.length;
  if (pipeIdx > 0) cut = Math.min(cut, pipeIdx);
  if (dashIdx > 0) cut = Math.min(cut, dashIdx);
  if (hyphenIdx > 0) cut = Math.min(cut, hyphenIdx);
  return (cut < t.length ? t.substring(0, cut) : t).trim();
}

/** The one SEO title limit for the whole app. Prompts state it; code enforces it. */
export const SEO_TITLE_MAX_CHARS = 60;

/**
 * Truncate an SEO title to SEO_TITLE_MAX_CHARS at a word boundary.
 * Models are never asked to count characters; this is the enforcement.
 */
export function truncateTitleForSEO(title: string, maxLength: number = SEO_TITLE_MAX_CHARS): string {
  if (!title) return title;
  
  const trimmed = title.trim();
  
  // If title is already within limit, return as-is
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  
  // Try to truncate at word boundary (space or punctuation)
  const truncated = trimmed.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const lastPunctuation = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf(','),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf(':'),
    truncated.lastIndexOf(';')
  );
  
  // Use the later of space or punctuation for a clean cut
  const cutPoint = Math.max(lastSpace, lastPunctuation);
  
  if (cutPoint > maxLength * 0.7) {
    // Only use word boundary if it's not too early (at least 70% of max length)
    return truncated.substring(0, cutPoint).trim();
  }
  
  // If no good word boundary, truncate at max length and add ellipsis if needed
  return truncated.trim();
}

/**
 * Validate content before upload
 * Returns warnings if content has issues (but doesn't block upload)
 */
export function validateContentForUpload(content: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  if (!content || content.trim().length === 0) {
    return { valid: false, warnings: ['Content is empty'] };
  }
  
  // Check for remaining placeholder patterns (shouldn't happen after sanitization)
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push(`Found placeholder pattern: ${pattern.source}`);
    }
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
  }
  
  // Check for suspiciously short content
  const textContent = content.replace(/<[^>]*>/g, '').trim();
  if (textContent.length < 100) {
    warnings.push('Content is very short (less than 100 characters of text)');
  }
  
  // Check for missing closing tags (basic check)
  const openTags = (content.match(/<[a-z][a-z0-9]*[^>]*(?<!\/)\s*>/gi) || []).length;
  const closeTags = (content.match(/<\/[a-z][a-z0-9]*>/gi) || []).length;
  if (Math.abs(openTags - closeTags) > 5) {
    warnings.push('Possible HTML tag mismatch detected');
  }
  
  return { valid: true, warnings };
}

