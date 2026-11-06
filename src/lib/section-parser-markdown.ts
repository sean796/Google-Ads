/**
 * Section Parser Utilities
 * 
 * Provides utilities to identify and extract specific sections from:
 * - Markdown documents (plans, drafts, final reports) by headers
 * - Blueprint JSON structures by agent IDs
 */

export interface MarkdownSection {
  header: string;
  headerLevel: number;
  content: string;
  startLine: number;
  endLine: number;
  fullText: string; // Includes header + content
}

export interface SectionContext {
  sections: MarkdownSection[];
  beforeContext?: MarkdownSection[];
  afterContext?: MarkdownSection[];
}


/**
 * Parse markdown document into sections by headers
 */
export function parseMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split('\n');
  const sections: MarkdownSection[] = [];
  let currentSection: MarkdownSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      // Save previous section if exists
      if (currentSection) {
        currentSection.endLine = i - 1;
        currentSection.content = lines
          .slice(currentSection.startLine + 1, currentSection.endLine + 1)
          .join('\n');
        currentSection.fullText = lines
          .slice(currentSection.startLine, currentSection.endLine + 1)
          .join('\n');
        sections.push(currentSection);
      }

      // Start new section
      const headerLevel = headerMatch[1].length;
      const headerText = headerMatch[2].trim();
      currentSection = {
        header: headerText,
        headerLevel,
        content: '',
        startLine: i,
        endLine: lines.length - 1, // Will be updated when next section found
        fullText: '',
      };
    }
  }

  // Add last section
  if (currentSection) {
    currentSection.endLine = lines.length - 1;
    currentSection.content = lines
      .slice(currentSection.startLine + 1, currentSection.endLine + 1)
      .join('\n');
    currentSection.fullText = lines
      .slice(currentSection.startLine, currentSection.endLine + 1)
      .join('\n');
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Find sections by header text (exact or fuzzy match)
 */
export function findSectionsByHeader(
  sections: MarkdownSection[],
  searchText: string,
  fuzzy: boolean = true
): MarkdownSection[] {
  const normalizedSearch = searchText.toLowerCase().trim();
  
  return sections.filter(section => {
    const normalizedHeader = section.header.toLowerCase();
    
    if (fuzzy) {
      // Fuzzy matching: check if search text appears in header or vice versa
      return normalizedHeader.includes(normalizedSearch) || 
             normalizedSearch.includes(normalizedHeader) ||
             // Check for semantic similarity (simple word matching)
             normalizedHeader.split(/\s+/).some(word => 
               normalizedSearch.split(/\s+/).some(searchWord => 
                 word.includes(searchWord) || searchWord.includes(word)
               )
             );
    } else {
      return normalizedHeader === normalizedSearch;
    }
  });
}

/**
 * Extract sections with context (surrounding sections)
 */
export function extractSectionsWithContext(
  allSections: MarkdownSection[],
  targetSections: MarkdownSection[],
  contextBefore: number = 1,
  contextAfter: number = 1
): SectionContext {
  const targetIndices = new Set(
    targetSections.map(s => allSections.findIndex(sec => sec.header === s.header && sec.startLine === s.startLine))
  );

  const beforeIndices: number[] = [];
  const afterIndices: number[] = [];

  // Find context sections
  targetIndices.forEach(targetIdx => {
    for (let i = 1; i <= contextBefore; i++) {
      const beforeIdx = targetIdx - i;
      if (beforeIdx >= 0 && !targetIndices.has(beforeIdx) && !beforeIndices.includes(beforeIdx)) {
        beforeIndices.push(beforeIdx);
      }
    }
    for (let i = 1; i <= contextAfter; i++) {
      const afterIdx = targetIdx + i;
      if (afterIdx < allSections.length && !targetIndices.has(afterIdx) && !afterIndices.includes(afterIdx)) {
        afterIndices.push(afterIdx);
      }
    }
  });

  const beforeContext = beforeIndices
    .sort((a, b) => a - b)
    .map(idx => allSections[idx])
    .filter(Boolean);

  const afterContext = afterIndices
    .sort((a, b) => a - b)
    .map(idx => allSections[idx])
    .filter(Boolean);

  return {
    sections: targetSections,
    beforeContext: beforeContext.length > 0 ? beforeContext : undefined,
    afterContext: afterContext.length > 0 ? afterContext : undefined,
  };
}

/**
 * Merge modified sections back into full markdown document
 */
export function mergeSectionsIntoMarkdown(
  originalMarkdown: string,
  modifiedSections: MarkdownSection[],
  originalSections: MarkdownSection[]
): string {
  const lines = originalMarkdown.split('\n');
  const modifiedMap = new Map<string, MarkdownSection>();
  
  // Create map of modified sections by header+startLine
  modifiedSections.forEach(section => {
    const key = `${section.header}:${section.startLine}`;
    modifiedMap.set(key, section);
  });

  // Build new document
  const newLines: string[] = [];
  let inModifiedSection = false;
  let currentModifiedSection: MarkdownSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const headerMatch = lines[i].match(/^(#{1,6})\s+(.+)$/);
    
    if (headerMatch) {
      const headerText = headerMatch[2].trim();
      // Check if this section was modified
      const originalSection = originalSections.find(s => 
        s.header === headerText && s.startLine === i
      );
      
      if (originalSection) {
        const key = `${originalSection.header}:${originalSection.startLine}`;
        const modified = modifiedMap.get(key);
        
        if (modified) {
          // Replace with modified section
          inModifiedSection = true;
          currentModifiedSection = modified;
          // Add modified section content
          newLines.push(...modified.fullText.split('\n'));
          // Skip original section lines
          i = originalSection.endLine;
          inModifiedSection = false;
          currentModifiedSection = null;
          continue;
        }
      }
    }

    // If we're not in a modified section, keep original line
    if (!inModifiedSection) {
      newLines.push(lines[i]);
    }
  }

  return newLines.join('\n');
}

/**
 * Validate that all original sections are present after merge
 */
export function validateSectionMerge(
  originalSections: MarkdownSection[],
  mergedMarkdown: string
): { valid: boolean; missing: string[] } {
  const mergedSections = parseMarkdownSections(mergedMarkdown);
  const mergedHeaders = new Set(mergedSections.map(s => s.header.toLowerCase()));
  
  const missing = originalSections
    .filter(s => !mergedHeaders.has(s.header.toLowerCase()))
    .map(s => s.header);

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Insert content into a specific section of markdown
 * @param markdown - The full markdown document
 * @param sectionHeader - The header text of the target section (exact or fuzzy match)
 * @param content - The content to insert (e.g., image markdown)
 * @param position - Where to insert: 'start' (after header) or 'end' (at end of section content)
 * @returns Updated markdown with content inserted
 */
export function insertContentIntoSection(
  markdown: string,
  sectionHeader: string,
  content: string,
  position: 'start' | 'end' = 'end'
): string {
  const sections = parseMarkdownSections(markdown);
  const lines = markdown.split('\n');
  
  console.log('Inserting content into section:', sectionHeader);
  console.log('Available sections:', sections.map(s => s.header));
  
  // Find the target section (fuzzy match)
  const targetSection = findSectionsByHeader(sections, sectionHeader, true)[0];
  
  if (!targetSection) {
    console.warn(`Section "${sectionHeader}" not found. Available sections:`, sections.map(s => s.header));
    throw new Error(`Section "${sectionHeader}" not found. Available sections: ${sections.map(s => s.header).join(', ')}`);
  }
  
  console.log('Found target section:', targetSection.header, 'at lines', targetSection.startLine, '-', targetSection.endLine);
  
  // Build new markdown
  const newLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    newLines.push(lines[i]);
    
    // Check if we're at the target section header
    if (i === targetSection.startLine) {
      if (position === 'start') {
        // Insert content right after the header
        newLines.push(''); // Add blank line
        newLines.push(content);
        newLines.push(''); // Add blank line after content
        console.log('Inserted content at start of section');
      }
    }
    
    // Check if we're at the end of the target section
    if (i === targetSection.endLine && position === 'end') {
      // Insert content at the end of the section (after the last line)
      newLines.push(''); // Add blank line
      newLines.push(content);
      console.log('Inserted content at end of section');
    }
  }
  
  const result = newLines.join('\n');
  console.log('Insertion complete. Original length:', markdown.length, 'New length:', result.length);
  
  return result;
}

