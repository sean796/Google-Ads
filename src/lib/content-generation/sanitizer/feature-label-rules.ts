const FEATURE_LABEL_TYPES = 'LIST|TABLE|LINK|STRUCTURE|CUSTOM|BLOCKQUOTE|IMAGE|FAQ';

/**
 * Remove feature-label artifacts from content
 * Strips prompt/checklist markers like [LIST]: ..., [TABLE]: ... that the AI sometimes
 * outputs literally. Removes whole blocks that are only a label, and inline occurrences.
 */
export function removeFeatureLabelArtifacts(content: string): string {
  if (!content) return content;

  let sanitized = content;
  let removedCount = 0;

  const blockPattern = new RegExp(
    `<p>\\s*\\[(${FEATURE_LABEL_TYPES})\\]\\s*:\\s*[^<]*</p>`,
    'gi',
  );
  sanitized = sanitized.replace(blockPattern, () => {
    removedCount++;
    return '';
  });

  const divBlockPattern = new RegExp(
    `<div[^>]*>\\s*\\[(${FEATURE_LABEL_TYPES})\\]\\s*:\\s*[^<]*</div>`,
    'gi',
  );
  sanitized = sanitized.replace(divBlockPattern, () => {
    removedCount++;
    return '';
  });

  const inlinePattern = new RegExp(
    `\\s*\\[(${FEATURE_LABEL_TYPES})\\]\\s*:\\s*[^<\\[\\n]*`,
    'gi',
  );
  const beforeInline = sanitized.length;
  sanitized = sanitized.replace(inlinePattern, '');
  if (sanitized.length !== beforeInline) {
    removedCount += beforeInline - sanitized.length > 0 ? 1 : 0;
  }

  sanitized = sanitized.replace(/\s{2,}/g, ' ');
  sanitized = sanitized.replace(/\s+\./g, '.');

  return sanitized;
}
