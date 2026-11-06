import { AgentConfig } from "@/types/agent-config";

/**
 * Parses markdown agent suggestions from AI responses
 * Expected format:
 * ### Agent Title
 * Description of what this agent does.
 * 
 * - [LIST]: List with bold labels about the topic
 * - [LINK]: 3-5 links to the topic
 * - [IMAGE]: An image prompt for LLMs
 * - [CUSTOM]: A custom agent feature for the topic
 * 
 * Note: FAQ features are NOT allowed in individual agents. FAQ should only appear as a separate agent at the end of the blog.
 */

interface ParsedAgent {
  title: string;
  description: string;
  features: string[];
}

/**
 * Extracts agent suggestions from markdown text
 */
export function parseAgentSuggestions(markdown: string): ParsedAgent[] {
  const agents: ParsedAgent[] = [];
  
  // Split by common separators (---, horizontal rules, or double newlines with headings)
  const sections = markdown.split(/(?:^|\n)---+|(?:^|\n)---\s*\n|(?:\n\n)(?=###)/);
  
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    
    // Look for H3 headings (### Title) or bold text (**Title**)
    const h3Match = trimmed.match(/^###\s+(.+?)(?:\n|$)/m);
    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*(?:\n|$)/m);
    
    const title = h3Match?.[1]?.trim() || boldMatch?.[1]?.trim();
    if (!title) continue;
    
    // Extract description - text after title until first bullet point or end
    const afterTitle = trimmed.replace(/^(?:###\s+.*?|\*\*.*?\*\*)\s*\n?/m, '');
    const descriptionMatch = afterTitle.match(/^(.+?)(?:\n\s*[-*]|$)/s);
    const description = descriptionMatch?.[1]?.trim() || afterTitle.split('\n')[0]?.trim() || '';
    
    // Extract features - look for bullet points with [TYPE]: format
    const featureMatches = trimmed.matchAll(/[-*]\s*\[([A-Z]+)\]:\s*(.+?)(?=\n[-*]|$)/g);
    const features: string[] = [];
    
    for (const match of featureMatches) {
      const featureType = match[1];
      const featureDesc = match[2]?.trim();
      if (featureType && featureDesc) {
        features.push(`[${featureType}]: ${featureDesc}`);
      }
    }
    
    // Also look for features without the [TYPE]: prefix but with brackets
    const altFeatureMatches = trimmed.matchAll(/[-*]\s*\[([A-Z]+)\]\s*[:-]?\s*(.+?)(?=\n[-*]|$)/g);
    for (const match of altFeatureMatches) {
      const featureType = match[1];
      const featureDesc = match[2]?.trim();
      if (featureType && featureDesc && !features.some(f => f.includes(`[${featureType}]`))) {
        features.push(`[${featureType}]: ${featureDesc}`);
      }
    }
    
    if (title && description) {
      agents.push({
        title,
        description,
        features: features.length > 0 ? features : []
      });
    }
  }
  
  return agents;
}

/**
 * Converts parsed agent to AgentConfig with default values
 */
export function parsedAgentToConfig(
  parsed: ParsedAgent,
  existingAgentsCount: number
): AgentConfig {
  return {
    id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    step: existingAgentsCount + 1,
    title: parsed.title,
    description: parsed.description,
    features: parsed.features,
    h2Count: 1,
    h3Count: 0,
    h3Enabled: false,
    headingLevel: 1,
    maxTokens: undefined,
  };
}

/**
 * Main function to extract and convert agent suggestions from AI response
 */
export function extractAgentsFromResponse(
  markdown: string,
  existingAgentsCount: number
): AgentConfig[] {
  const parsed = parseAgentSuggestions(markdown);
  return parsed.map(p => parsedAgentToConfig(p, existingAgentsCount));
}

