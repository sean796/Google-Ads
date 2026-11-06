/**
 * Markdown to HTML Converter for WordPress
 * Converts markdown content to WordPress-compatible HTML
 */

import { marked } from 'marked';

/** Collapse `[text] (url)` to `[text](url)` so marked always parses links. */
export function normalizeMarkdownLinks(markdown: string): string {
  let out = markdown.replace(
    /\[([^\]]+)\]\s+\((https?:\/\/[^)]+)\)/g,
    '[$1]($2)',
  );
  out = out.replace(
    /\[([^\]]+)\]\s+\((#[^)]+)\)/g,
    '[$1]($2)',
  );
  return out;
}

/**
 * Convert markdown content to WordPress-compatible HTML
 * 
 * @param markdown - Markdown content string
 * @returns HTML string suitable for WordPress post content
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown || markdown.trim().length === 0) {
    return '';
  }

  const normalized = normalizeMarkdownLinks(markdown);
  
  // Configure marked options for WordPress compatibility
  marked.setOptions({
    breaks: true, // Convert line breaks to <br>
    gfm: true, // GitHub Flavored Markdown
  });
  
  // Convert markdown to HTML
  let html = marked.parse(normalized) as string;
  
  // Post-process HTML for WordPress compatibility
  html = postProcessHtml(html);
  
  return html;
}

/**
 * Post-process HTML to ensure WordPress compatibility
 * 
 * @param html - Raw HTML from markdown conversion
 * @returns Processed HTML
 */
function postProcessHtml(html: string): string {
  // Ensure proper paragraph spacing
  html = html.replace(/<p>\s*<\/p>/g, ''); // Remove empty paragraphs
  html = html.replace(/\n{3,}/g, '\n\n'); // Normalize multiple newlines
  
  // Ensure code blocks are properly formatted
  // WordPress handles <pre><code> blocks well, so we keep them as-is
  
  // Ensure images have proper attributes and full-width styling
  // Wrap images in a div container for full-width display (WordPress-safe approach)
  html = html.replace(
    /<img([^>]*?)>/g,
    (match, attrs) => {
      let newAttrs = attrs;
      
      // Extract alt text for figure caption if available
      const altMatch = attrs.match(/alt=["']([^"']*)["']/);
      const altText = altMatch ? altMatch[1] : '';
      
      // Add loading="lazy" if not present
      if (!newAttrs.includes('loading=')) {
        newAttrs += ' loading="lazy"';
      }
      
      // Add full-width styling to image itself
      if (!newAttrs.includes('style=')) {
        newAttrs += ' style="width: 100%; height: auto; max-width: 100%; display: block;"';
      } else {
        // If style exists, append to it (but preserve existing styles)
        newAttrs = newAttrs.replace(
          /style=["']([^"']*)["']/,
          (styleMatch, existingStyle) => {
            // Only add width styles if they don't already exist
            if (!existingStyle.includes('width') && !existingStyle.includes('max-width')) {
              return `style="${existingStyle}; width: 100%; height: auto; max-width: 100%; display: block;"`;
            }
            return styleMatch;
          }
        );
      }
      
      const finalImg = `<img${newAttrs}>`;
      
      // Wrap image in a full-width container div
      // This ensures full-width display even if WordPress strips inline styles
      // Use both inline styles and a wrapper for maximum compatibility
      const wrappedImage = `<div style="width: 100% !important; max-width: 100% !important; margin: 1.5em auto; display: block; box-sizing: border-box; overflow: hidden; clear: both;">${finalImg}</div>`;
      return wrappedImage;
    }
  );
  
  // Ensure links open in new tab (optional, but good for external links)
  // We'll leave this as-is since WordPress handles links differently
  
  // Clean up any extra whitespace
  html = html.trim();
  
  return html;
}

/**
 * Generate excerpt from markdown content
 * Extracts first meaningful paragraph (skips introduction sections)
 * Removes "Introduction:" prefix and ensures engaging, front-loaded description
 * 
 * @param markdown - Markdown content
 * @param maxLength - Maximum length for excerpt (default: 155)
 * @returns Plain text excerpt
 */
export function generateExcerpt(markdown: string, maxLength: number = 155): string {
  if (!markdown || markdown.trim().length === 0) {
    return '';
  }
  
  // Remove markdown headers, code blocks, and links for excerpt
  const text = markdown
    .replace(/^#+\s+/gm, '') // Remove headers
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`[^`]+`/g, '') // Remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .trim();
  
  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  
  // Find first non-introduction paragraph
  let selectedParagraph = '';
  for (const para of paragraphs) {
    const paraLower = para.toLowerCase().trim();
    // Skip introduction paragraphs
    if (paraLower.startsWith('introduction') || 
        (paraLower.includes('this article') && para.length < 200) ||
        (paraLower.includes('in this guide') && para.length < 200) ||
        (paraLower.includes('welcome to') && para.length < 200)) {
      continue; // Skip this paragraph
    }
    // Found a good paragraph
    selectedParagraph = para.trim();
    break;
  }
  
  // Fallback to first paragraph if all were skipped
  if (!selectedParagraph && paragraphs.length > 0) {
    selectedParagraph = paragraphs[0].trim();
  }
  
  // Fallback to first sentence if no paragraphs
  if (!selectedParagraph) {
    selectedParagraph = text.split('\n')[0] || text;
  }
  
  // Remove "Introduction:" prefix if present
  selectedParagraph = selectedParagraph
    .replace(/^Introduction:\s*/i, '')
    .replace(/^(This article|In this guide|This guide|This post|Here's|Welcome to)\s+/i, '')
    .trim();
  
  // Truncate to max length
  if (selectedParagraph.length > maxLength) {
    // Try to break at sentence boundary
    const truncated = selectedParagraph.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastExclamation = truncated.lastIndexOf('!');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastBreak = Math.max(lastPeriod, lastExclamation, lastQuestion);
    
    if (lastBreak > maxLength * 0.5) {
      // Use sentence boundary if it's not too early
      return truncated.substring(0, lastBreak + 1);
    } else {
      // Otherwise truncate at word boundary
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > maxLength * 0.7) {
        return truncated.substring(0, lastSpace) + '...';
      }
      return truncated + '...';
    }
  }
  
  return selectedParagraph;
}

