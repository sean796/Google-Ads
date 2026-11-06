/**
 * Cleans content by removing links and code blocks, keeping only the actual text content
 */
export const cleanContentForImageGeneration = (content: string): string => {
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
export const userMentionsLink = (userPrompt?: string): boolean => {
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
export const userMentionsCTA = (userPrompt?: string): boolean => {
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
