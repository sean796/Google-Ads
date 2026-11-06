import { streamChatCompletion, type Message } from './api';
import { getResearchModel } from "@/lib/optimization-settings-storage";

export interface KeywordExtractionResult {
  primaryKeywords: string[]; // One per blog idea
  relatedKeywords: string[][]; // Array of related keywords per blog idea
  topics: string[]; // Main topics extracted
  reasoning: string;
}

export interface ExtractKeywordsFromKBOptions {
  numberOfBlogs: number;
  flowPurpose?: string;
  entity?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

/**
 * Extracts relevant keywords from knowledge base content using AI
 * Similar to extractKeywordsFromBlueprint but optimized for knowledge base content
 */
export async function extractKeywordsFromKnowledgeBase(
  knowledgeBaseText: string,
  apiKey: string,
  options: ExtractKeywordsFromKBOptions
): Promise<KeywordExtractionResult> {
  const {
    numberOfBlogs,
    flowPurpose = '',
    entity,
    model = getResearchModel(),
    temperature = 0.7,
    maxTokens = 2000,
    topP = 0.9,
  } = options;

  if (!knowledgeBaseText || knowledgeBaseText.trim().length === 0) {
    throw new Error('Knowledge base text is required');
  }

  // Limit knowledge base text to prevent token limits (use first 5000 chars)
  const limitedKBText = knowledgeBaseText.length > 5000
    ? knowledgeBaseText.substring(0, 5000) + '\n\n[Knowledge base truncated for token optimization...]'
    : knowledgeBaseText;

  const systemPrompt = `You are an expert SEO keyword strategist specializing in extracting searchable, SEO-relevant keywords from content. Your role is to analyze knowledge base content and extract keywords that would be valuable for blog post generation.

Analyze the knowledge base content to identify:
1. PRIMARY keywords: ${numberOfBlogs} main keywords (one per blog idea) that represent the most important topics, services, or products
2. RELATED keywords: 5-10 related keywords per primary keyword (semantic variations, long-tail, related topics)
3. TOPICS: Main themes and topics present in the content

${entity ? `**ENTITY CONTEXT**: This content is for entity "${entity}". Prioritize keywords that include or relate to this location/entity when relevant.` : ''}

${flowPurpose ? `**FLOW PURPOSE**: "${flowPurpose}" - Ensure keywords align with this purpose.` : ''}

Return ONLY a valid JSON object with this structure:
{
  "primaryKeywords": ["keyword1", "keyword2", "keyword3", ...],
  "relatedKeywords": [
    ["related1 for keyword1", "related2 for keyword1", ...],
    ["related1 for keyword2", "related2 for keyword2", ...],
    ...
  ],
  "topics": ["topic1", "topic2", "topic3", ...],
  "reasoning": "Brief explanation of why these keywords were chosen"
}

CRITICAL REQUIREMENTS:
- Extract exactly ${numberOfBlogs} primary keywords (one per blog idea)
- Each primary keyword must have 5-10 related keywords
- Keywords must be searchable and SEO-relevant
- Include both head terms and long-tail variations
- Keywords should reflect user search intent (informational, commercial, transactional)
- ${entity ? `Prioritize local/location-based keywords when relevant to "${entity}"` : 'Focus on general service/product keywords'}
- Keywords must be directly derived from the knowledge base content`;

  const userPrompt = `Analyze this knowledge base content and extract keywords for ${numberOfBlogs} blog ideas:

${limitedKBText}

${entity ? `\n**ENTITY**: "${entity}" - Prioritize keywords that relate to this location/entity when relevant.` : ''}
${flowPurpose ? `\n**PURPOSE**: "${flowPurpose}" - Ensure keywords align with this purpose.` : ''}

Extract exactly ${numberOfBlogs} primary keywords (one per blog idea) and 5-10 related keywords for each primary keyword. Return the JSON object with primaryKeywords array, relatedKeywords array (one array per primary keyword), topics array, and reasoning.`;

  try {
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const streamResult = await streamChatCompletion({
      apiKey,
      model,
      messages,
      temperature,
      maxTokens,
      topP,
      onContentChunk: () => {}, // We'll use the returned content
    });

    // Parse JSON from response
    let jsonStr = streamResult.content.trim();
    
    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    
    // Try to find JSON object in the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const extractionResult = JSON.parse(jsonStr) as KeywordExtractionResult;
    
    // Validate result
    if (!Array.isArray(extractionResult.primaryKeywords) || 
        !Array.isArray(extractionResult.relatedKeywords) ||
        extractionResult.primaryKeywords.length !== numberOfBlogs) {
      throw new Error('Invalid keyword extraction result format');
    }

    // Ensure relatedKeywords array matches primaryKeywords length
    if (extractionResult.relatedKeywords.length !== numberOfBlogs) {
      // Pad or trim relatedKeywords array
      while (extractionResult.relatedKeywords.length < numberOfBlogs) {
        extractionResult.relatedKeywords.push([]);
      }
      extractionResult.relatedKeywords = extractionResult.relatedKeywords.slice(0, numberOfBlogs);
    }

    // Format keywords (clean and normalize)
    const formattedPrimary = extractionResult.primaryKeywords.map(kw => formatKeyword(kw));
    const formattedRelated = extractionResult.relatedKeywords.map(kwArray => 
      kwArray.map(kw => formatKeyword(kw)).filter(kw => kw.length > 0)
    );

    return {
      primaryKeywords: formattedPrimary,
      relatedKeywords: formattedRelated,
      topics: extractionResult.topics || [],
      reasoning: extractionResult.reasoning || 'Keywords extracted from knowledge base content',
    };
  } catch (error) {
    console.error('[KB Keyword Extractor] Error extracting keywords:', error);
    throw new Error(`Failed to extract keywords from knowledge base: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Formats keyword with proper capitalization
 */
function formatKeyword(keyword: string): string {
  if (!keyword || typeof keyword !== 'string') {
    return '';
  }

  // Remove placeholders
  let formatted = keyword
    .replace(/\[target entity\]/gi, '')
    .replace(/\[location\]/gi, '')
    .replace(/\[city\]/gi, '')
    .replace(/\[state\]/gi, '')
    .replace(/\[area\]/gi, '')
    .replace(/\[.*?\]/g, '')
    .trim();

  // Basic capitalization: capitalize first letter of each word
  formatted = formatted
    .split(' ')
    .map(word => {
      if (word.length === 0) return '';
      // Keep common lowercase words lowercase (a, an, the, of, in, etc.)
      const lowercaseWords = ['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by'];
      if (lowercaseWords.includes(word.toLowerCase()) && word !== formatted.split(' ')[0]) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  return formatted;
}

