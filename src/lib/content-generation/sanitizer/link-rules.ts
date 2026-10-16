import { isMediaAssetUrl } from "@/lib/content-optimization/images-extract";

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
    console.log(`[Content Sanitizer] Removed malformed link format [URL: ...]: "${match.substring(0, 60)}..." (links must be integrated contextually, not appended)`);
    return ''; // Remove entirely - links should be integrated by AI, not appended
  });
  
  // Pattern 2: [url: ...] (lowercase) - REMOVE these entirely
  const urlPattern2 = /\[url:\s*(https?:\/\/[^\]]+)\]/gi;
  fixed = fixed.replace(urlPattern2, (match) => {
    removedCount++;
    console.log(`[Content Sanitizer] Removed malformed link format [url: ...]: "${match.substring(0, 60)}..." (links must be integrated contextually, not appended)`);
    return ''; // Remove entirely
  });
  
  // Pattern 3: Links appended at end of sentences/descriptions
  // Pattern: text ending with period/full stop, then space, then [URL: ...] or [url: ...]
  // This indicates a link was appended rather than integrated
  const appendedLinkPattern = /\.\s+\[(?:URL|url):\s*(https?:\/\/[^\]]+)\]/gi;
  fixed = fixed.replace(appendedLinkPattern, (match) => {
    removedCount++;
    console.log(`[Content Sanitizer] Removed appended link at end of sentence: "${match.substring(0, 60)}..." (links must be integrated contextually)`);
    return '.'; // Keep the period, remove the appended link
  });
  
  // Pattern 4: Links in table cells that are just appended (not integrated)
  // Look for table cells ending with [URL: ...] or [url: ...]
  // Match: | content [URL: https://...] |
  const tableCellAppendedPattern = /\|\s*([^|]*?)\s*\[(?:URL|url):\s*(https?:\/\/[^\]]+)\]\s*\|/gi;
  fixed = fixed.replace(tableCellAppendedPattern, (match, cellContent) => {
    removedCount++;
    console.log(`[Content Sanitizer] Removed appended link from table cell: "[URL: ...]" (links must be integrated into cell content, not appended)`);
    // Remove the [URL: ...] part, keep the cell content
    return `| ${cellContent.trim()} |`;
  });
  
  // Pattern 5: Links appended without period before them
  // Match: text [URL: https://...] (no period before)
  const appendedLinkNoPeriodPattern = /([^\s])\s+\[(?:URL|url):\s*(https?:\/\/[^\]]+)\]/gi;
  fixed = fixed.replace(appendedLinkNoPeriodPattern, (match, beforeChar) => {
    removedCount++;
    console.log(`[Content Sanitizer] Removed appended link: "[URL: ...]" (links must be integrated contextually, not appended)`);
    return beforeChar; // Keep the character before, remove the appended link
  });
  
  // Clean up any double spaces or trailing spaces left after removal
  fixed = fixed.replace(/\s{2,}/g, ' '); // Replace multiple spaces with single space
  fixed = fixed.replace(/\s+\./g, '.'); // Remove spaces before periods
  fixed = fixed.replace(/\|\s+\|/g, '| |'); // Fix empty table cells with extra spaces
  
  if (removedCount > 0) {
    console.log(`[Content Sanitizer] Removed ${removedCount} malformed/appended link(s) - links must be integrated contextually into content, not appended as [URL: ...]`);
  }
  
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

  if (fixCount > 0) {
    console.log(`[Content Sanitizer] fixOrphanedListItems: fixed ${fixCount} orphaned list issue(s)`);
  }

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

/**
 * Normalize URL for deduplication: same page = same key (lowercase origin + pathname, no trailing slash).
 */
