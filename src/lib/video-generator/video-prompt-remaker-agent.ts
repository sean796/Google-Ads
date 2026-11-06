import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { PRODUCT_VISION_MODEL, VIDEO_PROMPT_REMAKER_PRO_MODEL } from "@/lib/video-generator/video-model-defaults";
import { getOpenRouterApiKeyForApp, resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";
import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";
import { hasNegativePeopleConstraint } from "./video-storyboard-agent";
import { videoLog, videoLogError, videoTimer } from "./video-log";

export type PromptRemakerInput = {
  apiKey?: string;
  siteId?: string | null;
  currentPrompt: string;
  instruction: string;
  sceneTitle?: string;
  sceneOrder?: number;
  negativeConstraints?: string;
  referencePhotoDataUrl?: string;
  referenceFileName?: string;
};

export type PromptRemakerResult = {
  revisedPrompt: string;
  changesSummary: string;
};

/**
 * Deduplicates repeated sentences or matching semantic clauses so prompts never repeat
 * boilerplate sentences like "Rigid architecture lock..." or "Background wall...".
 */
export function deduplicatePromptPhrases(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    const norm = capitalized.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!norm) continue;
    if (seen.has(norm)) continue;

    let isSub = false;
    for (const prev of seen) {
      if (prev.includes(norm) || (norm.length > 20 && prev.slice(0, 30) === norm.slice(0, 30))) {
        isSub = true;
        break;
      }
    }
    if (!isSub) {
      seen.add(norm);
      unique.push(capitalized);
    }
  }

  return unique.join(" ");
}

export function buildPromptRemakerSystemPrompt(): string {
  return `You are Gemini, an elite Hollywood AI Cinematographer and Director of Photography specializing in video diffusion models (Grok Imagine 1.5, Sora, Kling).
Your job is to COMPLETELY REWRITE and REMAKE a scene's camera and motion prompt based strictly on the director's new directions and reference photo.

CRITICAL RULES:
1. COMPLETE RECONSTRUCTION & ZERO CONTRADICTIONS:
   - ZERO DUPLICATION: You MUST NOT merely prepend, append, or paste the new instruction onto the old prompt.
   - You MUST REWRITE the final prompt from scratch into a fresh, unified cinematic direction.
   - Actively PURGE and DELETE any previous camera motions, angles, or focal objects that conflict with or are superseded by the new instruction.
   - Never output repeated phrases or duplicate sentences.
   - The new client/director instruction is the ABSOLUTE SOURCE OF TRUTH.

2. STRICT DIRECTIONAL PRECISION:
   - Pay exact attention to directional cues:
     * If ordered "pan right to left", "swing left", or "stay in the hallway": The camera MUST pan steadily from right to left, sweeping/swinging left along the hallway corridor. You MUST explicitly eliminate any old motion (like panning left to right).
     * If ordered "avoid door moving", "door stationary", or "stationary display board": Explicitly lock those elements: "The doorway and display board remain rigidly stationary."

3. STRICT 45 TO 80 WORD BUDGET:
   - Output must be between 45 and 65 words (never exceed 80 words).
   - Video diffusion models severely degrade, hallucinate, and freeze when fed bloated 100+ word prompts. Keep the prompt dense, vivid, and physically grounded.

4. RIGID ARCHITECTURE & ZERO-MORPHING LOCK:
   - Include the invariant clause exactly once: "Rigid architecture lock: zero morphing, stationary walls, cabinetry, and fixtures."

5. ZERO HUMANS (NEGATIVE CONSTRAINT ENFORCEMENT):
   - Include the invariant clause exactly once: "Empty room with zero people throughout."

6. CLIENT REFERENCE PHOTO & BACKGROUND WALL MATCHING:
   - When a client reference photo is attached and the client asks to match the wall or architecture behind the stationary display board:
   - You MUST incorporate the wall details: "Background wall and architecture strictly match the attached client reference photo behind the stationary display board."

Output format: Return ONLY a valid JSON object with NO markdown fences:
{
  "revisedPrompt": "45-65 word completely remade cinematic prompt incorporating the new instruction without obsolete camera moves.",
  "changesSummary": "Concise 1-sentence note of what obsolete elements were removed and what new trajectory was established."
}`;
}

/**
 * Fallback synthesizer if LLM calls fail.
 * Completely reconstructs a fresh 45-60 word prompt around the new instruction,
 * eliminating obsolete camera movements rather than naively prepending.
 */
