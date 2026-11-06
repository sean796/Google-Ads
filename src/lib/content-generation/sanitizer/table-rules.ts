/** Markdown table cleanup before WordPress upload. */
/** Regex: markdown table separator row. Allows |---|, |----|, |---- (no trailing pipe), |:---|:---| */
const TABLE_SEPARATOR_ROW_REGEX = /^\s*\|[\s\-:]+\|?\s*$/;

export function removeEmptyTables(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let removedCount = 0;
  
  // Pattern to match markdown tables
  // A table consists of:
  // 1. Header row: | Header | Header |
  // 2. Separator row: |---|---| or |---- or |:---|---:|
  // 3. Data rows: | Data | Data | (optional, but required for valid table)
  
  const lines = fixed.split('\n');
  const fixedLines: string[] = [];
  let inTable = false;
  let tableStartIndex = -1;
  let tableLines: string[] = [];
  let dataRows: string[] = [];
  let hasSeparator = false;
  
  // Helper function to check if a table row is empty (only whitespace in cells)
  const isEmptyDataRow = (row: string): boolean => {
    // Remove leading/trailing pipes and split by pipe
    const cells = row.trim().split('|').map(cell => cell.trim()).filter(cell => cell.length > 0);
    // Check if all cells are empty or whitespace-only
    return cells.length === 0 || cells.every(cell => cell.trim().length === 0);
  };

  /** Normalize separator row to always end with pipe for consistent structure */
  const normalizeSeparatorLine = (raw: string): string => {
    const t = raw.trim();
    return t.endsWith('|') ? t : t + '|';
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|');
    const isSeparatorRow = TABLE_SEPARATOR_ROW_REGEX.test(line.trim());
    
    if (isTableRow && !isSeparatorRow) {
      // This is a table row (header or data)
      if (!inTable) {
        // Starting a new table
        inTable = true;
        tableStartIndex = i;
        tableLines = [line];
        dataRows = [];
        hasSeparator = false;
      } else {
        // Continuing existing table
        tableLines.push(line);
        // Check if this is a data row (we've seen separator, so this is data, not header)
        if (hasSeparator) {
          // We've seen header + separator, so this is a data row
          // Check if it's not empty
          if (!isEmptyDataRow(line)) {
            dataRows.push(line);
          }
        }
      }
    } else if (isSeparatorRow && inTable) {
      // This is the separator row (|---|---| or |----); normalize to end with pipe
      tableLines.push(normalizeSeparatorLine(line));
      hasSeparator = true;
    } else {
      // Not a table row - end current table if we're in one
      if (inTable) {
        // Check if table has valid data rows
        // A valid table should have: header + separator + at least one non-empty data row
        const hasValidDataRows = dataRows.length > 0;
        
        if (!hasValidDataRows && tableLines.length >= 2) {
          // Empty table (no data rows or only empty data rows) - remove it
          removedCount++;
          // Don't add these lines to fixedLines
        } else {
          // Valid table with data - keep it
          fixedLines.push(...tableLines);
        }
        // Reset table state
        inTable = false;
        tableStartIndex = -1;
        tableLines = [];
        dataRows = [];
        hasSeparator = false;
      }
      // Add the current non-table line
      fixedLines.push(line);
    }
  }
  
  // Handle table at end of content
  if (inTable) {
    const hasValidDataRows = dataRows.length > 0;
    if (!hasValidDataRows && tableLines.length >= 2) {
      // Empty table at end - remove it
      removedCount++;
    } else {
      // Valid table - keep it
      fixedLines.push(...tableLines);
    }
  }
  
  fixed = fixedLines.join('\n');
  
  return fixed;
}

/**
 * Remove link columns from tables
 * Detects tables with dedicated link columns (like "Relevant Internal Links", "Links", etc.)
 * and removes those columns entirely
 * CRITICAL: Links must be contextually integrated into content columns for better SEO, not in separate columns
 */
