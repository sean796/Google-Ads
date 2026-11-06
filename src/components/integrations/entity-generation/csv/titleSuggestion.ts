/**
 * Title Suggestion Module
 * Generates AI-suggested title templates for CSV generation
 */

import { loadApiKey, streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FAILED_TO_GENERATE_TITLE_SUGGESTION, NOTIFY_NO_ENTITIES_AVAILABLE_FOR_TITLE_SUGGESTI, NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_PLEASE_SE, NOTIFY_TITLE_TEMPLATE_SUGGESTED, notifyFailedToGenerateTitleSuggestionX } from "@/lib/notify-messages";
import { logger } from "@/lib/logger";
import type { WordPressSite } from "../../types";

/**
 * Generates an AI-suggested title template
 */
export async function generateAITitleSuggestion(
  entities: string[],
  site: WordPressSite
): Promise<string | null> {
  if (!entities || entities.length === 0) {
    notify.error(NOTIFY_NO_ENTITIES_AVAILABLE_FOR_TITLE_SUGGESTI);
    return null;
  }

  const apiKey = loadApiKey();
  if (!apiKey || !apiKey.trim()) {
    notify.error(NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_PLEASE_SE);
    return null;
  }

  const model = getResearchModel();
  const siteName = site.name || 'Service';
  const sampleEntities = entities.slice(0, 5).join(', ');
  
  const systemPrompt = `You are an expert SEO content strategist. Your task is to suggest an optimal title template for bulk blog post generation.

The title template should:
- Use variables: {entity}, {keyword}
- ALWAYS include the word "Near" before {entity}
- NEVER include the site/business name in the template
- Be SEO-friendly and natural
- Work well for local business content

Respond with ONLY the title template, nothing else. Do not include explanations, markdown, or code blocks.`;

  const userPrompt = `Generate a title template for local SEO blog posts.

Sample entities: ${sampleEntities}
Total entities: ${entities.length}

CRITICAL REQUIREMENTS:
1. MUST include "Near" before {entity} (e.g., "Near {entity}")
2. MUST NOT include the site/business name "${siteName}"
3. Can optionally use {keyword} variable
4. Must be optimized for local SEO

Examples of good templates:
- "{keyword} Near {entity}"
- "Services Near {entity}"
- "Near {entity}"

Generate the best title template (must include "Near" and must NOT include "${siteName}"):`;

  let suggestedTemplate = '';
  
  try {
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature: 0.7,
      maxTokens: 100,
      topP: 0.9,
      onContentChunk: (chunk) => {
        suggestedTemplate += chunk;
      }
    });

    // Clean up the response - remove markdown, quotes, etc.
    suggestedTemplate = suggestedTemplate
      .trim()
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/^```[\w]*\n?|\n?```$/g, '') // Remove code blocks
      .trim();

    if (suggestedTemplate) {
      notify.success(NOTIFY_TITLE_TEMPLATE_SUGGESTED);
      return suggestedTemplate;
    } else {
      notify.error(NOTIFY_FAILED_TO_GENERATE_TITLE_SUGGESTION);
      return null;
    }
  } catch (error) {
    logger.error('[Title Suggestion] Error:', error);
    notify.error(notifyFailedToGenerateTitleSuggestionX(error instanceof Error ? error.message : 'Unknown error'));
    return null;
  }
}