export function fallbackHarmonizePrompt(
  currentPrompt: string,
  instruction: string,
  hasReferencePhoto?: boolean,
): PromptRemakerResult {
  const cleanInst = instruction.trim();
  if (!cleanInst) {
    return { revisedPrompt: currentPrompt.trim(), changesSummary: "No new instruction provided." };
  }

  const noPeople = hasNegativePeopleConstraint(`${currentPrompt} ${cleanInst}`);

  // Directional analysis
  const isRightToLeft = /pan\s+(?:from\s+)?right\s+to\s+left|right\s+to\s+left|swing\s+left/i.test(cleanInst);
  const isLeftToRight = /pan\s+(?:from\s+)?left\s+to\s+right|left\s+to\s+right/i.test(cleanInst);
  const isPanLeft = /pan(?:s|ning)?\s+(?:to\s+)?(?:the\s+)?left/i.test(cleanInst);
  const isPanRight = /pan(?:s|ning)?\s+(?:to\s+)?(?:the\s+)?right/i.test(cleanInst);
  const isStayHallway = /hall\s*way/i.test(cleanInst);
  const hasDoor = /door/i.test(cleanInst);

  let cameraMove = "";
  if (isRightToLeft) {
    cameraMove = isStayHallway
      ? "Camera performs a steady pan right to left through the hallway corridor, swinging left smoothly."
      : "Camera performs a steady pan right to left in a single continuous take, swinging left smoothly.";
  } else if (isLeftToRight) {
    cameraMove = "Camera performs a steady pan left to right in a smooth continuous take.";
  } else if (isPanLeft) {
    cameraMove = "Camera performs a smooth pan left in a single continuous take through the showroom.";
  } else if (isPanRight) {
    cameraMove = "Camera performs a smooth pan right in a single continuous take through the showroom.";
  } else if (/fly\s*through/i.test(cleanInst)) {
    cameraMove = "Camera performs one continuous slow forward fly through to the desk in the background.";
  } else {
    cameraMove = "Camera glides smoothly in a single continuous take through the showroom.";
  }

  const stationarySnippet = hasDoor
    ? "The glass doorway and display board remain rigidly stationary with zero movement."
    : "The display board remains rigidly stationary with zero movement.";

  const matchWall = hasReferencePhoto || /wall|behind|backdrop|reference|photo|board/i.test(cleanInst);
  const wallSnippet = matchWall
    ? "Background wall and architecture strictly match the attached client reference photo behind the stationary display board."
    : "";

  const lockSnippet = "Rigid architecture lock: zero morphing, stationary walls, cabinetry, and fixtures.";
  const peopleSnippet = noPeople ? "Empty room with zero people throughout." : "";

  // Combine clauses
  const combined = [cameraMove, stationarySnippet, wallSnippet, lockSnippet, peopleSnippet]
    .filter(Boolean)
    .join(" ");

  const deduplicated = deduplicatePromptPhrases(combined);
  const words = deduplicated.split(/\s+/);

  let finalPrompt = deduplicated;
  if (words.length > 70) {
    finalPrompt = `${words.slice(0, 48).join(" ")}. ${lockSnippet} ${peopleSnippet}`.replace(/\s+/g, " ").trim();
    finalPrompt = deduplicatePromptPhrases(finalPrompt);
  }

  return {
    revisedPrompt: finalPrompt,
    changesSummary: `Gemini Cinematographer remade prompt around director instruction (${words.length} words), establishing ${isRightToLeft ? "right-to-left" : "updated"} trajectory and locking architecture.`,
  };
}

/**
 * AI Cinematographer Prompt Remaker:
 * Dedicated Gemini Agent (google/gemini-2.5-flash) takes the current video prompt and user revision instruction,
 * resolves all conflicts, eliminates obsolete directions, grounds to reference photos, and writes a crisp 45-65 word prompt.
 */
