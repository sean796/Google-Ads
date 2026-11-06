/**
 * Prompt Modifier Interpreter
 * Interprets ACF prompt_modifier field instructions using AI to determine optimization actions
 */

import { logger } from "@/lib/logger";
import { loadApiKey, streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";

export interface PromptModifierInterpretation {
  shouldSkipOptimization: boolean;
  shouldAddImages: boolean;
  shouldSkipImages: boolean;
  modifierText: string;
  interpretedInstruction: string;
}

/**
 * Interprets the prompt_modifier ACF field using AI to determine actions
 * 
 * @param promptModifier - The text from the prompt_modifier ACF field
 * @param siteId - Optional site ID for model selection
 * @returns Interpretation result with actions to take
 */
export async function interpretPromptModifier(
  promptModifier: string | null | undefined,
  siteId?: string
): Promise<PromptModifierInterpretation> {
  // If blank or not present, proceed with full optimization
  if (!promptModifier || promptModifier.trim().length === 0) {
    return {
      shouldSkipOptimization: false,
      shouldAddImages: false,
      shouldSkipImages: false,
      modifierText: '',
      interpretedInstruction: 'No modifier specified - proceeding with full optimization'
    };
  }

  const trimmedModifier = promptModifier.trim();
  const apiKey = loadApiKey();
  
  if (!apiKey || apiKey.trim().length === 0) {
    logger.warn('[Prompt Modifier Interpreter] No API key available - proceeding with full optimization and passing modifier text through');
    return {
      shouldSkipOptimization: false,
      shouldAddImages: false,
      shouldSkipImages: false,
      modifierText: trimmedModifier,
      interpretedInstruction: 'API key not available - passing modifier text through to prompts'
    };
  }

  try {
    const researchModel = getResearchModel(siteId);
    
    const systemPrompt = `You are an instruction interpreter for content optimization. Analyze the user's instruction and determine what actions should be taken.

CRITICAL: You must return ONLY valid JSON with this exact structure:
{
  "shouldSkipOptimization": boolean,
  "shouldAddImages": boolean,
  "shouldSkipImages": boolean,
  "interpretedInstruction": "string explaining what you understood"
}

Interpretation rules:
- If instruction says "skip", "don't optimize", "skip optimization", "no optimization" → shouldSkipOptimization: true
- If instruction says "add an image", "add images", "include images", "add image", "include image" → shouldAddImages: true
- If instruction says "skip images", "no images", "don't add images", "no image", "skip image" → shouldSkipImages: true
- For other instructions (e.g., "focus on local SEO", "make it shorter", "emphasize benefits") → pass through as modifier text (all flags false)
- Multiple instructions can be combined (e.g., "skip images but optimize content" → shouldSkipImages: true, shouldSkipOptimization: false)

Return ONLY the JSON object, no other text.`;

    const userPrompt = `Analyze this instruction and return the JSON structure:
"${trimmedModifier}"

Determine:
1. Should optimization be skipped entirely? (true/false)
2. Should images be added? (true/false)
3. Should images be skipped? (true/false)
4. What did you understand from the instruction? (brief explanation)

Return ONLY valid JSON.`;

    let fullResponse = '';
    const result = await streamChatCompletion({
      apiKey,
      model: researchModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      maxTokens: 500,
      topP: 0.9,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      }
    });

    // Try to parse JSON from response
    let parsed: unknown = null;
    try {
      // Extract JSON from response (might have markdown code blocks)
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      logger.warn('[Prompt Modifier Interpreter] Failed to parse AI response as JSON, using fallback interpretation:', parseError);
      // Fallback: use simple keyword matching
      return interpretPromptModifierFallback(trimmedModifier);
    }

    // Validate and return parsed result
    const parsedObj = (parsed && typeof parsed === "object" ? parsed : {}) as {
      shouldSkipOptimization?: unknown;
      shouldAddImages?: unknown;
      shouldSkipImages?: unknown;
      interpretedInstruction?: string;
    };
    return {
      shouldSkipOptimization: Boolean(parsedObj.shouldSkipOptimization),
      shouldAddImages: Boolean(parsedObj.shouldAddImages),
      shouldSkipImages: Boolean(parsedObj.shouldSkipImages),
      modifierText: trimmedModifier,
      interpretedInstruction: parsedObj.interpretedInstruction || 'Interpreted instruction'
    };

  } catch (error) {
    logger.warn('[Prompt Modifier Interpreter] Error interpreting modifier with AI, using fallback:', error);
    // Fallback to simple keyword matching
    return interpretPromptModifierFallback(trimmedModifier);
  }
}

/**
 * Fallback interpretation using simple keyword matching
 * Used when AI interpretation fails
 */
function interpretPromptModifierFallback(modifierText: string): PromptModifierInterpretation {
  const lower = modifierText.toLowerCase();
  
  const shouldSkipOptimization = /\b(skip|don'?t optimize|no optimization|skip optimization)\b/i.test(lower);
  const shouldAddImages = /\b(add (an )?image|add images|include images?|include image)\b/i.test(lower);
  const shouldSkipImages = /\b(skip images?|no images?|don'?t add images?|skip image|no image)\b/i.test(lower);
  
  return {
    shouldSkipOptimization,
    shouldAddImages,
    shouldSkipImages,
    modifierText,
    interpretedInstruction: shouldSkipOptimization 
      ? 'Skipping optimization based on instruction'
      : shouldAddImages
      ? 'Adding images based on instruction'
      : shouldSkipImages
      ? 'Skipping images based on instruction'
      : 'Passing modifier text through to content generation'
  };
}
