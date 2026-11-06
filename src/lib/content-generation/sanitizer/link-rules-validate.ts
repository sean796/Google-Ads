import { isMediaAssetUrl } from "@/lib/content-optimization/images-extract";

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
    } catch {
      // Malformed post URL: skip its variants.
    }
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
  const linkPattern = /(\[([^\]]+)\]\((https?:\/\/[^)]+)\)|<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/a>|<a[^>]*href=["'](\/[^"']*)["'][^>]*>([^<]*)<\/a>)/gi;

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

  const linkPattern = /(\[([^\]]+)\]\((https?:\/\/[^)]+)\)|<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/a>)/gi;
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
