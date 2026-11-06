/**
 * Section Parser Utilities
 * 
 * Provides utilities to identify and extract specific sections from:
 * - Markdown documents (plans, drafts, final reports) by headers
 * - Blueprint JSON structures by agent IDs
 */

import { INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX } from "@/lib/content-generation/internal-link-placeholders";

export interface MarkdownSection {
  header: string;
  headerLevel: number;
  content: string;
  startLine: number;
  endLine: number;
  fullText: string; // Includes header + content
}

export interface BlueprintAgent {
  id: string;
  step: number;
  title: string;
  [key: string]: unknown;
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
 * Parse blueprint JSON and extract agents
 */
export function parseBlueprintAgents(blueprintJson: string): BlueprintAgent[] {
  try {
    const blueprint = JSON.parse(blueprintJson);
    if (blueprint.blueprintVersion === 2 && blueprint.flowFreeform?.sections && Array.isArray(blueprint.flowFreeform.sections)) {
      return blueprint.flowFreeform.sections.map((s: { id: string; h2Title: string; writerPrompt?: string; ragQuery?: string }, i: number) => ({
        id: s.id,
        step: i + 1,
        title: s.h2Title,
        description: s.writerPrompt ?? "",
        features: [],
        ragQuery: s.ragQuery,
      }));
    }
    if (blueprint.agents && Array.isArray(blueprint.agents)) {
      return blueprint.agents;
    }
    return [];
  } catch (error) {
    console.error('Failed to parse blueprint JSON:', error);
    return [];
  }
}

/**
 * Find agents by ID
 */
export function findAgentsById(
  agents: BlueprintAgent[],
  agentIds: string[]
): BlueprintAgent[] {
  const idSet = new Set(agentIds.map(id => id.toLowerCase()));
  return agents.filter(agent => 
    agent.id && idSet.has(agent.id.toLowerCase())
  );
}

/**
 * Extract agents with context (surrounding agents)
 */
export function extractAgentsWithContext(
  allAgents: BlueprintAgent[],
  targetAgents: BlueprintAgent[],
  contextBefore: number = 1,
  contextAfter: number = 1
): BlueprintAgent[] {
  const targetIndices = new Set(
    targetAgents.map(t => allAgents.findIndex(a => a.id === t.id && a.step === t.step))
  );

  const resultIndices = new Set<number>(targetIndices);

  // Add context indices
  targetIndices.forEach(targetIdx => {
    for (let i = 1; i <= contextBefore; i++) {
      const beforeIdx = targetIdx - i;
      if (beforeIdx >= 0) {
        resultIndices.add(beforeIdx);
      }
    }
    for (let i = 1; i <= contextAfter; i++) {
      const afterIdx = targetIdx + i;
      if (afterIdx < allAgents.length) {
        resultIndices.add(afterIdx);
      }
    }
  });

  return Array.from(resultIndices)
    .sort((a, b) => a - b)
    .map(idx => allAgents[idx])
    .filter(Boolean);
}

/**
 * Identify sections from checklist items
 * Extracts section references like [Section: ## Header] or [Agent: agent-id]
 * Also detects references to agents by title when adding new agents (e.g., "after intro agent")
 */
export function identifySectionsFromChecklist(
  checklist: string[],
  allSections?: MarkdownSection[],
  allAgents?: BlueprintAgent[]
): {
  markdownSections: MarkdownSection[];
  agentIds: string[];
  referencedAgentTitles: string[]; // For fuzzy matching when adding new agents
} {
  const markdownSections: MarkdownSection[] = [];
  const agentIds: string[] = [];
  const referencedAgentTitles: string[] = [];

  const sectionPattern = /\[Section:\s*(#{1,6}\s*)?(.+?)\]/gi;
  const agentPattern = /\[Agent:\s*(.+?)\]/gi;
  const headerPattern = /(?:^|\s)(#{1,6}\s+.+?)(?:\s|$)/g;
  
  // Pattern to detect agent references by title (e.g., "after intro agent", "before the conclusion agent")
  const agentTitlePattern = /(?:after|before|following|preceding|next to|near)\s+(?:the\s+)?(.+?)\s+agent/gi;

  checklist.forEach(item => {
    // Extract explicit section references
    let match;
    const sectionMatches: string[] = [];
    while ((match = sectionPattern.exec(item)) !== null) {
      const headerText = match[2].trim();
      sectionMatches.push(headerText);
      if (allSections) {
        const found = findSectionsByHeader(allSections, headerText, true);
        markdownSections.push(...found);
      }
    }

    // Extract explicit agent references
    const agentMatches: string[] = [];
    while ((match = agentPattern.exec(item)) !== null) {
      const agentId = match[1].trim();
      agentMatches.push(agentId);
      agentIds.push(agentId);
    }

        
    // Extract agent references by title (for adding new agents near existing ones)
    while ((match = agentTitlePattern.exec(item)) !== null) {
      const agentTitle = match[1].trim();
      referencedAgentTitles.push(agentTitle);
      
      // Try to find matching agent by title
      if (allAgents) {
        const matchingAgent = allAgents.find(a => 
          a.title && a.title.toLowerCase().includes(agentTitle.toLowerCase()) ||
          agentTitle.toLowerCase().includes(a.title?.toLowerCase() || '')
        );
        if (matchingAgent && !agentIds.includes(matchingAgent.id)) {
          agentIds.push(matchingAgent.id);
        }
      }
    }

    // Extract markdown headers directly in text
    while ((match = headerPattern.exec(item)) !== null) {
      const headerText = match[1].replace(/^#{1,6}\s+/, '').trim();
      if (allSections) {
        const found = findSectionsByHeader(allSections, headerText, true);
        markdownSections.push(...found);
      }
    }

    // Try to match section titles without explicit markers (semantic matching)
    if (allSections && markdownSections.length === 0) {
      // Look for common section-related keywords
      const keywords = item.toLowerCase();
      allSections.forEach(section => {
        const sectionLower = section.header.toLowerCase();
        // Check if any significant words from the item match the section header
        const itemWords = keywords.split(/\s+/).filter(w => w.length > 3);
        const sectionWords = sectionLower.split(/\s+/);
        
        if (itemWords.some(word => sectionWords.some(sw => sw.includes(word) || word.includes(sw)))) {
          if (!markdownSections.find(s => s.header === section.header && s.startLine === section.startLine)) {
            markdownSections.push(section);
          }
        }
      });
    }
  });

  // Remove duplicates
  const uniqueSections = markdownSections.filter((section, index, self) =>
    index === self.findIndex(s => s.header === section.header && s.startLine === section.startLine)
  );

  return {
    markdownSections: uniqueSections,
    agentIds: [...new Set(agentIds)],
    referencedAgentTitles: [...new Set(referencedAgentTitles)],
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
 * Validates and enforces mandatory [LINK] feature for all agents
 * This ensures every agent has 3-5 internal links as required
 */
export function validateAndEnforceLinkRequirement(agents: BlueprintAgent[]): BlueprintAgent[] {
  return agents.map(agent => {
    const features = Array.isArray(agent.features) ? agent.features : [];
    const hasLinkFeature = features.some((f: string) => 
      typeof f === 'string' && f.toLowerCase().trim().startsWith('[link]')
    );
    
    if (!hasLinkFeature) {
      const updatedFeatures = [...features, `[LINK]: ${INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX}`];
      console.warn(`Agent "${agent.title || agent.id}" was missing mandatory [LINK] feature. Added automatically.`);
      return {
        ...agent,
        features: updatedFeatures
      };
    }
    
    return agent;
  });
}

/**
 * Merge modified agents back into blueprint JSON
 */
export function mergeAgentsIntoBlueprint(
  originalBlueprintJson: string,
  modifiedAgents: BlueprintAgent[],
  originalAgents: BlueprintAgent[]
): string {
  try {
    const blueprint = JSON.parse(originalBlueprintJson);
    if (blueprint.blueprintVersion === 2 && blueprint.flowFreeform?.sections && Array.isArray(blueprint.flowFreeform.sections)) {
      const modifiedMap = new Map<string, BlueprintAgent>();
      modifiedAgents.forEach((a) => modifiedMap.set(a.id.toLowerCase(), a));
      blueprint.flowFreeform.sections = blueprint.flowFreeform.sections.map((s: { id: string; h2Title: string; ragQuery: string; writerPrompt: string }) => {
        const m = modifiedMap.get(s.id.toLowerCase());
        if (!m) return s;
        return {
          ...s,
          h2Title: m.title ?? s.h2Title,
          writerPrompt: typeof m.description === "string" ? m.description : s.writerPrompt,
          ragQuery: (m as { ragQuery?: string }).ragQuery ?? s.ragQuery,
        };
      });
      return JSON.stringify(blueprint, null, 2);
    }
    const modifiedMap = new Map<string, BlueprintAgent>();
    const blueprintIdSet = new Set([
      ...originalAgents.map(a => a.id.toLowerCase()),
      ...(blueprint.agents || []).map((a: BlueprintAgent) => a.id.toLowerCase())
    ]);
    
    // Separate modified agents into existing and new agents
    const existingAgents: BlueprintAgent[] = [];
    const newAgents: BlueprintAgent[] = [];
    
    modifiedAgents.forEach(agent => {
      const agentIdLower = agent.id.toLowerCase();
      modifiedMap.set(agentIdLower, agent);
      
      if (blueprintIdSet.has(agentIdLower)) {
        existingAgents.push(agent);
      } else {
        newAgents.push(agent);
      }
    });

    if (!blueprint.agents || !Array.isArray(blueprint.agents)) {
      // If no agents array exists, just use the modified agents
      // Validate and enforce link requirement
      blueprint.agents = validateAndEnforceLinkRequirement(modifiedAgents);
      return JSON.stringify(blueprint, null, 2);
    }

    // Step 1: Update existing agents
    const updatedAgents = blueprint.agents.map((agent: BlueprintAgent) => {
      const modified = modifiedMap.get(agent.id.toLowerCase());
      return modified || agent;
    });
    
    // Step 2: Add new agents in the correct position based on step number
    if (newAgents.length > 0) {
      console.log('Merging new agents:', newAgents.map(a => ({ id: a.id, step: a.step, title: a.title })));
      
      // Add new agents to the array
      updatedAgents.push(...newAgents);
      
      // Sort all agents by step number to ensure correct order
      updatedAgents.sort((a: BlueprintAgent, b: BlueprintAgent) => {
        const stepA = typeof a.step === 'number' ? a.step : 999;
        const stepB = typeof b.step === 'number' ? b.step : 999;
        return stepA - stepB;
      });
      
      // Re-number steps to ensure they're sequential (1, 2, 3, ...)
      updatedAgents.forEach((agent: BlueprintAgent, index: number) => {
        agent.step = index + 1;
      });
    }

    // Validate and enforce link requirement for all agents (MANDATORY)
    const validatedAgents = validateAndEnforceLinkRequirement(updatedAgents);
    blueprint.agents = validatedAgents;
    return JSON.stringify(blueprint, null, 2);
  } catch (error) {
    console.error('Failed to merge agents into blueprint:', error);
    return originalBlueprintJson;
  }
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

