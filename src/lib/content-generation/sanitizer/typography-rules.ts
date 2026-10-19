/** Remove colons outside URLs/links (replaced with periods). */
export function removeColons(content: string): string {
  if (!content) return content;

  const urlOrColonRe =
    /(https?:\/\/[^\s\)"<>]+|!\[[^\]]*\]\([^\)]+\)|\[[^\]]*\]\([^\)]+\)|<img[^>]*src=["']https?:\/\/[^"']+["'][^>]*>|<a[^>]*href=["']https?:\/\/[^"']+["'][^>]*>)|:/gi;
  let colonCount = 0;
  const sanitized = content.replace(urlOrColonRe, (match) => {
    if (match === ':') {
      colonCount++;
      return '.';
    }
    return match;
  });

  if (colonCount > 0) {
    console.log(
      `[Content Sanitizer] Removed ${colonCount} colon(s) from content (replaced with periods, preserved URLs)`,
    );
  }

  return sanitized;
}

/** Replace em/en dashes and entities with comma or hyphen; preserve URLs. */
export function removeEmDashes(content: string): string {
  if (!content) return content;

  const emDashPattern = /\u2014|&mdash;|&#8212;/gi;
  const enDashPattern = /\u2013|&ndash;|&#8211;/gi;

  const urlPattern =
    /(https?:\/\/[^\s\)"<>]+|!\[[^\]]*\]\([^\)]+\)|\[[^\]]*\]\([^\)]+\)|<img[^>]*src=["']https?:\/\/[^"']+["'][^>]*>|<a[^>]*href=["']https?:\/\/[^"']+["'][^>]*>)/gi;
  const urlPlaceholders: string[] = [];
  let placeholderIndex = 0;

  const contentWithPlaceholders = content.replace(urlPattern, (match) => {
    const placeholder = `__URL_PLACEHOLDER_${placeholderIndex}__`;
    urlPlaceholders.push(match);
    placeholderIndex++;
    return placeholder;
  });

  const urlMatches: string[] = content.match(urlPattern) || [];
  const contentWithoutUrls = urlMatches.reduce(
    (acc: string, url: string) => acc.replace(url, ''),
    content,
  );
  const emDashCount = (contentWithoutUrls.match(emDashPattern) || []).length;
  const enDashCount = (contentWithoutUrls.match(enDashPattern) || []).length;

  let sanitized = contentWithPlaceholders
    .replace(emDashPattern, ", ")
    .replace(enDashPattern, "-");

  urlPlaceholders.forEach((url, index) => {
    sanitized = sanitized.replace(`__URL_PLACEHOLDER_${index}__`, url);
  });

  if (emDashCount > 0 || enDashCount > 0) {
    console.log(
      `[Content Sanitizer] Removed ${emDashCount} em dash(es) and ${enDashCount} en dash(es) from content (preserved URLs)`,
    );
  }

  return sanitized;
}
