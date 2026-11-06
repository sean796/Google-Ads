import { AgentConfig } from "@/types/agent-config";
import {
  IMAGE_SCENE_PLAUSIBILITY_CHECKLIST_TITLE,
  IMAGE_SCENE_PLAUSIBILITY_PROMPT,
  hasPhysicalScenePlausibilityItem,
} from "@/lib/image-scene-plausibility";
import { windowTreatmentImagePromptSuffix } from "@/lib/image-window-treatment-prompt-rules";

export type ImageType = 'infographic' | 'blog-image' | 'diagram' | 'illustration' | 'chart' | 'photo' | 'custom';

export interface ImageChecklistContext {
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
  includeText: boolean;
  includePeople: boolean;
  includeAnimals: boolean;
  includeCars: boolean;
  isInfographic: boolean;
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '9:19';
  style: 'professional' | 'minimalist' | 'abstract' | 'modern' | 'classic';
  colorScheme: 'vibrant' | 'muted' | 'monochrome' | 'warm' | 'cool' | 'natural';
  colorForeground?: string;
  colorBackground?: string;
  imageType?: ImageType; // Optional image type for in-content images
}

export interface ImageChecklistItem {
  title: string;
  description: string;
}

export const IMAGE_REQUIREMENTS_ARTIFACT_FILENAME = "image-requirements.json";