function normalizeUrlForDedupe(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.origin.toLowerCase()}${path}`;
  } catch {
    return url;
  }
}

/**
 * Ensure each link URL appears at most once in markdown content.
 * Keeps the first occurrence as [text](url); replaces subsequent same-URL links with plain text only.
 * Used for SEO extra content so we never link to the same page more than once.
 */
export function deduplicateInternalLinksInMarkdown(content: string): string {
  if (!content) return content;
  const seen = new Set<string>();
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
  return content.replace(markdownLinkPattern, (match, text: string, url: string) => {
    const key = normalizeUrlForDedupe(url);
    if (seen.has(key)) return text;
    seen.add(key);
    return match;
  });
}

/**
 * Ensure each internal link URL appears at most once in HTML content.
 * Keeps the first occurrence; replaces subsequent same-URL links with anchor text only.
 */
export function deduplicateInternalLinksInHtml(content: string): string {
  if (!content) return content;
  const seen = new Set<string>();
  let out = content;
  out = out.replace(/<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/a>/gi, (match, url: string, text: string) => {
    const key = normalizeUrlForDedupe(url);
    if (seen.has(key)) return text;
    seen.add(key);
    return match;
  });
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, (match, text: string, url: string) => {
    const key = normalizeUrlForDedupe(url);
    if (seen.has(key)) return text;
    seen.add(key);
    return match;
  });
  return out;
}

/**
 * Ensure no internal link ends in a period: move trailing period from anchor text to after </a>.
 * Mid-sentence link placement is enforced in harness prompts; do not inject SEO stub phrases.
 */
export function ensureNoLinkEndsInPeriod(html: string): string {
  if (!html) return html;
  let out = html;
  const isHashHref = (attrs: string) => /href\s*=\s*["']#/i.test(attrs);
  // Move period from inside anchor to outside: <a ...>text.</a> -> <a ...>text</a>.
  out = out.replace(/<a([^>]*)>([^<]*?)\.<\/a>/gi, (match, attrs: string, text: string) => {
    if (isHashHref(attrs)) return match;
    return `<a${attrs}>${text}</a>.`;
  });
  return out;
}

/** Remove orphan " for more." or "Related reading: <a ...>...</a>." tails left after link strip or bad output. */
export function stripDanglingForMoreTail(html: string): string {
  if (!html) return html;
  let out = html.replace(
    /\s*Related reading:\s*(?:<a\b[^>]*>[\s\S]*?<\/a>|\[[^\]]+\]\([^)]+\)|[^.<]+)\.?/gi,
    "",
  );
  out = out.replace(/\s+for more\.(?!\s*(?:information|details|context|guidance|resources|help|on|about)\b)/gi, ".");
  return out;
}

/**
 * Remove internal links that are NOT in the page-sitemap / blog catalog.
 * When wordPressPosts is provided: only allow links from the list.
 * When wordPressPosts is empty: leave content unchanged (cannot validate; ensureLinks adds from API).
 */
export function removeInvalidInternalLinks(content: string, wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>, connectedSiteUrl?: string): string {
  if (!content) return content;
  
  // Extract connected site domain for internal-link detection
  let connectedSiteDomain = '';
  let baseOrigin = '';
  if (connectedSiteUrl) {
    try {
      const urlObj = new URL(connectedSiteUrl.startsWith('http') ? connectedSiteUrl : `https://${connectedSiteUrl}`);
      connectedSiteDomain = urlObj.hostname.replace('www.', '').toLowerCase();
      baseOrigin = urlObj.origin;
    } catch {
      // Invalid URL, ignore
    }
  }

  // No page-sitemap / blog catalog: leave content unchanged (removeNonWikipediaExternalLinks still strips example.com etc.)
  if (!wordPressPosts || wordPressPosts.length === 0) {
    return content;
  }

  // Build valid set from WordPress API - include www/non-www and trailing-slash variants for matching
  const validInternalLinks = new Set<string>();
  const addUrlVariants = (raw: string) => {
    if (!raw?.trim()) return;
    const trimmed = raw.trim();
    validInternalLinks.add(trimmed);
    if (trimmed.endsWith('/')) validInternalLinks.add(trimmed.slice(0, -1));
    else validInternalLinks.add(trimmed + '/');
    try {
      const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const pathPart = u.pathname.replace(/\/+$/, '') || '/';
      const pathWithSlash = pathPart === '/' ? '/' : pathPart + '/';
      // Add www and non-www forms for same path (AI may generate different host variant)
      const hostNoWww = u.hostname.replace(/^www\./, '').toLowerCase();
      validInternalLinks.add(`${u.protocol}//${hostNoWww}${pathPart}`);
      validInternalLinks.add(`${u.protocol}//${hostNoWww}${pathWithSlash}`);
      validInternalLinks.add(`${u.protocol}//www.${hostNoWww}${pathPart}`);
      validInternalLinks.add(`${u.protocol}//www.${hostNoWww}${pathWithSlash}`);
    } catch {}
  };
  wordPressPosts.forEach(post => {
    if (post.link?.trim()) addUrlVariants(post.link);
  });

  const pageCount = wordPressPosts.filter(
    (p) =>
      (p as { postType?: string }).postType === "page" ||
      (!(p as { postType?: string }).postType &&
        !(String(p.link ?? "").toLowerCase().includes("/blog/"))),
  ).length;
  const postCount = wordPressPosts.length - pageCount;
  console.log(
    `[Link Sanitizer] Valid internal links: from WordPress API only (${validInternalLinks.size} variants from ${wordPressPosts.length} catalog items, ${pageCount} pages, ${postCount} posts)`,
  );

  // Pattern: markdown [text](url), HTML absolute href, HTML relative href="/path"
  const linkPattern = /(\[([^\]]+)\]\((https?:\/\/[^\)]+)\)|<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/a>|<a[^>]*href=["'](\/[^"']*)["'][^>]*>([^<]*)<\/a>)/gi;

  let sanitized = content;
  let removedCount = 0;

  sanitized = sanitized.replace(linkPattern, (match, _fullMatch, markdownText, markdownUrl, htmlAbsUrl, htmlAbsText, relativePath, htmlRelText) => {
    let url: string | null = markdownUrl || htmlAbsUrl || null;
    if (url == null && relativePath != null && relativePath !== '' && baseOrigin) {
      try {
        url = relativePath.startsWith('/') ? `${baseOrigin}${relativePath}` : new URL(relativePath, baseOrigin).href;
      } catch {
        url = null;
      }
    }
    const anchorText = markdownText ?? htmlAbsText ?? htmlRelText ?? '';

    if (!url) return match; // Keep if no URL found

    try {
      const urlObj = new URL(url);
      const linkDomain = urlObj.hostname.replace('www.', '').toLowerCase();

      // Check if it's an external link (not connected site)
      const isExternal = connectedSiteDomain && linkDomain !== connectedSiteDomain;

      // If external, allow only Wikipedia (handled by removeNonWikipediaExternalLinks)
      if (isExternal) {
        const isWikipedia = linkDomain === 'wikipedia.org' ||
                           linkDomain === 'en.wikipedia.org' ||
                           linkDomain.includes('wikipedia.org');
        if (isWikipedia) {
          return match; // Keep Wikipedia links
        }
        // External non-Wikipedia links will be removed by removeNonWikipediaExternalLinks
        return match;
      }

      // Same-site media assets (uploads / image / video files) are not post URLs — keep them.
      if (isMediaAssetUrl(url)) {
        return match;
      }
      // For internal links, allow only if URL matches one from WordPress API (www/non-www, trailing slash variants)
      const urlTrimmed = url.trim();
      const normalized = urlTrimmed.replace(/\/+$/, '') || '/';
      const withSlash = normalized === '/' ? normalized : normalized + '/';
      let isValidInternalLink =
        validInternalLinks.has(urlTrimmed) ||
        validInternalLinks.has(normalized) ||
        validInternalLinks.has(withSlash);
      if (!isValidInternalLink && urlObj) {
        // Check www/non-www variant (content URL may differ from API)
        const hostRaw = urlObj.hostname;
        const hostNoWww = hostRaw.replace(/^www\./i, '').toLowerCase();
        const pathPart = urlObj.pathname.replace(/\/+$/, '') || '/';
        const pathWithSlash = pathPart === '/' ? '/' : pathPart + '/';
        const alt1 = `${urlObj.protocol}//${hostNoWww}${pathPart}`;
        const alt2 = `${urlObj.protocol}//${hostNoWww}${pathWithSlash}`;
        const alt3 = `${urlObj.protocol}//www.${hostNoWww}${pathPart}`;
        const alt4 = `${urlObj.protocol}//www.${hostNoWww}${pathWithSlash}`;
        isValidInternalLink = validInternalLinks.has(alt1) || validInternalLinks.has(alt2) || validInternalLinks.has(alt3) || validInternalLinks.has(alt4);
      }

      if (!isValidInternalLink) {
        removedCount++;
        console.warn(`[Link Sanitizer] REMOVED invalid internal link (not in WordPress posts): ${url}`);
        // Remove the link but keep the text
        return anchorText;
      }

      return match; // Keep valid internal links
    } catch {
      // Invalid URL, keep as-is
      return match;
    }
  });
  
  if (removedCount > 0) {
    console.warn(`[Link Sanitizer] Removed ${removedCount} invalid internal link(s) (only links from WordPress posts are allowed)`);
  }
  
  return sanitized;
}

