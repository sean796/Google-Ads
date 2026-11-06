import { AgentConfig } from "@/types/agent-config";

export interface VideoScriptChecklistContext {
  flowTitle?: string;
  flowPurpose?: string;
  agents?: AgentConfig[];
  finalOutput?: string;
  selectedSection?: {
    header: string;
    content: string;
    fullText: string;
  };
  userPrompt?: string;
  includeOnScreenText: boolean;
  includeBrollNotes: boolean;
  includeVoiceoverOnlyScenes: boolean;
  targetDuration: '30-45s' | '45-60s' | '60-90s';
  platformStyle: 'short-vertical';
}

export interface VideoScriptChecklistItem {
  title: string;
  description: string;
  sceneType?: string;
  estDurationSeconds?: number;
}

/**
 * Cleans content by removing links and code blocks, keeping only the actual text content
 */
const cleanContentForVideoScript = (content: string): string => {
  let cleaned = content;
  
  // Remove markdown code blocks (```code```)
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  
  // Remove inline code (`code`)
  cleaned = cleaned.replace(/`[^`]+`/g, '');
  
  // Remove markdown links [text](url) - keep only the text part
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  // Remove plain URLs (http://, https://)
  cleaned = cleaned.replace(/https?:\/\/[^\s)]+/g, '');
  
  // Remove markdown headers (already being removed, but ensure consistency)
  cleaned = cleaned.replace(/#{1,6}\s+/g, '');
  
  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  
  return cleaned;
};

/**
 * Builds a system prompt for video script checklist generation
 */
export const buildVideoScriptChecklistSystemPrompt = (
  flowTitle: string,
  flowPurpose: string,
  finalOutput?: string,
  selectedSection?: {
    header: string;
    content: string;
    fullText: string;
  },
  userPrompt?: string,
  targetDuration: '30-45s' | '45-60s' | '60-90s' = '60-90s',
  platformStyle: 'short-vertical' = 'short-vertical'
): string => {
  let contentContext = "";
  
  if (selectedSection) {
    let sectionContent = selectedSection.fullText;
    sectionContent = cleanContentForVideoScript(sectionContent);
    
    const sectionForAnalysis = sectionContent.length > 3000 
      ? sectionContent.substring(0, 3000) + '...\n[Content continues but truncated for length]'
      : sectionContent;
    
    contentContext = `\n\n=== CRITICAL: SECTION-BASED VIDEO SCRIPT ===
This video script MUST be based specifically and exclusively on the "${selectedSection.header}" section from the report.

FULL SECTION CONTENT FOR ANALYSIS:
${sectionForAnalysis}`;
  } else if (finalOutput) {
    const cleanedOutput = cleanContentForVideoScript(finalOutput);
    
    const outputForAnalysis = cleanedOutput.length > 2000 
      ? cleanedOutput.substring(0, 2000) + '...\n[Content continues but truncated for length]'
      : cleanedOutput;
    
    if (outputForAnalysis.trim().length > 0) {
      contentContext = `\n\n=== VIDEO SCRIPT FOR SHORT-FORM VERTICAL CONTENT ===
This video script will be used to create a ${targetDuration} short-form vertical video (TikTok/Reels/Shorts style) based on the full blueprint content.

FULL BLUEPRINT CONTENT FOR ANALYSIS:
${outputForAnalysis}

IMPORTANT: Analyze the ENTIRE blueprint content to understand the main theme, key topics, concepts, and overall message. The video script should break down the content into engaging scenes optimized for short-form vertical video consumption.`;
    }
  }
  
  const durationGuidance = {
    '30-45s': '30-45 seconds (very fast-paced, hook-heavy, single key point)',
    '45-60s': '45-60 seconds (balanced pacing, 2-3 key points)',
    '60-90s': '60-90 seconds (more detailed, can cover multiple points)'
  };
  
  return `You are an expert AI video script strategist specializing in short-form vertical content (TikTok/Reels/Shorts). Your role is to analyze content requirements and create a HIGHLY DETAILED, COMPREHENSIVE checklist for generating a video script that can be used in Descript or similar AI video platforms.

Flow Context:
- Title: ${flowTitle || "Untitled"}
- Purpose: ${flowPurpose || "Not specified"}
- Target Duration: ${durationGuidance[targetDuration]}
- Platform: ${platformStyle === 'short-vertical' ? 'Short-form vertical (TikTok/Reels/Shorts)' : 'Short-form vertical'}${contentContext}

Your task is to:
1. ${selectedSection ? `CAREFULLY ANALYZE the "${selectedSection.header}" section content above and DESCRIBE IN EXTREME DETAIL what this section contains, its structure, key elements, concepts, and every significant aspect that should be communicated in the video.` : 'CAREFULLY ANALYZE the full blueprint content above and DESCRIBE IN EXTREME DETAIL the main theme, key topics, concepts, and overall message. This is for a short-form vertical video, so analyze what would best represent the content in an engaging, scroll-stopping format.'}
2. Create a HIGHLY DETAILED checklist that ${selectedSection ? `describes the section's content in COMPREHENSIVE detail and ` : 'describes the blueprint content in COMPREHENSIVE detail and '}specifies video script requirements with PRECISION
3. Ensure the checklist respects user preferences (what to include/exclude) and is EXPLICIT about each requirement
4. Make the checklist SPECIFIC, ACTIONABLE, and DETAILED for video script generation - include scene structure, voiceover focus, on-screen text ideas, B-roll suggestions, pacing notes, and timing guidance
5. Focus on DETAILED scene breakdowns, talking points, visual elements, and script structure
${selectedSection ? `6. CRITICAL: Each checklist item must be HIGHLY DETAILED and describe SPECIFIC aspects of the "${selectedSection.header}" section content. The checklist must detail EXACTLY what should be communicated in each scene, with specific talking points, visual cues, and script elements.` : '6. CRITICAL: Each checklist item must be HIGHLY DETAILED with specific scene descriptions, talking points, visual elements, and explicit requirements.'}
7. The checklist must be from the perspective of planning each scene for the video script, not "I will do this"...

${selectedSection ? `IMPORTANT: The checklist must describe the section's content in COMPREHENSIVE DETAIL. For example, if the section contains a table, describe EXACTLY what key points from the table should be communicated, how they should be presented visually, what the voiceover should say, and how it relates to other scenes. If it contains specific concepts or data, describe those EXPLICITLY with full detail for the video script.` : 'IMPORTANT: The checklist must be HIGHLY DETAILED with specific scene descriptions, talking points, visual elements, pacing notes, and explicit requirements for every aspect of the video script.'}

CRITICAL FORMAT REQUIREMENT:
Format your response EXACTLY as follows - each checklist item must have:
1. A clear, descriptive title (like "Scene 1: Hook - Problem Statement" or "Scene 2: Value Proposition - Key Benefits")
2. A detailed description starting with "I'm currently..." or "I'm now..." that explains what scene you're planning, what talking points it should include, what visuals/B-roll would work, and how it fits into the overall video flow

Each scene should include:
- Hook/opening (first 3-5 seconds)
- Main talking points (what the voiceover should say)
- Visual suggestions (on-screen text, B-roll ideas, graphics)
- Transition notes (how it flows to the next scene)
- Rough timing estimate

Example format:
Scene 1: Hook - Problem Statement

I'm currently planning the opening hook that needs to grab attention in the first 3 seconds. This scene should start with a bold statement about the problem, use on-screen text to emphasize key words, and include quick cuts of relatable visuals that show the problem in action. The voiceover should be direct and punchy, setting up the value proposition that follows.

Scene 2: Value Proposition - Key Benefits

I'm now structuring the main value scene where we explain the solution. This should include 2-3 key benefits, each with a visual representation (B-roll or graphics), and on-screen text overlays that reinforce the voiceover. The pacing should be energetic but clear, allowing viewers to absorb each benefit before moving to the next.

Each item should be separated by a blank line. Use this format for ALL checklist items.`;
};

/**
 * Builds a user prompt for video script checklist generation
 */
export const buildVideoScriptChecklistUserPrompt = (
  context: VideoScriptChecklistContext
): string => {
  const parts: string[] = [];
  
  if (context.selectedSection) {
    parts.push(`Generate a HIGHLY DETAILED, COMPREHENSIVE checklist for creating a video script based specifically on the "${context.selectedSection.header}" section from the report.`);
    parts.push(`\nCRITICAL REQUIREMENTS (ALL CHECKLISTS MUST BE HIGHLY DETAILED):`);
    parts.push(`1. The checklist MUST describe the "${context.selectedSection.header}" section's content in EXTREME DETAIL with specific scene breakdowns`);
    parts.push(`2. Analyze IN DETAIL what the section contains: its structure, key concepts, data points, visual elements, tables, lists, or any specific information - describe each element explicitly for video format`);
    parts.push(`3. Each checklist item must be HIGHLY DETAILED and specify EXACTLY what should be communicated in each scene, including voiceover talking points, visual suggestions, B-roll ideas, on-screen text, pacing, and timing`);
    parts.push(`4. If the section contains tables, describe IN DETAIL what key points from the table should be communicated, how they should be presented visually, and what the voiceover should say`);
    parts.push(`5. If the section contains lists, describe IN DETAIL how each list item should be presented in the video, what visuals would work, and how to structure the talking points`);
    parts.push(`6. If the section contains data or statistics, describe IN DETAIL how those should be communicated visually, including suggested graphics, charts, or visual representations`);
    parts.push(`7. The checklist must be HIGHLY SPECIFIC to the content of the "${context.selectedSection.header}" section with detailed scene descriptions\n`);
  } else {
    parts.push("Generate a HIGHLY DETAILED, COMPREHENSIVE checklist for creating a SHORT-FORM VERTICAL VIDEO SCRIPT based on the full blueprint content:\n");
    parts.push(`\nCRITICAL REQUIREMENTS (SHORT-FORM VERTICAL VIDEO):`);
    parts.push(`1. This is a SHORT-FORM VERTICAL VIDEO (${context.targetDuration}) optimized for TikTok/Reels/Shorts - analyze the full blueprint to understand the main theme, key topics, and overall message`);
    parts.push(`2. The video script should break down the content into engaging, scroll-stopping scenes optimized for short attention spans`);
    parts.push(`3. Think about what would make an effective short-form video - it should be visually compelling, communicate the content's purpose quickly, and keep viewers engaged`);
    parts.push(`4. The checklist must be HIGHLY DETAILED with specific scene descriptions, talking points, visual elements, and explicit requirements for every aspect of the video script`);
    parts.push(`5. Describe how the video should communicate the blueprint's main ideas, themes, and key concepts in an engaging, digestible format\n`);
  }
  
  if (context.userPrompt && context.userPrompt.trim()) {
    parts.push(`User's video preferences: ${context.userPrompt.trim()}`);
  }
  
  parts.push("\nVideo script preferences:");
  if (context.includeOnScreenText) {
    parts.push("- MUST include on-screen text overlays (subtitles, key words, callouts)");
  } else {
    parts.push("- MUST NOT include on-screen text overlays (voiceover only)");
  }
  
  if (context.includeBrollNotes) {
    parts.push("- MUST include B-roll and visual suggestions for each scene");
  } else {
    parts.push("- Focus on voiceover script only, minimal visual notes");
  }
  
  if (context.includeVoiceoverOnlyScenes) {
    parts.push("- Can include scenes that are voiceover-only (no complex visuals needed)");
  } else {
    parts.push("- Every scene should have visual elements or B-roll suggestions");
  }
  
  parts.push(`\nTarget Duration: ${context.targetDuration}`);
  parts.push(`Platform: ${context.platformStyle === 'short-vertical' ? 'Short-form vertical (TikTok/Reels/Shorts)' : 'Short-form vertical'}`);
  
  if (context.selectedSection) {
    parts.push(`\nGenerate a HIGHLY DETAILED checklist with at least 5-7 comprehensive, specific, actionable scenes that:`);
    parts.push(`- Describe IN EXTREME DETAIL what the "${context.selectedSection.header}" section contains, including all key points, concepts, and structures`);
    parts.push(`- Specify IN DETAIL how each element from the section should be communicated in video format, including voiceover talking points, visual suggestions, B-roll ideas, on-screen text, pacing, and timing`);
    parts.push(`- Be EXPLICIT and DETAILED about what should and should not be included based on the preferences above`);
    parts.push(`- Reference SPECIFIC content, data, or structures from the section with detailed scene descriptions`);
    parts.push(`- Include detailed descriptions of scene structure, talking points, visual elements, pacing, and timing`);
  } else {
    parts.push("\nGenerate a HIGHLY DETAILED checklist with at least 5-10 comprehensive, specific, actionable scenes that will guide the video script generation:");
    parts.push(`- Each scene must be HIGHLY DETAILED with specific talking points, visual suggestions, and script structure`);
    parts.push(`- Focus on how to communicate the core essence and key concepts from the blueprint content in an engaging short-form format`);
    parts.push(`- Describe how to create an effective short-form vertical video - visually compelling and representative of the content`);
    parts.push(`- Be EXPLICIT and DETAILED about what should and should not be included based on the preferences above`);
    parts.push(`- Include detailed descriptions of scene structure, talking points, visual elements, B-roll suggestions, on-screen text, pacing, and timing`);
    parts.push(`- Reference SPECIFIC content, themes, or concepts from the blueprint that should be communicated in each scene`);
    parts.push(`- Structure should include: Hook (3-5s), Problem/Setup, Value/Steps, Proof/Examples, CTA/Close`);
  }
  
  parts.push("\nCRITICAL FORMAT REQUIREMENT:");
  parts.push("Format your response EXACTLY as follows - each checklist item must have:");
  parts.push("1. A clear, descriptive title (like \"Scene 1: Hook - Problem Statement\" or \"Scene 2: Value Proposition - Key Benefits\")");
  parts.push("2. A detailed description starting with \"I'm currently...\" or \"I'm now...\" that explains what scene you're planning, what talking points it should include, what visuals/B-roll would work, and how it fits into the overall video flow");
  parts.push("\nExample format:");
  parts.push("Scene 1: Hook - Problem Statement");
  parts.push("");
  parts.push("I'm currently planning the opening hook that needs to grab attention in the first 3 seconds. This scene should start with a bold statement about the problem, use on-screen text to emphasize key words, and include quick cuts of relatable visuals that show the problem in action. The voiceover should be direct and punchy, setting up the value proposition that follows.");
  parts.push("");
  parts.push("Scene 2: Value Proposition - Key Benefits");
  parts.push("");
  parts.push("I'm now structuring the main value scene where we explain the solution. This should include 2-3 key benefits, each with a visual representation (B-roll or graphics), and on-screen text overlays that reinforce the voiceover. The pacing should be energetic but clear, allowing viewers to absorb each benefit before moving to the next.");
  parts.push("\nEach item should be separated by a blank line. Use this format for ALL checklist items. Do not include any other text, just the checklist items in this format.");
  
  return parts.join("\n");
};