export function removeLinkColumnsFromTables(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let fixedCount = 0;
  
  // Patterns to match link column headers (case-insensitive)
  const linkColumnKeywords = [
    'relevant internal links',
    'relevant links',
    'internal links',
    'links',
    'link',
    'direct link',
    'view product',
    'related links',
    'product links',
    'service links',
  ];
  
  const lines = fixed.split('\n');
  const fixedLines: string[] = [];
  let inTable = false;
  let tableStartIndex = -1;
  let linkColumnIndex = -1;
  let headerCells: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|');
    const isSeparatorRow = /^\s*\|[\s\-:]+\|\s*$/.test(line.trim());
    
    if (isTableRow && !isSeparatorRow) {
      if (!inTable) {
        // Starting a new table - check header for link column
        inTable = true;
        tableStartIndex = i;
        linkColumnIndex = -1;
        
        // Parse header cells
        headerCells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
        
        // Check each cell to see if it's a link column
        for (let j = 0; j < headerCells.length; j++) {
          const cellLower = headerCells[j].toLowerCase();
          if (linkColumnKeywords.some(keyword => cellLower.includes(keyword))) {
            linkColumnIndex = j;
            fixedCount++;
            break;
          }
        }
        
        // If we found a link column, remove it from header
        if (linkColumnIndex >= 0) {
          const newHeaderCells = [...headerCells];
          newHeaderCells.splice(linkColumnIndex, 1);
          fixedLines.push('| ' + newHeaderCells.join(' | ') + ' |');
        } else {
          fixedLines.push(line);
        }
      } else {
        // Data row - remove link column if detected
        if (linkColumnIndex >= 0) {
          const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
          if (cells.length > linkColumnIndex) {
            const newCells = [...cells];
            newCells.splice(linkColumnIndex, 1);
            fixedLines.push('| ' + newCells.join(' | ') + ' |');
          } else {
            fixedLines.push(line);
          }
        } else {
          fixedLines.push(line);
        }
      }
    } else if (isSeparatorRow && inTable) {
      // Separator row - adjust for removed column
      if (linkColumnIndex >= 0) {
        const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
        if (cells.length > linkColumnIndex) {
          const newCells = [...cells];
          newCells.splice(linkColumnIndex, 1);
          const separator = '| ' + newCells.map(() => '---').join(' | ') + ' |';
          fixedLines.push(separator);
        } else {
          fixedLines.push(line);
        }
      } else {
        fixedLines.push(line);
      }
    } else {
      // Not a table row - end current table
      if (inTable) {
        inTable = false;
        linkColumnIndex = -1;
        headerCells = [];
      }
      fixedLines.push(line);
    }
  }
  
  // Handle table at end
  if (inTable) {
    inTable = false;
  }
  
  fixed = fixedLines.join('\n');
  
  return fixed;
}

/**
 * Fix malformed markdown table headers and rows
 * Removes leading periods, colons, or other characters before the first pipe in table rows
 * Normalizes separator rows and data rows that are missing a trailing pipe
 * Example: ". | Header | Header |" -> "| Header | Header |"
 * Example: ": | Header | Header |" -> "| Header | Header |"
 * CRITICAL: Markdown tables MUST start with | not . | or : |
 */
