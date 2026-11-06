import {
  IMAGE_SCENE_PLAUSIBILITY_CHECKLIST_TITLE,
} from "@/lib/image-scene-plausibility";
import { windowTreatmentImagePromptSuffix } from "@/lib/image-window-treatment-prompt-rules";
import type { ImageChecklistContext, ImageType } from "./image-checklist-types";
import {
  isReportInfographicSection,
  userMentionsCTA,
  userMentionsLink,
} from "./image-checklist-helpers";

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