/**
 * Remove external links except: (1) connected site, (2) optionally the entity's Wikipedia page only.
 * CRITICAL: Wikipedia ONLY for entity - when allowedWikipediaUrl is provided, only that URL is kept.
 * When allowedWikipediaUrl is NOT provided, ALL Wikipedia links are stripped (no topic/product Wikipedia).
 */
export function removeNonWikipediaExternalLinks(
  content: string,
  connectedSiteUrl?: string,
  allowedWikipediaUrl?: string,
  allowedExternalUrls?: string[]
): string {
  if (!content) return content;

  let connectedSiteDomain = '';
  if (connectedSiteUrl) {
    try {
      const urlObj = new URL(connectedSiteUrl.startsWith('http') ? connectedSiteUrl : `https://${connectedSiteUrl}`);
      connectedSiteDomain = urlObj.hostname.replace('www.', '').toLowerCase();
    } catch {
      /* ignore */
    }
  }

  const normUrl = (u: string) => {
    try {
      const o = new URL(u);
      return `${o.hostname.replace('www.', '').toLowerCase()}${o.pathname.replace(/\/+$/, '').toLowerCase()}`;
    } catch {
      return u.toLowerCase();
    }
  };
  /** Same host+path keys as allowlist building - tolerant of &amp; vs &, http/https. */
  const normUrlForExternalAllowlist = (u: string) => {
    try {
      const cleaned = u.replace(/&amp;/gi, '&').trim();
      const o = new URL(cleaned);
      const host = o.hostname.replace(/^www\./, '').toLowerCase();
      const path = o.pathname.replace(/\/+$/, '') || '';
      return `${host}${path.toLowerCase()}`;
    } catch {
      return u.trim().toLowerCase();
    }
  };
  const expandAllowedExternalNorms = (urls: string[]): Set<string> => {
    const set = new Set<string>();
    for (const raw of urls) {
      if (!raw?.trim()) continue;
      const t = raw.trim().replace(/&amp;/gi, '&');
      set.add(normUrlForExternalAllowlist(t));
      try {
        const o = new URL(t);
        const alt = new URL(t);
        alt.protocol = o.protocol === 'https:' ? 'http:' : 'https:';
        set.add(normUrlForExternalAllowlist(alt.href));
      } catch {
        /* ignore */
      }
    }
    return set;
  };
  const hrefMatchesAllowedExternal = (href: string, allowedNorms: Set<string>): boolean => {
    if (allowedNorms.size === 0) return false;
    const candidates = [href, href.replace(/&amp;/gi, '&')];
    try {
      candidates.push(decodeURIComponent(href.replace(/&amp;/gi, '&')));
    } catch {
      /* ignore */
    }
    for (const c of candidates) {
      if (allowedNorms.has(normUrlForExternalAllowlist(c))) return true;
      try {
        const noHash = c.split('#')[0] ?? c;
        if (noHash !== c && allowedNorms.has(normUrlForExternalAllowlist(noHash))) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  };
  const normWiki = normUrl;
  const allowedNorm = allowedWikipediaUrl ? normWiki(allowedWikipediaUrl) : null;

  const allowedExternalNorms = expandAllowedExternalNorms(allowedExternalUrls ?? []);

  const linkPattern = /(\[([^\]]+)\]\((https?:\/\/[^\)]+)\)|<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/a>)/gi;
  let sanitized = content;
  let removedCount = 0;
  let keptExternalCount = 0;

  sanitized = sanitized.replace(linkPattern, (match, _fullMatch, markdownText, markdownUrl, htmlUrl, htmlText) => {
    const url = markdownUrl || htmlUrl;
    if (!url) return match;

    try {
      const urlObj = new URL(url);
      const linkDomain = urlObj.hostname.replace('www.', '').toLowerCase();
      const isConnectedSite = connectedSiteDomain && linkDomain === connectedSiteDomain;
      if (isConnectedSite) return match;

      if (allowedExternalNorms.size > 0 && hrefMatchesAllowedExternal(url, allowedExternalNorms)) {
        keptExternalCount++;
        return match;
      }

      const isWikipedia = linkDomain.includes('wikipedia.org');
      if (isWikipedia) {
        if (allowedNorm && normWiki(url) === allowedNorm) return match;
        removedCount++;
        console.warn(`[Link Sanitizer] REMOVED non-entity Wikipedia link (only entity Wikipedia allowed): ${url}`);
        return markdownText || htmlText || '';
      }

      removedCount++;
      console.warn(`[Link Sanitizer] REMOVED forbidden external link: ${url}`);
      return markdownText || htmlText || '';
    } catch {
      return match;
    }
  });

  if (keptExternalCount > 0) {
    console.log(`[Link Sanitizer] Kept ${keptExternalCount} allowlisted external link(s) (e.g. Semrush-approved)`);
  }
  if (removedCount > 0) {
    console.warn(`[Link Sanitizer] Removed ${removedCount} external link(s) (only connected site, entity Wikipedia, and pre-validated external links allowed)`);
  }
  return sanitized;
}