export async function reviseScenePromptWithAi(args: PromptRemakerInput): Promise<PromptRemakerResult> {
  const cleanInst = args.instruction.trim();
  if (!cleanInst) {
    return { revisedPrompt: args.currentPrompt.trim(), changesSummary: "No revision instruction specified." };
  }

  const elapsed = videoTimer();
  const hasRefPhoto = Boolean(
    args.referencePhotoDataUrl &&
      (args.referencePhotoDataUrl.startsWith("data:image/") || args.referencePhotoDataUrl.startsWith("http")),
  );

  videoLog("cinematographer", `Gemini agent remaking prompt for scene ${args.sceneOrder ?? "active"}`, {
    sceneTitle: args.sceneTitle,
    instructionLength: cleanInst.length,
    currentPromptLength: args.currentPrompt.length,
    hasReferencePhoto: hasRefPhoto,
  });

  const userPromptText = `Scene: ${args.sceneOrder ? `Scene ${args.sceneOrder}: ` : ""}${args.sceneTitle || "Current Scene"}
Current Video Prompt:
"""
${args.currentPrompt.trim()}
"""

New Director Revision Instruction (Absolute Source of Truth):
"""
${cleanInst}
"""
${hasRefPhoto ? `Client Reference Photo Attached: "${args.referenceFileName ?? "reference image"}". Analyze the attached image and explicitly incorporate the background wall/materials behind the stationary display board.` : ""}
${args.negativeConstraints ? `Negative Constraints: ${args.negativeConstraints}` : ""}

Gemini Agent Task:
Completely rewrite the video prompt from scratch into a unified 45-65 word direction.
DO NOT concatenate or append old text. Purge obsolete or contradictory camera moves.
Follow all directional commands (e.g. pan right to left, swing left, stay in hallway, door stationary).
Strictly match background wall to reference photo behind the stationary display board.
Lock architecture (zero morphing) and enforce zero people throughout.
Keep strictly within 45 to 65 words.
Return ONLY valid JSON.`;

  const userContent = hasRefPhoto
    ? [
        { type: "text" as const, text: userPromptText },
        { type: "image_url" as const, image_url: { url: args.referencePhotoDataUrl! } },
      ]
    : userPromptText;

  let rawContent = "";

  // Resolve API key asynchronously
  let apiKey = args.apiKey?.trim() || getOpenRouterApiKeyForApp();
  if (!apiKey) {
    try {
      apiKey = (await resolveOpenRouterApiKeyForHarness()) || "";
    } catch {
      /* ignore */
    }
  }

  // 1. Primary AI Call: Dedicated Gemini Agent (google/gemini-2.5-flash)
  try {
    const res = await postOpenRouterAppChat({
      apiKey,
      model: PRODUCT_VISION_MODEL,
      messages: [
        { role: "system", content: buildPromptRemakerSystemPrompt() },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      maxTokens: 600,
      responseFormat: { type: "json_object" },
    });
    rawContent = res.content || "";
  } catch (geminiErr) {
    videoLogError("cinematographer", "primary Gemini 2.5 Flash agent call failed, attempting fallback Gemini 2.5 Pro", geminiErr);
    // 2. High-Capacity Gemini Fallback: google/gemini-2.5-pro
    try {
      const resPro = await postOpenRouterAppChat({
        apiKey,
        model: VIDEO_PROMPT_REMAKER_PRO_MODEL,
        messages: [
          { role: "system", content: buildPromptRemakerSystemPrompt() },
          { role: "user", content: userContent },
        ],
        temperature: 0.2,
        maxTokens: 600,
        responseFormat: { type: "json_object" },
      });
      rawContent = resPro.content || "";
    } catch (proErr) {
      videoLogError("cinematographer", "gemini-2.5-pro fallback failed, attempting research category agent", proErr);
      // 3. Fallback to category research
      try {
        const resCat = await callAgentCategoryOpenRouterChat({
          category: "research",
          siteId: args.siteId,
          apiKey,
          messages: [
            { role: "system", content: buildPromptRemakerSystemPrompt() },
            { role: "user", content: userContent },
          ],
          temperature: 0.2,
          maxTokens: 600,
        });
        rawContent = resCat.content || "";
      } catch (catErr) {
        videoLogError("cinematographer", "all OpenRouter model attempts failed, falling back to local harmonizer", catErr);
      }
    }
  }

  // Multi-Stage Extraction from AI Output
  if (rawContent.trim()) {
    let revisedPrompt = "";
    let changesSummary = "";

    try {
      const parsed = parseJsonObjectFromModelText(rawContent);
      revisedPrompt = String(parsed.revisedPrompt || parsed.videoPrompt || parsed.prompt || "").trim();
      changesSummary = String(parsed.changesSummary || parsed.summary || "").trim();
    } catch {
      // not strict JSON, attempt regex or clean extraction below
    }

    if (!revisedPrompt) {
      const match = rawContent.match(/"revisedPrompt"\s*:\s*"([^"]+)"/i) ||
                    rawContent.match(/(?:Revised Prompt|Final Prompt|Cinematic Prompt):\s*"?([^"\n\r]+)"?/i);
      if (match && match[1]?.trim()) {
        revisedPrompt = match[1].trim();
      }
    }

    if (!revisedPrompt) {
      const cleanText = rawContent
        .replace(/^```[a-z]*\s*/i, "")
        .replace(/```\s*$/i, "")
        .replace(/^Here (?:is|are) [^:\n]+:\s*/i, "")
        .trim();
      const words = cleanText.split(/\s+/);
      if (words.length >= 15 && words.length <= 100) {
        revisedPrompt = cleanText;
      }
    }

    if (revisedPrompt) {
      // Deduplicate any repeated sentences
      revisedPrompt = deduplicatePromptPhrases(revisedPrompt);

      const fullText = `${args.currentPrompt} ${cleanInst} ${args.negativeConstraints || ""}`;
      if (hasNegativePeopleConstraint(fullText)) {
        if (!revisedPrompt.toLowerCase().includes("zero people") && !revisedPrompt.toLowerCase().includes("no people") && !revisedPrompt.toLowerCase().includes("zero humans")) {
          revisedPrompt = `${revisedPrompt} Empty room with zero people throughout.`.trim();
        }
      }

      const wordCount = revisedPrompt.split(/\s+/).length;
      videoLog("cinematographer", `Gemini prompt remake completed in ${elapsed()}s`, {
        wordCount,
        changesSummary: changesSummary || "Gemini AI Cinematographer restructured scene direction.",
        revisedPrompt,
      });

      return {
        revisedPrompt,
        changesSummary: changesSummary || "Gemini AI Cinematographer reconstructed the prompt into a unified direction.",
      };
    }
  }

  videoLogError("cinematographer", "Gemini prompt remaker returned unparseable content, using fallback harmonizer", rawContent);
  return fallbackHarmonizePrompt(args.currentPrompt, cleanInst, hasRefPhoto);
}
