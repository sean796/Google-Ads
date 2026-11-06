/**
 * Blocklist for placeholder / fake URLs that models often emit (example.com, etc.).
 * Keep hostname list in sync with server/placeholder-link-strip.js
 */

/** Reserved documentation TLDs - never use as real internal links */
const EXAMPLE_TLD_ROOTS = ['example.com', 'example.org', 'example.net', 'example.edu'] as const;

export function isWikipediaLinkHostname(hostname: string): boolean {
  return hostname.toLowerCase().includes('wikipedia.org');
}

export function isPlaceholderLinkHostname(hostname: string): boolean {
  const h = hostname.replace(/^www\./i, '').toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return true;
  for (const root of EXAMPLE_TLD_ROOTS) {
    if (h === root || h.endsWith(`.${root}`)) return true;
  }
  return false;
}

/**
 * Remove markdown and HTML links whose href host is a placeholder domain.
 * Preserves *.wikipedia.org links. Replaces links with anchor text only.
 */
export function stripPlaceholderDomainLinks(content: string): string {
  if (!content) return content;

  const linkPattern =
    /(\[([^\]]+)\]\((https?:\/\/[^)]+)\)|<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/a>)/gi;

  return content.replace(linkPattern, (match, _full, markdownText, markdownUrl, htmlUrl, htmlText) => {
    const url = markdownUrl || htmlUrl;
    const text = markdownText ?? htmlText ?? '';
    if (!url) return match;
    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname;
      if (isWikipediaLinkHostname(host)) return match;
      if (isPlaceholderLinkHostname(host)) {
        return text;
      }
      return match;
    } catch {
      return match;
    }
  });
}