export function fixMalformedMarkdownTables(content: string): string {
  if (!content) return content;
  
  let fixed = content;
  let fixedCount = 0;
  
  // Split content into lines to process each line individually
  const lines = fixed.split('\n');
  let prevHeaderColCount: number | null = null;

  const fixedLines = lines.map((line, idx) => {
    const trimmed = line.trim();
    // Dashes-only line (no pipes): WRONG separator - replace with proper |---||---|
    const dashesOnly = /^[\s-]+$/.test(trimmed) && trimmed.replace(/\s/g, '').length >= 2;
    if (dashesOnly && prevHeaderColCount != null && prevHeaderColCount >= 1) {
      const properSeparator = '|' + '---|'.repeat(prevHeaderColCount);
      fixedCount++;
      prevHeaderColCount = null;
      return line.replace(trimmed, properSeparator);
    }
    if (!trimmed.includes('|')) {
      prevHeaderColCount = null;
      return line;
    }

    // Period inside separator cells: |.------ | -> |------ | (AI outputs period after pipe in separator)
    if (trimmed.includes('|.') && trimmed.includes('-') && /^\s*\|[\s\-.:|]+\|?\s*$/.test(trimmed)) {
      const fixed = trimmed.replace(/\|\./g, '|');
      if (fixed !== trimmed) {
        fixedCount++;
        return line.replace(trimmed, fixed);
      }
    }

    // Separator row: fix truncated form (e.g. |-- for 2-col table -> |---|---|)
    if (TABLE_SEPARATOR_ROW_REGEX.test(trimmed)) {
      const hyphenSegments = (trimmed.match(/-+/g) || []).length;
      const requiredCols = prevHeaderColCount ?? 2;
      if (hyphenSegments < requiredCols && prevHeaderColCount != null && prevHeaderColCount >= 1) {
        const properSeparator = '|' + '---|'.repeat(prevHeaderColCount);
        fixedCount++;
        prevHeaderColCount = null;
        return line.replace(trimmed, properSeparator);
      }
      prevHeaderColCount = null;
      if (!trimmed.endsWith('|')) {
        fixedCount++;
        return line.replace(trimmed, trimmed + '|');
      }
      return line;
    }

    // Track header column count for next line (separator fix)
    if (trimmed.startsWith('|') && trimmed.includes('|') && !TABLE_SEPARATOR_ROW_REGEX.test(trimmed)) {
      prevHeaderColCount = (trimmed.match(/\|/g) || []).length - 1;
    }

    // Row has pipes but missing leading | (e.g. "Question | Answer |" -> "| Question | Answer |")
    if (!trimmed.startsWith('|') && (trimmed.match(/\|/g) || []).length >= 2 && !TABLE_SEPARATOR_ROW_REGEX.test(trimmed)) {
      fixedCount++;
      const lead = (line.match(/^\s*/) || [''])[0];
      return lead + '| ' + trimmed;
    }

    // Table data/header row that starts with | and has at least one more | but no trailing pipe
    if (trimmed.startsWith('|') && trimmed.length > 1 && /\|/.test(trimmed.slice(1)) && !trimmed.endsWith('|')) {
      fixedCount++;
      return line.replace(trimmed, trimmed + '|');
    }

    // Check for malformed table row patterns (leading punctuation before first pipe)
    // Pattern 1: Leading period before pipe: ". |" or ".|"
    if (/^\s*\.\s*\|/.test(line)) {
      fixedCount++;
      const fixed = line.replace(/^\s*\.\s*\|/, '|');
      prevHeaderColCount = Math.max((fixed.match(/\|/g) || []).length - 1, 1);
      return fixed;
    }
    
    // Pattern 2: Leading colon before pipe: ": |" or ":|"
    if (/^\s*:\s*\|/.test(line)) {
      fixedCount++;
      const fixed = line.replace(/^\s*:\s*\|/, '|');
      prevHeaderColCount = Math.max((fixed.match(/\|/g) || []).length - 1, 1);
      return fixed;
    }
    
    // Pattern 3: Leading dash before pipe: "- |" or "-|"
    if (/^\s*-\s*\|/.test(line)) {
      fixedCount++;
      const fixed = line.replace(/^\s*-\s*\|/, '|');
      prevHeaderColCount = Math.max((fixed.match(/\|/g) || []).length - 1, 1);
      return fixed;
    }
    
    // Pattern 4: Leading plus before pipe: "+ |" or "+|"
    if (/^\s*\+\s*\|/.test(line)) {
      fixedCount++;
      const fixed = line.replace(/^\s*\+\s*\|/, '|');
      prevHeaderColCount = Math.max((fixed.match(/\|/g) || []).length - 1, 1);
      return fixed;
    }
    
    // Pattern 5: Any other single punctuation character before pipe
    if (/^\s*[.:\-+*]\s*\|/.test(line)) {
      fixedCount++;
      const fixed = line.replace(/^\s*[.:\-+*]\s*\|/, '|');
      prevHeaderColCount = Math.max((fixed.match(/\|/g) || []).length - 1, 1);
      return fixed;
    }
    
    return line;
  });
  
  fixed = fixedLines.join('\n');
  
  return fixed;
}

