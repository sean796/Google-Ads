/**
 * WordPress Post to Markdown Converter
 * Converts WordPress HTML content to markdown format for knowledge base
 */

import type { WordPressPostContent } from './wordpress-api';
import { sanitizeFileName } from './file-processing';
import { summarizeContentWithAI, type SummarizationOptions } from './content-summarizer';
import { resolveModelForAgentCategory } from '@/lib/openrouter-agent-category-api';

export interface WordPressConversionOptions {
  summarizeWithAI?: boolean;
  openRouterApiKey?: string;
  onSummarizeProgress?: (message: string) => void;
}

/**
 * Simple HTML to Markdown converter
 * Handles common WordPress HTML elements
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  
  let markdown = html;
  
  // Remove script and style tags
  markdown = markdown.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  markdown = markdown.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Headers ([\s\S] — Elementor often puts newlines/tabs inside heading tags)
  markdown = markdown.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, inner) => `# ${inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}\n\n`);
  markdown = markdown.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, inner) => `## ${inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}\n\n`);
  markdown = markdown.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, inner) => `### ${inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}\n\n`);
  markdown = markdown.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, inner) => `#### ${inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}\n\n`);
  markdown = markdown.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, inner) => `##### ${inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}\n\n`);
  markdown = markdown.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, inner) => `###### ${inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}\n\n`);
  
  // Bold and italic
  markdown = markdown.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  markdown = markdown.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  
  // Links
  markdown = markdown.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  
  // Images - CRITICAL: Only convert images with valid alt tags
  // First, convert images with alt tags (preserve alt text)
  markdown = markdown.replace(/<img[^>]*alt=["']([^"']+)["'][^>]*src=["']([^"']*)["'][^>]*>/gi, '![$1]($2)');
  // Remove images without alt tags (don't convert them - they won't be placed)
  markdown = markdown.replace(/<img[^>]*src=["']([^"']*)["'][^>]*>/gi, '');
  
  // Lists - CRITICAL: use [\s\S]*? not .*? so we capture multiline/nested content (e.g. <li><p>...</p></li>)
  markdown = markdown.replace(/<ul[^>]*>/gi, '\n');
  markdown = markdown.replace(/<\/ul>/gi, '\n');
  markdown = markdown.replace(/<ol[^>]*>/gi, '\n');
  markdown = markdown.replace(/<\/ol>/gi, '\n');
  markdown = markdown.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => {
    const text = inner.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n').replace(/<[^>]+>/g, '').trim();
    return text ? `- ${text}\n` : '';
  });
  
  // Paragraphs
  markdown = markdown.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
  
  // Line breaks
  markdown = markdown.replace(/<br[^>]*\/?>/gi, '\n');
  markdown = markdown.replace(/<hr[^>]*\/?>/gi, '\n---\n');
  
  // Blockquotes
  markdown = markdown.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '> $1\n\n');
  
  // Code blocks
  markdown = markdown.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n');
  markdown = markdown.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Tables: convert HTML tables to markdown pipe tables so they are NOT stripped by "Remove remaining HTML tags"
  markdown = markdown.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) => {
    const stripCell = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const rows: string[][] = [];
    const trParts = inner.split(/<tr[^>]*>/gi);
    for (const part of trParts) {
      const cellParts = part.split(/<\/tr>/gi)[0] || '';
      const ths = cellParts.match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
      const tds = cellParts.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      const cells = ths.length ? ths : tds;
      if (cells.length === 0) continue;
      const row = cells.map((c: string) => {
        const m = c.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/i);
        return stripCell(m ? m[1] : c);
      });
      if (row.some(c => c.length > 0)) rows.push(row);
    }
    if (rows.length === 0) return '';
    const sep = '| ' + rows[0].map(() => '---').join(' | ') + ' |';
    const header = '| ' + rows[0].join(' | ') + ' |';
    const body = rows.slice(1).map(r => '| ' + r.join(' | ') + ' |').join('\n');
    return '\n\n' + header + '\n' + sep + (body ? '\n' + body : '') + '\n\n';
  });

    // Remove remaining HTML tags
  markdown = markdown.replace(/<[^>]+>/g, '');
    
  // Decode HTML entities
  markdown = markdown
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
  
  // Clean up extra whitespace (Elementor leaves tabs in text nodes)
  markdown = markdown.replace(/\t+/g, ' ');
  markdown = markdown.replace(/[ \t]+\n/g, '\n');
  markdown = markdown.replace(/\n{3,}/g, '\n\n');
  markdown = markdown.trim();
  
  return markdown;
}

/**
 * Convert WordPress post content to markdown format
 * 
 * @param post - WordPress post content
 * @param timestamp - Optional timestamp for filename
 * @param options - Optional conversion options including AI summarization
 * @returns Markdown content string
 */
