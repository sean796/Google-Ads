import {
  IMAGE_SCENE_PLAUSIBILITY_PROMPT,
} from "@/lib/image-scene-plausibility";
import { windowTreatmentImagePromptSuffix } from "@/lib/image-window-treatment-prompt-rules";
import {
  cleanContentForImageGeneration,
  isReportInfographicSection,
  userMentionsCTA,
  userMentionsLink,
} from "./image-checklist-helpers";

/**
 * Builds a system prompt for image checklist generation
 */
export const buildImageChecklistSystemPrompt = (
  flowTitle: string,
  flowPurpose: string,
  finalOutput?: string,
  selectedSection?: {
    header: string;
    content: string;
    fullText: string;
  },
  userPrompt?: string
): string => {
  const shouldIncludeLinks = userMentionsLink(userPrompt);
  const shouldIncludeCTAs = userMentionsCTA(userPrompt);
  let contentContext = "";
  
  if (selectedSection) {
    // When a specific section is selected, include the FULL section content - do not truncate so BRAND COLORS, etc. are preserved
    let sectionContent = selectedSection.fullText;
    
    // Clean content unless user specifically mentions links
    if (!shouldIncludeLinks) {
      sectionContent = cleanContentForImageGeneration(sectionContent);
    } else {
      // Still remove code blocks but keep links if user mentioned them
      sectionContent = sectionContent
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/`[^`]+`/g, '') // Remove inline code
        .replace(/#{1,6}\s+/g, '') // Remove markdown headers
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    
    // Include full content (up to 5000 chars) so BRAND COLORS, REQUIRED ELEMENTS, DESIGN REQUIREMENTS, CRITICAL rules are never truncated
    const sectionForAnalysis = sectionContent.length > 5000 
      ? sectionContent.substring(0, 5000) + '...\n[Content continues but truncated for length]'
      : sectionContent;
    
    contentContext = `\n\n=== CRITICAL: SECTION-BASED IMAGE GENERATION ===
This image MUST be based specifically and exclusively on the "${selectedSection.header}" section from the report.

FULL SECTION CONTENT (READ AND EXTRACT FROM THIS):
${sectionForAnalysis}

YOUR JOB: READ the section content above and EXTRACT its explicit instructions into your checklist.

EXTRACTION RULES (non-negotiable):
1. Any hex codes (e.g., #02050A, #84BD00, #fff) - include them EXACTLY in your checklist. Write "#02050A" not "deep navy". Write "#84BD00" not "vibrant green".
2. Any line starting with "CRITICAL:", "Do NOT", "NEVER" - extract and include the prohibition in your checklist.
3. Any **BRAND COLORS**, **REQUIRED ELEMENTS**, **DESIGN REQUIREMENTS**, **VISUAL STYLE** blocks - these are MANDATORY. Your checklist must incorporate these with exact values.
4. Do NOT add concepts that the section prohibits. If it says "Do NOT use AI", your checklist must NOT mention "AI-powered", "AI-driven", or "AI analysis".

Each checklist item should reflect what the section explicitly specifies. Preserve exact values. Do not paraphrase technical specifications (colors, codes, prohibitions).`;
    
    // When report infographic: section may be agent-paraphrased with wrong colors (e.g. "neon blue"). Override with canonical spec.
    if (selectedSection && isReportInfographicSection(selectedSection, flowTitle)) {
      contentContext += `

=== REPORT INFOGRAPHIC OVERRIDE (IGNORE conflicting color/theme in section above) ===
CRITICAL: Each checklist item MUST quote these hex codes verbatim - they must appear in the final checklist: Background #02050A, Accent #84BD00 (lime green), Text #fff.
- Format: TALL mobile optimized 9:16 (portrait) - NOT wide
- Layout: SIMPLE, CLEAN, EASY TO READ - like neodigital website. Generous negative space. NOT busy. Professional.
- NEVER add logos (no Neo Digital logo, no brand logos)
- REAL DATA ONLY: No placeholders (+X%, TBD). No fake/garbled words. Use actual numbers from the report.
- Shapes only (circles, grids) - NO faces. Key labels required: SAP location, metrics, period.
- NO AI. NO hashtags. NO Next Steps.`;
    }
  } else if (finalOutput) {
    let cleanedOutput = finalOutput;
    if (!shouldIncludeLinks) {
      cleanedOutput = cleanContentForImageGeneration(finalOutput);
    } else {
      // Still remove code blocks but keep links if user mentioned them
      cleanedOutput = finalOutput
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]+`/g, '')
        .replace(/#{1,6}\s+/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    
    // Include more content for featured image (up to 2000 chars) to allow comprehensive analysis
    // Even if cleanedOutput is short, we still include it - the AI needs the content
    const outputForAnalysis = cleanedOutput.length > 2000 
      ? cleanedOutput.substring(0, 2000) + '...\n[Content continues but truncated for length]'
      : cleanedOutput;
    
    if (outputForAnalysis.trim().length > 0) {
      const outlineHint = finalOutput.includes('Blog checklist outline:')
        ? `

NOTE: The source text is a structural blog outline (not finished article prose). Treat it like a table of contents: infer theme, audience, and visual direction from the outline lines with the same rigor you would for full body copy.`
        : '';
      contentContext = `\n\n=== FEATURED IMAGE FOR WEBSITE/BLOG ===
This image is a FEATURED IMAGE that will be used as the main visual representation for this blueprint content, similar to a blog post or website article featured image.

FULL BLUEPRINT CONTENT FOR ANALYSIS:
${outputForAnalysis}${outlineHint}

IMPORTANT: Analyze the ENTIRE blueprint content to understand the main theme, key topics, concepts, and overall message. The featured image should visually represent the core essence and main ideas of the entire blueprint, making it suitable for use as a website/blog featured image that captures the viewer's attention and communicates what the content is about.`;
    }
  }
  
  const linkInstruction = shouldIncludeLinks 
    ? "\n\nCRITICAL: Never output placeholder or fictional URLs (example.com, example.org, localhost, etc.) in checklist items - only describe visuals, not links."
    : "\n\nCRITICAL: IGNORE ALL LINKS AND CODE - Focus ONLY on the actual content, concepts, ideas, and text. Do NOT include or reference any URLs, links, code blocks, or code snippets in your image generation checklist. The content has been cleaned to remove these elements - analyze only the meaningful text and concepts. Never output placeholder domains (example.com, etc.) or fictional URLs.";
  
  const ctaInstruction = shouldIncludeCTAs
    ? ""
    : "\n\nCRITICAL: NEVER INCLUDE CTAs (CALL-TO-ACTIONS) - Do NOT include or reference any buttons, clickable elements, call-to-action text, or interactive UI elements in your image generation checklist. Focus on the actual content and visual elements only, not interactive web components or promotional CTAs unless the user specifically requests them in their prompt.";

  const colorInstruction = selectedSection
    ? ""
    : "\n\nCRITICAL: NEVER include image generation settings (aspect ratio, style, color scheme, or specific color values) in the checklist items or in the generated image. These are technical parameters used only for generation, NOT visual elements to include. Focus ONLY on the actual content and visual elements from the provided content.";

  const windowTreatmentRules = windowTreatmentImagePromptSuffix(
    flowTitle,
    finalOutput,
    userPrompt,
    selectedSection?.fullText,
  );

  return `You are an expert AI image generation strategist. Your role is to analyze content requirements and create a HIGHLY DETAILED, COMPREHENSIVE checklist for generating an image that accurately represents the content.

${IMAGE_SCENE_PLAUSIBILITY_PROMPT}${windowTreatmentRules}${linkInstruction}${ctaInstruction}

Flow Context:
- Title: ${flowTitle || "Untitled"}
- Purpose: ${flowPurpose || "Not specified"}${contentContext}

Your task is to:
1. ${selectedSection ? `CAREFULLY ANALYZE the "${selectedSection.header}" section content above and DESCRIBE IN EXTREME DETAIL what this section contains, its structure, key elements, data, concepts, visual elements, and every significant aspect.` : 'CAREFULLY ANALYZE the full blueprint content above and DESCRIBE IN EXTREME DETAIL the main theme, key topics, concepts, visual elements, and overall message. This is for a website/blog featured image, so analyze what would best represent the entire blueprint content visually.'}
2. Create a HIGHLY DETAILED checklist that ${selectedSection ? `describes the section's content in COMPREHENSIVE detail and ` : 'describes the blueprint content in COMPREHENSIVE detail and '}specifies image generation requirements with PRECISION
3. Ensure the checklist respects user preferences (what to include/exclude) and is EXPLICIT about each requirement
4. Make the checklist SPECIFIC, ACTIONABLE, and DETAILED for image generation - include visual elements, composition details, style specifics, color details, lighting, perspective, and content requirements
5. Focus on DETAILED visual elements, composition specifics, style details, and content requirements
${selectedSection ? `6. CRITICAL: Each checklist item must be HIGHLY DETAILED and describe SPECIFIC aspects of the "${selectedSection.header}" section content. The checklist must detail EXACTLY what visual elements, concepts, data, or structures from this section should appear in the image, with specific descriptions.` : '6. CRITICAL: Each checklist item must be HIGHLY DETAILED with specific visual descriptions, composition details, and explicit requirements.'}
7. The checklist must from pov of The image needs needs to include, not "I will do this"...

${selectedSection ? `IMPORTANT: The checklist must describe the section's content in COMPREHENSIVE DETAIL. For example, if the section contains a table, describe EXACTLY what the table shows, what data it contains, how it should be visualized, what visual style it should use, and how it relates to other elements. If it contains specific concepts or data, describe those EXPLICITLY with full detail.` : 'IMPORTANT: The checklist must be HIGHLY DETAILED with specific visual descriptions, composition details, style specifics, and explicit requirements for every aspect of the image.'}
${colorInstruction}

If something isnt selected like text, you need to state no text, if color is not selected, dont state any color.

CRITICAL FORMAT REQUIREMENT:
Format your response EXACTLY as follows - each checklist item must have:
1. A clear, descriptive title (like "Considering Design Constraints" or "Formulating the Layout")
2. A detailed description starting with "I'm currently..." or "I'm now..." that explains what you're focusing on, what decisions you're making, or what you're verifying

Other Notes:
if something isnt selected like text, you need to state no text, if color is not selected, dont state any color.
${!selectedSection ? "\nCRITICAL: NEVER mention aspect ratio, style settings, color scheme settings, or specific color values in your checklist items. These are technical generation parameters, NOT visual content to include in the image." : ""}

You need to be more detailed and give more information about the image you are generating.

Example format:
Considering Design Constraints

I'm currently focused on the specific design requirements and how to best visually represent the comparison between the two cabin types.

Formulating the Layout

I'm now determining how to visually represent the comparison. I've settled on a central feature column with the two cabin types on either side. Each row will be a separate section with consistent horizontal alignment. I am currently deciding on the visual metaphors and graphics for each cabin type. I am focusing on sleek/modern graphics for the SkyGlass and rustic/traditional graphics for the Strohboid.

Each item should be separated by a blank line. Use this format for ALL checklist items.`;
};
