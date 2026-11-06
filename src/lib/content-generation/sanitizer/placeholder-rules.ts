export const PLACEHOLDER_PATTERNS = [
  /\[table\]/gi,
  /\[\/table\]/gi,
  /\[list\]/gi,
  /\[\/list\]/gi,
  /\[image\]/gi,
  /\[\/image\]/gi,
  /\[img\]/gi,
  /\[\/img\]/gi,
  /\[caption\]/gi,
  /\[\/caption\]/gi,
  /\[code\]/gi,
  /\[\/code\]/gi,
  /\[quote\]/gi,
  /\[\/quote\]/gi,
  /\[video\]/gi,
  /\[\/video\]/gi,
  /\[embed\]/gi,
  /\[\/embed\]/gi,
  /\[gallery\]/gi,
  /\[\/gallery\]/gi,
  /\[button\]/gi,
  /\[\/button\]/gi,
  /\[link\]/gi,
  /\[\/link\]/gi,
  /\[divider\]/gi,
  /\[\/divider\]/gi,
  /\[spacer\]/gi,
  /\[\/spacer\]/gi,
  /\[section\]/gi,
  /\[\/section\]/gi,
  /\[column\]/gi,
  /\[\/column\]/gi,
  /\[row\]/gi,
  /\[\/row\]/gi,
  /\[widget\]/gi,
  /\[\/widget\]/gi,
  /\[shortcode\]/gi,
  /\[\/shortcode\]/gi,
  /\[placeholder[^\]]*\]/gi,
  /\[insert[^\]]*\]/gi,
  /\[add[^\]]*\]/gi,
  /\[TODO[^\]]*\]/gi,
  /\[FIXME[^\]]*\]/gi,
  /\[NOTE[^\]]*\]/gi,
  /\[EDIT[^\]]*\]/gi,
  /\[REMOVE[^\]]*\]/gi,
  /\[DELETE[^\]]*\]/gi,
  /\[REPLACE[^\]]*\]/gi,
  /\[UPDATE[^\]]*\]/gi,
  /\[CHANGE[^\]]*\]/gi,
  /\[FIX[^\]]*\]/gi,
  /\[insert image here\]/gi,
  /\[insert link here\]/gi,
  /\[insert table here\]/gi,
  /\[add content here\]/gi,
  /\[your content here\]/gi,
  /\[content placeholder\]/gi,
  /\[image placeholder\]/gi,
  /\[table placeholder\]/gi,
];

const COMBINED_PLACEHOLDER_RE = new RegExp(
  PLACEHOLDER_PATTERNS.map((p) => `(?:${p.source})`).join('|'),
  'gi',
);

/** Remove bracket placeholder artifacts before WordPress upload. */
export function sanitizePlaceholders(content: string): string {
  if (!content) return content;

  let sanitized = content;
  let removedCount = 0;

  const genericBracketPlaceholder = /(?<!\[)\[(?!\[(?:LINK|SCROLL|EXTERNAL):)[^\]]+\](?!\s*\()/g;
  const genericMatches = sanitized.match(genericBracketPlaceholder);
  if (genericMatches) removedCount += genericMatches.length;
  sanitized = sanitized.replace(genericBracketPlaceholder, ' ');
  sanitized = sanitized.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  const placeholderMatches = sanitized.match(COMBINED_PLACEHOLDER_RE);
  if (placeholderMatches) removedCount += placeholderMatches.length;
  sanitized = sanitized.replace(COMBINED_PLACEHOLDER_RE, '');

  sanitized = sanitized.replace(/<p>\s*<\/p>/gi, '');
  sanitized = sanitized.replace(/<p>&nbsp;<\/p>/gi, '');
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  sanitized = sanitized.replace(/<div>\s*<\/div>/gi, '');
  sanitized = sanitized.replace(/<span>\s*<\/span>/gi, '');

  return sanitized.trim();
}