/** Overview featured-image pipeline: IMAGE REQUIREMENTS agent output. */
export function formatImageRequirementsArtifact(
  checklist: ImageChecklistItem[],
  meta: { title: string; purpose?: string; keyword?: string },
): string {
  return JSON.stringify(
    {
      agent: "IMAGE REQUIREMENTS",
      title: meta.title,
      purpose: meta.purpose?.trim() || undefined,
      keyword: meta.keyword?.trim() || undefined,
      checklist: checklist.map((item, index) => ({
        index: index + 1,
        title: item.title,
        description: item.description,
      })),
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

/**
 * Cleans content by removing links and code blocks, keeping only the actual text content
 */
const cleanContentForImageGeneration = (content: string): string => {
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
 * Checks if user prompt mentions a link
 */
const userMentionsLink = (userPrompt?: string): boolean => {
  if (!userPrompt) return false;
  const lowerPrompt = userPrompt.toLowerCase();
  return lowerPrompt.includes('link') || 
         lowerPrompt.includes('url') || 
         lowerPrompt.includes('http') ||
         lowerPrompt.includes('website') ||
         lowerPrompt.includes('site');
};

/**
 * Detects if the selected section is a GSC report infographic (has branding requirements).
 * Only report sections that contain infographic instructions get the strict color/brand treatment.
 */
export const isReportInfographicSection = (
  selectedSection?: { header: string; content: string; fullText: string },
  flowTitle?: string
): boolean => {
  if (!selectedSection) return false;
  const headerMatch =
    selectedSection.header.startsWith('Infographic:') ||
    selectedSection.header.startsWith('Infographic.') ||
    selectedSection.header.toLowerCase().includes('infographic');
  const contentMatch =
    selectedSection.fullText.includes('[INFOGRAPHIC]') ||
    selectedSection.fullText.includes('BRAND COLORS');
  const isGSCReport = flowTitle?.includes('SEO Performance Report') ?? false;
  const result = contentMatch || (headerMatch && isGSCReport);
    return result;
};

/**
 * Checks if user prompt mentions CTAs (Call-To-Actions)
 */
const userMentionsCTA = (userPrompt?: string): boolean => {
  if (!userPrompt) return false;
  const lowerPrompt = userPrompt.toLowerCase();
  return lowerPrompt.includes('cta') || 
         lowerPrompt.includes('call to action') ||
         lowerPrompt.includes('call-to-action') ||
         lowerPrompt.includes('button') ||
         lowerPrompt.includes('click here') ||
         lowerPrompt.includes('learn more') ||
         lowerPrompt.includes('sign up') ||
         lowerPrompt.includes('download now');
};

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

/**
 * Builds a user prompt for image checklist generation
 */
export const buildImageChecklistUserPrompt = (
  context: ImageChecklistContext
): string => {
  const shouldIncludeLinks = userMentionsLink(context.userPrompt);
  const shouldIncludeCTAs = userMentionsCTA(context.userPrompt);
  const parts: string[] = [];
  
  if (context.selectedSection) {
    parts.push(`Generate a HIGHLY DETAILED, COMPREHENSIVE checklist for creating an image based specifically on the "${context.selectedSection.header}" section from the report.`);
    parts.push(`\nEXTRACTION REQUIREMENTS (READ THE SECTION AND USE WHAT IT SAYS):`);
    parts.push(`1. READ the section content. It contains explicit instructions (hex codes, CRITICAL rules, **BRAND COLORS**, **REQUIRED ELEMENTS**, **DESIGN REQUIREMENTS**, **VISUAL STYLE**). EXTRACT these and include them in your checklist with EXACT values preserved.`);
    parts.push(`2. Any hex codes in the section (e.g., #02050A, #84BD00, #fff) - write them EXACTLY in your checklist. Do NOT substitute "deep navy" for #02050A or "vibrant green" for #84BD00.`);
    parts.push(`3. Any "CRITICAL:", "Do NOT", "NEVER" in the section - extract and include that prohibition. If the section says "Do NOT use AI", your checklist must NOT mention "AI-powered", "AI-driven", or "AI analysis".`);
    parts.push(`4. Each checklist item should reflect what the section explicitly specifies. Preserve exact values. Do not paraphrase technical specifications.`);
    parts.push(`5. If the section contains tables, describe what the table shows and how it should be visualized.`);
    parts.push(`6. If the section contains data or statistics, describe how those should be represented.`);
    parts.push(`7. The checklist must be HIGHLY SPECIFIC to the content of the "${context.selectedSection.header}" section with detailed visual descriptions\n`);
  } else {
    parts.push("Generate a HIGHLY DETAILED, COMPREHENSIVE checklist for creating a FEATURED IMAGE for a website/blog based on the full blueprint content:\n");
    parts.push(`\nCRITICAL REQUIREMENTS (FEATURED IMAGE FOR WEBSITE/BLOG):`);
    parts.push(`1. This is a FEATURED IMAGE that will represent the entire blueprint content - analyze the full blueprint to understand the main theme, key topics, and overall message`);
    parts.push(`2. The featured image should visually capture the CORE ESSENCE of the blueprint content - what is the main story, theme, or concept?`);
    parts.push(`3. Think about what would make an effective website/blog featured image - it should be visually compelling, communicate the content's purpose at a glance, and draw the viewer in`);
    parts.push(`4. The checklist must be HIGHLY DETAILED with specific visual descriptions, composition details, and explicit requirements for every aspect of the image`);
    parts.push(`5. Describe how the image should visually represent the blueprint's main ideas, themes, and key concepts\n`);
  }
  
  // Add instruction to ignore links and code unless user specifically mentions them
  if (!shouldIncludeLinks) {
    parts.push(`\nIMPORTANT: IGNORE ALL LINKS, URLs, AND CODE - Focus ONLY on the actual content, concepts, ideas, and meaningful text. Do NOT include or reference any URLs, links, code blocks, inline code, or code snippets in your image generation checklist. Analyze only the meaningful content and concepts.\n`);
  }
  
  // Add instruction to ignore CTAs unless user specifically mentions them
  if (!shouldIncludeCTAs) {
    parts.push(`\nCRITICAL: NEVER INCLUDE CTAs (CALL-TO-ACTIONS) - Do NOT include or reference any buttons, clickable elements, call-to-action text (such as "Learn More", "Click Here", "Sign Up", "Download Now"), interactive UI elements, or promotional CTAs in your image generation checklist. Focus on the actual content and visual elements only, not interactive web components or CTAs, unless the user specifically requests them in their prompt.\n`);
  }
  
  if (context.userPrompt && context.userPrompt.trim()) {
    parts.push(`User's visual preferences: ${context.userPrompt.trim()}`);
  }
  
  parts.push("\nContent inclusion preferences:");
  if (context.includeText) {
    parts.push("- MUST include words, labels, titles");
  } else {
    parts.push("- MUST NOT include any words, labels, or titles");
  }
  
  if (context.includePeople) {
    parts.push("- MUST include people");
  } else {
    parts.push("- MUST NOT include any people");
  }
  
  if (context.includeAnimals) {
    parts.push("- MUST include animals");
  } else {
    parts.push("- MUST NOT include any animals");
  }

  if (context.includeCars) {
    parts.push("- MUST include vehicles (cars, trucks, motorcycles, etc.)");
  } else {
    parts.push("- MUST NOT include any vehicles");
  }

  if (context.isInfographic) {
    const isReportInfographic = context.selectedSection && isReportInfographicSection(context.selectedSection, context.flowTitle);
        parts.push("- MUST be an infographic with charts, graphs, icons, and data visualizations");
    if (isReportInfographic) {
      parts.push("- EXACT HEX CODES (quote in checklist): Background #02050A, Accent #84BD00 (lime green), Text #fff.");
      parts.push("- Format: TALL mobile optimized 9:16 (portrait). Layout: SIMPLE, CLEAN, EASY TO READ - like neodigital site. NOT busy. Generous negative space.");
      parts.push("- NEVER add logos (no Neo Digital logo, no brand logos).");
      parts.push("- REAL DATA ONLY: No placeholders (+X%, TBD). No fake/garbled words. Use actual numbers only.");
      parts.push("- Shapes only (circles, grids) - NO faces. Key labels: SAP location, metrics, period.");
      parts.push("- SAP location + geographic outline REQUIRED.");
      parts.push("- NO AI, NO hashtags, NO Next Steps. Google/SEO icons.");
      parts.push("- CRITICAL SCANNABILITY: BIG numbers, SHORT labels (5 words max), icons. Exec-friendly - scannable in under 10 seconds.");
    } else {
      parts.push("- CRITICAL: MUST include explanatory text, labels, and annotations throughout the infographic");
      parts.push("- MUST be self-explanatory with clear text that explains the section content in detail");
      parts.push("- MUST be suitable for social media sharing - understandable without needing the original article context");
      parts.push("- MUST include text labels for all charts, graphs, icons, and data visualizations");
      parts.push("- MUST include section titles, subtitles, and descriptive text that explains what each visual element represents");
    }
  }

  // Add image type-specific requirements
  if (context.imageType) {
    const isReportInfographic = context.selectedSection && isReportInfographicSection(context.selectedSection, context.flowTitle);
    const infographicRequirement = isReportInfographic
      ? 'CRITICAL: REPORT INFOGRAPHIC. Quote these hex codes in your checklist: Background #02050A, Accent #84BD00 (lime green), Text #fff. TALL 9:16 mobile (portrait). SIMPLE layout like neodigital site - NOT busy, easy to read. NEVER add logos. REAL DATA ONLY - no placeholders, no fake words. Shapes only; NO faces. SAP label + geographic outline. NO AI, NO hashtags, NO Next Steps.'
      : 'CRITICAL: This is an INFOGRAPHIC image. It MUST be optimized for mobile displays with a tall format (9:16 or 9:19 aspect ratio). The image must be designed for vertical scrolling on mobile devices. Include data visualizations, charts, graphs, icons, and structured information layouts suitable for mobile viewing. MUST include extensive explanatory text, labels, annotations, and descriptive content throughout the infographic to make it self-explanatory and suitable for social media sharing. The infographic must explain the section content in detail with text, not just visual elements.';
    const imageTypeRequirements: Record<ImageType, string> = {
      'infographic': infographicRequirement,
      'blog-image': 'This is a standard BLOG IMAGE (16:9 aspect ratio) suitable for embedding in blog content.',
      'diagram': 'This is a TECHNICAL DIAGRAM. It must have clear labels, technical accuracy, and professional diagram formatting.',
      'illustration': 'This is an ILLUSTRATION. It should use visual illustration style with artistic elements.',
      'chart': 'This is a DATA CHART. It must present data clearly with proper chart formatting, axes, labels, and data visualization best practices.',
      'photo': 'This is a PHOTOGRAPHIC image. It should use realistic photographic style.',
      'custom': context.userPrompt ? `This is a CUSTOM image type. User requirements: ${context.userPrompt}` : 'This is a custom image type.',
    };
    
    parts.push(`\n${imageTypeRequirements[context.imageType]}`);
    
    // Add mobile optimization note for infographics
    if (context.imageType === 'infographic') {
      parts.push('\nMOBILE OPTIMIZATION REQUIREMENT: This infographic MUST be explicitly designed for mobile-optimized displays with a tall, vertical format. The layout must work well when viewed on mobile devices in portrait orientation.');
    }
  }
  
  // For section-based: extraction rules in system prompt handle it. For featured image: do NOT include settings.
  if (!context.selectedSection) {
    parts.push(`\nCRITICAL: Do NOT mention or include any image generation settings (aspect ratio, style, color scheme, or specific colors) in the checklist items or in the generated image. Focus ONLY on the actual content, visual elements, composition, and design based on the section/content provided.`);
  }
  
  if (context.selectedSection) {
    parts.push(`\nGenerate a HIGHLY DETAILED checklist with at least 5-7 comprehensive, specific, actionable items that:`);
    parts.push(`- EXTRACT and include the section's explicit instructions (hex codes, prohibitions, required elements) with exact values preserved`);
    parts.push(`- Describe IN EXTREME DETAIL what the "${context.selectedSection.header}" section contains, including all visual elements, data, concepts, and structures`);
    parts.push(`- Specify IN DETAIL how each element from the section should be visualized, including visual style, composition, colors (use exact hex codes from section), lighting, perspective`);
    parts.push(`- Be EXPLICIT and DETAILED about what should and should not be included based on the section and preferences above`);
    parts.push(`- Reference SPECIFIC content, data, or structures from the section with detailed visual descriptions`);
  } else {
    parts.push("\nGenerate a HIGHLY DETAILED checklist with at least 5-7 comprehensive, specific, actionable items that will guide the featured image generation for the website/blog:");
    parts.push(`- REQUIRED: Include one checklist item titled exactly "${IMAGE_SCENE_PLAUSIBILITY_CHECKLIST_TITLE}" that lists the main physical objects and the context each must appear in (window frame for blinds, etc.)`);
    const wtSuffix = windowTreatmentImagePromptSuffix(
      context.flowTitle,
      context.finalOutput,
      context.userPrompt,
    );
    if (wtSuffix.trim()) {
      parts.push(`- Apply these window-treatment-specific rules in the checklist:${wtSuffix}`);
    }
    parts.push(`- Each item must be HIGHLY DETAILED with specific visual descriptions of how to represent the blueprint's main theme and content`);
    parts.push(`- Focus on how to visually communicate the core essence and key concepts from the blueprint content`);
    parts.push(`- Describe how to create an effective featured image that would work well for a website/blog - visually compelling and representative of the content`);
    parts.push(`- Be EXPLICIT and DETAILED about what should and should not be included based on the preferences above`);
    parts.push(`- Include detailed descriptions of visual composition, style specifics, color details, lighting, perspective, and all visual elements (but NEVER mention image generation settings like aspect ratio, style settings, or color scheme settings)`);
    parts.push(`- Reference SPECIFIC content, themes, or concepts from the blueprint that should be visualized in the featured image`);
  }
  parts.push("\nCRITICAL FORMAT REQUIREMENT:");
  parts.push("Format your response EXACTLY as follows - each checklist item must have:");
  parts.push("1. A clear, descriptive title (like \"Considering Design Constraints\" or \"Formulating the Layout\")");
  parts.push("2. A detailed description starting with \"I'm currently...\" or \"I'm now...\" that explains what you're focusing on, what decisions you're making, or what you're verifying");
  parts.push("\nExample format:");
  parts.push("Considering Design Constraints");
  parts.push("");
  parts.push("I'm currently focused on the specific design requirements. The phone-optimized, tall format (9:16) is a key constraint. Now, I need to figure out how to best visually represent the comparison between the two cabin types.");
  parts.push("");
  parts.push("Formulating the Layout");
  parts.push("");
  parts.push("I'm now determining how to visually represent the comparison. I've settled on a central feature column with the two cabin types on either side. Each row will be a separate section with consistent horizontal alignment. I am currently deciding on the visual metaphors and graphics for each cabin type. I am focusing on sleek/modern graphics for the SkyGlass and rustic/traditional graphics for the Strohboid.");
  parts.push("\nEach item should be separated by a blank line. Use this format for ALL checklist items. Do not include any other text, just the checklist items in this format.");
  
  return parts.join("\n");
};

/**
 * Parses AI-generated image checklist response into structured ImageChecklistItem array
 */
export function parseImageChecklist(
  aiResponse: string,
  options?: { strictFeatured?: boolean },
): ImageChecklistItem[] {
  const strictFeatured = options?.strictFeatured === true;
  const lines = aiResponse.split('\n').map(line => line.trim());
  const parsedItems: ImageChecklistItem[] = [];
  let currentTitle: string | null = null;
  let currentDescription: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    
    // Skip empty lines - they separate title from description or items from each other
    if (!line) {
      // If we have both title and description, save the item
      if (currentTitle && currentDescription.length > 0) {
        parsedItems.push({
          title: currentTitle,
          description: currentDescription.join(' ')
        });
        currentTitle = null;
        currentDescription = [];
      }
      i++;
      continue;
    }

    // Check if this line is a title (not starting with "I'm"/"I am", typically shorter, capitalized)
    const isTitleCandidate = line.length < 120 && 
                             line.length > 3 &&
                             !line.startsWith("I'm") && 
                             !line.startsWith("I am") &&
                             !line.startsWith("I'm currently") &&
                             !line.startsWith("I'm now") &&
                             !line.match(/^[a-z]/); // Starts with capital

    // Check if this line is a description (starts with "I'm" or "I am")
    const isDescription = line.startsWith("I'm") || 
                          line.startsWith("I am") ||
                          line.startsWith("I'm currently") ||
                          line.startsWith("I'm now");

    if (isTitleCandidate && !currentTitle) {
      // Look ahead to see if next non-empty line is a description
      let j = i + 1;
      while (j < lines.length && !lines[j]) j++;
      
      if (j < lines.length && 
          (lines[j].startsWith("I'm") || lines[j].startsWith("I am"))) {
        // This is a title, next line is description
        currentTitle = line;
        i = j; // Move to description line
        continue;
      } else if (j < lines.length && lines[j].length > 50) {
        // Next line is long, might be description without "I'm"
        currentTitle = line;
        i = j;
        continue;
      }
    }

    // If we have a title and this is a description, add it
    if (currentTitle && (isDescription || (currentDescription.length > 0 && line.length > 20))) {
      if (isDescription || currentDescription.length > 0) {
        currentDescription.push(line);
      }
    } else if (currentTitle && currentDescription.length > 0) {
      // We have a complete item, but this line doesn't continue the description
      // Check if it's a new title
      if (isTitleCandidate) {
        // Save current item and start new one
        parsedItems.push({
          title: currentTitle,
          description: currentDescription.join(' ')
        });
        currentTitle = line;
        currentDescription = [];
      } else {
        // Might be continuation of description
        currentDescription.push(line);
      }
    } else if (!currentTitle && isTitleCandidate) {
      // Start new item
      currentTitle = line;
    }

    i++;
  }

  // Save last item if exists
  if (currentTitle) {
    parsedItems.push({
      title: currentTitle,
      description:
        currentDescription.length > 0
          ? currentDescription.join(" ")
          : IMAGE_SCENE_PLAUSIBILITY_PROMPT,
    });
  }

  // Secondary parse pass when structured format not found on first pass
  if (parsedItems.length === 0) {
    // Try pattern: Title (non-empty, not starting with I'm) followed by description (starts with I'm)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      // Look for title pattern
      if (line.length < 100 && line.length > 5 && 
          line[0] === line[0].toUpperCase() && 
          !line.startsWith("I'm") && !line.startsWith("I am")) {
        // Find next non-empty line as description
        let j = i + 1;
        while (j < lines.length && !lines[j]) j++;
        
        if (j < lines.length) {
          const descLine = lines[j];
          if (descLine.startsWith("I'm") || descLine.startsWith("I am") || descLine.length > 30) {
            parsedItems.push({
              title: line,
              description: descLine
            });
            i = j; // Skip description
          }
        }
      }
    }
  }

  if (parsedItems.length === 0) {
    parsedItems.push({
      title: IMAGE_SCENE_PLAUSIBILITY_CHECKLIST_TITLE,
      description: IMAGE_SCENE_PLAUSIBILITY_PROMPT,
    });
  }
  if (strictFeatured && !hasPhysicalScenePlausibilityItem(parsedItems)) {
    parsedItems.push({
      title: IMAGE_SCENE_PLAUSIBILITY_CHECKLIST_TITLE,
      description: IMAGE_SCENE_PLAUSIBILITY_PROMPT,
    });
  }
  return parsedItems;
}

