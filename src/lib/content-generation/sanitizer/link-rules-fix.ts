/**
 * Fix malformed link formats
 * Detects and removes links that use incorrect formats like [URL: ...] 
 * These formats indicate links are appended rather than contextually integrated
 * CRITICAL: Links must be in proper markdown format [anchor text](url) and integrated contextually for better SEO
 */
export function fixMalformedLinks(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let removedCount = 0;
  
  // Pattern 1: [URL: https://...] or [URL:http://...] format - REMOVE these entirely
  // They're not properly integrated and should be removed rather than converted
  // The AI should integrate links contextually, not append them
  const urlPattern1 = /\[URL:\s*(https?:\/\/[^\]]+)\]/gi;
  fixed = fixed.replace(urlPattern1, (match) => {
    removedCount++;
    return ''; // Remove entirely - links should be integrated by AI, not appended
  });
  
  // Pattern 2: [url: ...] (lowercase) - REMOVE these entirely
  const urlPattern2 = /\[url:\s*(https?:\/\/[^\]]+)\]/gi;
  fixed = fixed.replace(urlPattern2, (match) => {
    removedCount++;
    return ''; // Remove entirely
  });
  
  // Pattern 3: Links appended at end of sentences/descriptions
  // Pattern: text ending with period/full stop, then space, then [URL: ...] or [url: ...]
  // This indicates a link was appended rather than integrated
  const appendedLinkPattern = /\.\s+\[(?:URL|url):\s*(https?:\/\/[^\]]+)\]/gi;
  fixed = fixed.replace(appendedLinkPattern, (match) => {
    removedCount++;
    return '.'; // Keep the period, remove the appended link
  });
  
  // Pattern 4: Links in table cells that are just appended (not integrated)
  // Look for table cells ending with [URL: ...] or [url: ...]
  // Match: | content [URL: https://...] |
  const tableCellAppendedPattern = /\|\s*([^|]*?)\s*\[(?:URL|url):\s*(https?:\/\/[^\]]+)\]\s*\|/gi;
  fixed = fixed.replace(tableCellAppendedPattern, (match, cellContent) => {
    removedCount++;
    // Remove the [URL: ...] part, keep the cell content
    return `| ${cellContent.trim()} |`;
  });
  
  // Pattern 5: Links appended without period before them
  // Match: text [URL: https://...] (no period before)
  const appendedLinkNoPeriodPattern = /([^\s])\s+\[(?:URL|url):\s*(https?:\/\/[^\]]+)\]/gi;
  fixed = fixed.replace(appendedLinkNoPeriodPattern, (match, beforeChar) => {
    removedCount++;
    return beforeChar; // Keep the character before, remove the appended link
  });
  
  // Clean up any double spaces or trailing spaces left after removal
  fixed = fixed.replace(/\s{2,}/g, ' '); // Replace multiple spaces with single space
  fixed = fixed.replace(/\s+\./g, '.'); // Remove spaces before periods
  fixed = fixed.replace(/\|\s+\|/g, '| |'); // Fix empty table cells with extra spaces
  
  return fixed;
}

/**
 * Fix orphaned <li> elements that aren't wrapped in <ul> or <ol>.
 * AI sometimes outputs bare <li>...</li> blocks or leaves stray </ol>/<ul> closers
 * without matching openers, producing broken list markup on the live page.
 */
export function fixOrphanedListItems(content: string): string {
  if (!content) return content;

  let fixed = content;
  let fixCount = 0;

  // Step 1: Remove stray closing </ol> and </ul> that have no matching opener
  for (const listTag of ['ol', 'ul']) {
    const parts = fixed.split(new RegExp(`(</?${listTag}(?:\\s[^>]*)?>)`, 'gi'));
    let depth = 0;
    const out: string[] = [];
    for (const part of parts) {
      if (new RegExp(`^<${listTag}[\\s>]`, 'i').test(part)) {
        depth++;
        out.push(part);
      } else if (new RegExp(`^</${listTag}>$`, 'i').test(part)) {
        if (depth > 0) { depth--; out.push(part); }
        else { fixCount++; }
      } else {
        out.push(part);
      }
    }
    fixed = out.join('');
  }

  // Step 2: Wrap orphaned <li>...</li> sequences in <ul>
  // Matches one or more consecutive <li>...</li> blocks (with optional whitespace between)
  const liSequenceRegex = /(<li[\s>][\s\S]*?<\/li>(?:\s*<li[\s>][\s\S]*?<\/li>)*)/gi;
  const originalFixed = fixed;

  fixed = fixed.replace(liSequenceRegex, (match, _group, offset) => {
    const before = originalFixed.substring(0, offset);
    const ulOpens = (before.match(/<ul[\s>]/gi) || []).length;
    const ulCloses = (before.match(/<\/ul>/gi) || []).length;
    const olOpens = (before.match(/<ol[\s>]/gi) || []).length;
    const olCloses = (before.match(/<\/ol>/gi) || []).length;
    const listDepth = (ulOpens - ulCloses) + (olOpens - olCloses);

    if (listDepth > 0) return match;

    fixCount++;
    return `<ul>${match}</ul>`;
  });

  return fixed;
}

/**
 * Keep list markers on the same line as the item text.
 * Nested p or br inside li puts the number on its own line in WordPress.
 */
export function flattenListItemBlockWrappers(html: string): string {
  if (!html) return html;
  return html.replace(/<li(\b[^>]*)>([\s\S]*?)<\/li>/gi, (_match, attrs: string, inner: string) => {
    let t = inner.replace(/^\s*(?:<br\s*\/?>\s*)+/gi, "");
    t = t.replace(/^\s*\d{1,2}\.\s+/, "");
    t = t.replace(/<\/?p\b[^>]*>/gi, " ");
    t = t.replace(/<br\s*\/?>/gi, " ");
    t = t.replace(/\s+/g, " ").trim();
    return `<li${attrs}>${t}</li>`;
  });
}
