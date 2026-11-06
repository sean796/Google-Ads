/**
 * Enforce maximum 1 image per H2 section
 * Prevents image bloat during re-optimization
 */
export function enforceOneImagePerSection(html: string): string {
  if (!html) return html;
  
  // Split by H2 tags while preserving them
  const h2Regex = /(<h2[^>]*>)/gi;
  const parts = html.split(h2Regex);
  
  let totalRemoved = 0;
  
  const processedParts = parts.map((part, index) => {
    // H2 tags themselves (odd indices after split) should be preserved as-is
    if (index > 0 && h2Regex.test(parts[index - 1])) {
      // Reset regex lastIndex
      h2Regex.lastIndex = 0;
    }
    
    // For content sections (not H2 tags themselves)
    // Check if this part starts with an H2 tag or is content after an H2
    if (!part.match(/^<h2[^>]*>/i)) {
      // This is content, not an H2 tag
      // Count images in this section
      const imgRegex = /<img[^>]*>/gi;
      const images = part.match(imgRegex);
      
      if (images && images.length > 1) {
        // Keep only the first image
        let imageCount = 0;
        const cleaned = part.replace(imgRegex, (match) => {
          imageCount++;
          if (imageCount === 1) {
            return match; // Keep first image
          }
          totalRemoved++;
          return ''; // Remove subsequent images
        });
        return cleaned;
      }
    }
    
    return part;
  });
  
  return processedParts.join('');
}

/**
 * Remove forbidden section headings
 * Detects and removes entire sections with forbidden headings like "External Resources"
 * CRITICAL: Prevents sections that should never appear in published content
 */
export function removeForbiddenSections(content: string): string {
  if (!content) return content;
  
  const fixed = content;
  let removedCount = 0;
  
  // Patterns to match forbidden section headings (case-insensitive)
  const forbiddenPatterns = [
    /external\s+resource/i,           // "External Resources", "external resources", etc.
    /external\s+link/i,               // "External Links", "external links", etc.
    /external\s+reference/i,         // "External References", etc.
    /external\s+site/i,               // "External Sites", etc.
    /external\s+website/i,            // "External Websites", etc.
    /additional\s+resource/i,        // "Additional Resources" (often used for external links)
    /helpful\s+resource/i,           // "Helpful Resources" (often external)
    /useful\s+resource/i,            // "Useful Resources" (often external)
    /related\s+resource/i,          // "Related Resources" (often external)
  ];
  
  const lines = fixed.split('\n');
  const fixedLines: string[] = [];
  let skipSection = false;
  let skipSectionLevel = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      
      // Check if this heading matches any forbidden pattern
      const isForbidden = forbiddenPatterns.some(pattern => pattern.test(text));
      
      if (isForbidden) {
        // Start skipping this section
        skipSection = true;
        skipSectionLevel = level;
        removedCount++;
        continue; // Skip this heading line
      } else if (skipSection) {
        // We're in a forbidden section - check if we've reached a heading of same or higher level
        if (level <= skipSectionLevel) {
          // We've reached the next section at same or higher level - stop skipping
          skipSection = false;
          skipSectionLevel = 0;
          // Re-check this heading in case it's also forbidden (shouldn't happen, but be safe)
          if (!isForbidden) {
            fixedLines.push(line);
          }
        } else {
          // Still in the forbidden section (sub-heading) - continue skipping
          continue;
        }
      } else {
        // Normal heading, not forbidden - include it
        fixedLines.push(line);
      }
    } else {
      // Not a heading
      if (skipSection) {
        // Still in forbidden section - skip this line
        continue;
      } else {
        // Normal content - include it
        fixedLines.push(line);
      }
    }
  }
  
  return fixedLines.join('\n');
}

/**
 * Remove duplicate consecutive headings
 * Detects and removes headings that appear consecutively with identical text
 * Example: "## Heading\n## Heading" -> "## Heading"
 * CRITICAL: Prevents duplicate headings from appearing in published content
 */
export function removeDuplicateHeadings(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let removedCount = 0;
  
  // Pattern to match markdown headings (##, ###, ####, etc.)
  // Matches: heading level (#), optional space, heading text, optional trailing spaces
  const headingPattern = /^(#{1,6})\s+(.+?)\s*$/gm;
  
  const lines = fixed.split('\n');
  const fixedLines: string[] = [];
  let previousHeading: { level: string; text: string } | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    
    if (headingMatch) {
      const level = headingMatch[1];
      const text = headingMatch[2].trim();
      
      // Check if this heading is a duplicate of the previous one
      if (previousHeading && 
          previousHeading.level === level && 
          previousHeading.text.toLowerCase() === text.toLowerCase()) {
        // This is a duplicate - skip it
        removedCount++;
        continue; // Skip this line
      }
      
      // Not a duplicate - keep it and update previous heading
      previousHeading = { level, text };
      fixedLines.push(line);
    } else {
      // Not a heading - reset previous heading tracking and keep the line
      // Only reset if this line has actual content (not just whitespace)
      if (line.trim().length > 0) {
        previousHeading = null;
      }
      fixedLines.push(line);
    }
  }
  
  fixed = fixedLines.join('\n');
  
  return fixed;
}

/**
 * Remove empty markdown tables
 * Detects and removes tables that have headers but no data rows
 * Also removes tables with only empty data rows (whitespace-only cells)
 * 
 * SCENARIOS HANDLED:
 * 1. Table with only header and separator (no data rows):
 *    | Service/Product Name | Description |
 *    |----------------------|-------------|
 *    -> REMOVED (empty table)
 * 
 * 2. Table with header, separator, and empty data rows:
 *    | Header | Header |
 *    |--------|--------|
 *    |       |        |
 *    -> REMOVED (empty data rows)
 * 
 * 3. Table with header, separator, and valid data:
 *    | Header | Header |
 *    |--------|--------|
 *    | Data 1 | Data 2 |
 *    -> KEPT (valid table)
 * 
 * CRITICAL: Prevents empty tables from appearing in published content
 */


/**
 * Remove "Article Title" labels and similar metadata text from content
 * Removes lines like "Article Title: ..." or "**Article Title.** ..." that shouldn't appear in published content
 * CRITICAL: Prevents metadata labels from appearing in the main content body
 */
export function removeArticleTitleLabels(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let removedCount = 0;
  
  // Patterns to match "Article Title" labels in various formats
  const articleTitlePatterns = [
    /^\s*\*\*Article Title[.:]\*\*\s*.+$/i,  // **Article Title.** or **Article Title:**
    /^\s*\*\*Article Title\*\*\s*[.:]\s*.+$/i,  // **Article Title** : or **Article Title** .
    /^\s*Article Title[.:]\s*.+$/i,  // Article Title: or Article Title.
    /^\s*\*\*Article Title\*\*\s*$/i,  // **Article Title** (standalone)
    /^\s*Article Title\s*$/i,  // Article Title (standalone)
  ];
  
  const lines = fixed.split('\n');
  const fixedLines = lines.filter((line, index) => {
    for (const pattern of articleTitlePatterns) {
      if (pattern.test(line.trim())) {
        removedCount++;
        return false; // Remove this line
      }
    }
    return true; // Keep this line
  });
  
  fixed = fixedLines.join('\n');
  
  return fixed;
}

