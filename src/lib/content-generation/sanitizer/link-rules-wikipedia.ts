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