function normalizeWikiHrefForCompare(u: string): string {
  const decoded = u.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  return decoded
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

/**
 * Entity pages: wrap the first in-quote mention of the entity with its Wikipedia URL.
 * Do not prepend a leading cite when the name is not in the quote.
 */
export function linkWikipediaEntityInBlockquotes(
  html: string,
  entityName: string,
  wikipediaUrl: string
): string {
  if (!html?.trim() || !entityName?.trim() || !wikipediaUrl?.trim()) return html;
  const label = entityName.trim();
  const safeHref = wikipediaUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const targetNorm = normalizeWikiHrefForCompare(wikipediaUrl);

  const isInsideAnchor = (fragment: string, index: number): boolean => {
    const before = fragment.slice(0, index);
    const openA = (before.match(/<a\b/gi) || []).length;
    const closeA = (before.match(/<\/a>/gi) || []).length;
    return openA > closeA;
  };

  const alreadyHasThisWikiLink = (inner: string): boolean => {
    const re = /<a\b[^>]*href=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner)) !== null) {
      const h = m[1];
      if (!/wikipedia\.org/i.test(h)) continue;
      if (normalizeWikiHrefForCompare(h) === targetNorm) return true;
    }
    return false;
  };

  const entityEscaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entityReGlobal = new RegExp(entityEscaped, 'gi');

  return html.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_full, inner: string) => {
    if (alreadyHasThisWikiLink(inner)) {
      return `<blockquote>${inner}</blockquote>`;
    }
    let m: RegExpExecArray | null;
    entityReGlobal.lastIndex = 0;
    while ((m = entityReGlobal.exec(inner)) !== null) {
      const offset = m.index;
      if (isInsideAnchor(inner, offset)) continue;
      const matched = m[0];
      const linked =
        inner.slice(0, offset) +
        `<a href="${safeHref}">${matched}</a>` +
        inner.slice(offset + matched.length);
      return `<blockquote>${linked}</blockquote>`;
    }
    return `<blockquote>${inner}</blockquote>`;
  });
}