export async function convertWordPressPostToMarkdown(
  post: WordPressPostContent,
  timestamp?: number,
  options?: WordPressConversionOptions
): Promise<string> {
  const ts = timestamp || Date.now();
  const date = post.date_gmt ? new Date(post.date_gmt).toISOString().split('T')[0] : '';
  
  // Convert HTML content to markdown
  let contentMarkdown = htmlToMarkdown(post.content);
  let excerptMarkdown = htmlToMarkdown(post.excerpt);
  
  // Apply AI summarization if requested
  if (options?.summarizeWithAI && options?.openRouterApiKey) {
    try {
      const summarizationOptions: SummarizationOptions = {
        apiKey: options.openRouterApiKey,
        model: resolveModelForAgentCategory("research"),
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9,
        onProgress: options.onSummarizeProgress,
      };
      
      // Summarize content if it's substantial
      if (contentMarkdown.trim().length > 200) {
        options.onSummarizeProgress?.(`AI analyzing content for post: ${post.title?.substring(0, 50)}...`);
        const contentResult = await summarizeContentWithAI(contentMarkdown, summarizationOptions);
        contentMarkdown = contentResult.summarizedContent;
      }
      
      // Summarize excerpt if it's substantial
      if (excerptMarkdown.trim().length > 200) {
        const excerptResult = await summarizeContentWithAI(excerptMarkdown, summarizationOptions);
        excerptMarkdown = excerptResult.summarizedContent;
      }
    } catch (error) {
      console.error("[WordPress Converter] Error during AI summarization:", error);
      // Fallback to original content on error
      options.onSummarizeProgress?.("AI summarization failed, using original content");
    }
  }
  
  // Build markdown document
  let markdown = `# ${post.title}\n\n`;
  
  if (date) {
    markdown += `**Date:** ${date}\n\n`;
  }
  
  if (post.link) {
    markdown += `**URL:** ${post.link}\n\n`;
  }
  
  if (excerptMarkdown) {
    markdown += `## Excerpt\n\n${excerptMarkdown}\n\n`;
  }
  
  if (contentMarkdown) {
    markdown += `## Content\n\n${contentMarkdown}\n\n`;
  }
  
  return markdown;
}

/**
 * Generate filename for WordPress markdown file
 * 
 * @param post - WordPress post content
 * @param timestamp - Optional timestamp for filename
 * @returns Filename string
 */
export function generateWordPressMarkdownFileName(
  post: WordPressPostContent,
  timestamp?: number
): string {
  const ts = timestamp || Date.now();
  
  // Extract and sanitize title for filename
  const title = post.title || 'untitled';
  // Sanitize and limit length to avoid filesystem issues (max 80 chars for title part)
  const sanitizedTitle = sanitizeFileName(title).substring(0, 80);
  
  // Use post ID if available for better uniqueness, fallback to slug
  const identifier = post.id ? post.id : (post.slug || 'unknown');
  
  // Format: wordpress-<title>-<id>-<timestamp>.md
  return `wordpress-${sanitizedTitle}-${identifier}-${ts}.md`;
}

/**
 * Convert multiple WordPress posts to markdown files
 * 
 * @param posts - Array of WordPress post content
 * @param timestamp - Optional timestamp for filenames
 * @param options - Optional conversion options including AI summarization
 * @returns Promise resolving to array of markdown file objects
 */
export async function convertWordPressPostsToMarkdownFiles(
  posts: WordPressPostContent[],
  timestamp?: number,
  options?: WordPressConversionOptions
): Promise<Array<{ name: string; content: string }>> {
  const ts = timestamp || Date.now();
  
  const results = [];
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const content = await convertWordPressPostToMarkdown(post, ts, options);
    results.push({
      name: generateWordPressMarkdownFileName(post, ts),
      content,
    });
  }
  
  return results;
}

