import { INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX } from "@/lib/content-generation/internal-link-placeholders";
import {
  findSectionsByHeader,
  type MarkdownSection,
} from "./section-parser-markdown";

export interface BlueprintAgent {
  id: string;
  step: number;
  title: string;
  [key: string]: unknown;
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

