/**
 * Preserves the natural grammar and sentence capitalization of meta descriptions.
 * Only normalizes accidental hyphenated URL-slug pastes of a multi-word focus keyword into spaces,
 * and ensures the opening character of the sentence is capitalized.
 */
export function enforceExactFocusKeyword(text: string, focusKeyword: string | undefined): string {
  if (!text) return text;
  let result = text.trim();
  const exact = focusKeyword?.trim() ?? "";
  if (exact.includes(" ")) {
    const slugified = exact.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (slugified.length >= 4 && result.toLowerCase().includes(slugified)) {
      const spacedLower = exact.toLowerCase().replace(/\s+/g, " ");
      result = result.split(slugified).join(spacedLower);
    }
  }
  if (result.length > 0 && result[0]! >= "a" && result[0]! <= "z") {
    result = result[0]!.toUpperCase() + result.slice(1);
  }
  return result;
}
