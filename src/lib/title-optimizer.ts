import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import { TITLE_ANTI_CLICKBAIT_RULE, TITLE_KEYWORD_WEAVING_RULE, TITLE_CASE_RULE, TITLE_WELL_KNOWN_ACRONYMS_RULE, buildKeywordPunctuationPromptBlock } from "@/lib/prompt-builders";
import { truncateTitleForSEO } from "./content-generation/content-sanitizer";
import { cleanTitleForNonEntity } from "./content-optimization-helpers";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

/**
 * Generate an optimized SEO title from existing title and primary keyword.
 * Used when blueprint generation is skipped but title optimization is needed.
 */
export async function generateOptimizedTitle(
  existingTitle: string,
  primaryKeyword: string,
  siteId: string,
  entity?: string | 'N/A'
): Promise<string> {
  if (!existingTitle || !primaryKeyword) {
    return existingTitle || primaryKeyword;
  }

  try {
    const openRouterApiKey = loadApiKey();
    if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
      const fallbackTitle = truncateTitleForSEO(
        `${primaryKeyword} ${existingTitle}`.replace(/\s+/g, " ").trim(),
      );
      return fallbackTitle;
    }

    const researchModel = getResearchModel(siteId);
    
    await ensureMasterInstructionsInMemory(siteId);

    const isEntity = entity && entity !== 'N/A';
    const entityContext = isEntity 
      ? `*** ENTITY PAGE - NON-NEGOTIABLE ***
Target: ${entity}
RULE #1 - The word "near" MUST appear in the title. If your output does not contain "near", it is WRONG.
Example: "Blinds & Shades Near Ben Hill Atlanta". Keyword = service/product only. Never place entity before the service keyword.
${TITLE_KEYWORD_WEAVING_RULE}`
      : 'This is a general blog post. Do NOT include any location mentions.';

    const systemContent = appendMasterInstructionsToSystemPrompt(
      `You are an expert SEO title writer. Follow the user's title optimization instructions exactly. ${TITLE_CASE_RULE}`,
      siteId
    );

    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(openRouterApiKey),
      body: JSON.stringify({
        model: researchModel,
        messages: [
          { role: "system", content: systemContent },
          {
            role: "user",
            content: `Optimize this blog post title for SEO.

Existing Title: "${existingTitle}"
Primary Keyword: "${primaryKeyword}"
${buildKeywordPunctuationPromptBlock(primaryKeyword)}

${entityContext}

${isEntity ? 'OTHER requirements (AFTER satisfying "near"):' : 'Requirements:'}
- ${TITLE_CASE_RULE}
- Include the primary keyword naturally (same words and order; Title Case)
- ${TITLE_KEYWORD_WEAVING_RULE}
- ${TITLE_ANTI_CLICKBAIT_RULE}
- NO COLONS in this title. One flowing headline with natural connecting words - no topic-then-subtitle structure. This overrides any colon allowance above.
- Maximum 50 characters
- Short and concise
- Do NOT prepend business name, site name, or brand. No "Brand | Title", "Brand – Title", or distributor name before the topic - only the topic-focused title.
${isEntity ? '- The word "near" must appear. Do NOT use colons or "Your X Guide" instead of "near".' : ''}
- Neutral and useful, not clickbait or promotional hype
- ${TITLE_WELL_KNOWN_ACRONYMS_RULE}

Return ONLY the optimized title, nothing else. No quotes, no explanation.`
          },
        ],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const aiTitle = data.choices?.[0]?.message?.content?.trim() || '';

      if (aiTitle && aiTitle.length > 0) {
        // Remove quotes if present
        let cleanedTitle = aiTitle.replace(/^["']|["']$/g, '').trim();
        
        // Clean entity mentions if entity is N/A
        if (!entity || entity === 'N/A') {
          cleanedTitle = cleanTitleForNonEntity(cleanedTitle, 'N/A');
        } else if (!/near\s/i.test(cleanedTitle)) {
          // Entity page but AI omitted "near" - enforce it: [keyword] near [entity]
          const keywordOnly = primaryKeyword.replace(/\s+(in|near)\s+.*$/i, '').trim();
          cleanedTitle = `${keywordOnly} Near ${entity}`.replace(/\s+/g, ' ');
          cleanedTitle = truncateTitleForSEO(cleanedTitle);
        }
        
        // Enforce 50 character limit
        cleanedTitle = truncateTitleForSEO(cleanedTitle);

        if (cleanedTitle.length >= 10) {
          return cleanedTitle;
        }
      }
    }
  } catch (error) {
    console.warn('[Title Optimizer] Failed to generate optimized title via AI, using fallback:', error);
  }
  
  // Fallback: create keyword-based title
  if (entity && entity !== 'N/A') {
    const keywordOnly = primaryKeyword.replace(/\s+(in|near)\s+.*$/i, '').trim();
    return truncateTitleForSEO(`${keywordOnly} Near ${entity}`);
  }
  return truncateTitleForSEO(
    `${primaryKeyword} ${existingTitle}`.replace(/\s+/g, " ").trim(),
  );
}
