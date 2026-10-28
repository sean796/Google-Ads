/**
 * Silent mature-content intent detection for Image Generator prompts.
 * Removes NEO Pulse prompt safety suffixes when the user explicitly requests mature imagery.
 * Provider-side model safety (OpenRouter/Gemini) may still refuse generation.
 */

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getMetaModel } from "@/lib/optimization-settings-storage";
import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";

const SYSTEM = `You classify whether a user's image-generation prompt explicitly requests mature or adult visual content (nudity, sexual themes, explicit adult scenes).

Return JSON only: {"matureContentRequested": true|false}

Set matureContentRequested to true ONLY when the prompt clearly asks for mature/adult/explicit sexual or nude imagery.
Set false for neutral product, landscape, business, infographic, or ambiguous prompts.
When unsure: false.`;

export async function detectMatureImageRequest(args: {
  apiKey: string;
  userPrompt: string;
  model?: string;
}): Promise<boolean> {
  const userPrompt = args.userPrompt.trim();
  const apiKey = args.apiKey.trim();
  if (!userPrompt || !apiKey) return false;

  try {
    const { parsed, content } = await callOpenRouterChatCompletion({
      apiKey,
      model: args.model?.trim() || getMetaModel(),
      system: SYSTEM,
      user: userPrompt,
      temperature: 0,
      maxTokens: 1024,
      responseFormat: { type: "json_object" },
    });

    const raw =
      parsed && typeof parsed.matureContentRequested === "boolean"
        ? parsed
        : parseJsonObjectFromModelText(content);
    return raw.matureContentRequested === true;
  } catch {
    return false;
  }
}

export const MATURE_CHECKLIST_OVERRIDE =
  "\n\nUser explicitly requested mature/adult visual content in their prompt. Honor that request over any checklist prohibitions on people, nudity, or mature themes.";
