import type { KeywordAIAnalysis, KeywordData } from '../keyword-types';
import { filterOutFaqStyleHeadingTitles } from '../content-generation/faq-heading-policy';

/**
 * Helper functions for auto-selection (extracted from KeywordResearchTab logic)
 */
export function autoSelectKeywords(aiAnalysis: KeywordAIAnalysis, keywordsWithVolumeData: KeywordData[]): string[] {
  const selected: string[] = [];
  
  // Select primary keyword
  if (aiAnalysis.keywordSuggestions?.primary) {
    selected.push(aiAnalysis.keywordSuggestions.primary);
  }
  
  // Select top variations (up to 5)
  if (aiAnalysis.keywordSuggestions?.variations) {
    selected.push(...aiAnalysis.keywordSuggestions.variations.slice(0, 5));
  }
  
  // Select top long-tail keywords (up to 3)
  if (aiAnalysis.keywordSuggestions?.longTail) {
    selected.push(...aiAnalysis.keywordSuggestions.longTail.slice(0, 3));
  }
  
  return [...new Set(selected)]; // Remove duplicates
}

export function autoSelectH2Sections(aiAnalysis: KeywordAIAnalysis): string[] {
  if (!aiAnalysis.h2Suggestions || aiAnalysis.h2Suggestions.length === 0) {
    return [];
  }
  // Select top 5-7 H2 sections - extract heading strings if objects
  const sections = aiAnalysis.h2Suggestions.slice(0, 7);
  const headings = sections.map(section => typeof section === 'string' ? section : section.heading || section.description || '');
  return filterOutFaqStyleHeadingTitles(headings.filter(Boolean));
}

export function autoSelectPeopleAlsoAsk(aiAnalysis: KeywordAIAnalysis): string[] {
  if (!aiAnalysis.peopleAlsoAsk || aiAnalysis.peopleAlsoAsk.length === 0) {
    return [];
  }
  // Select top 5-7 PAA questions
  return aiAnalysis.peopleAlsoAsk.slice(0, 7).map(paa => 
    typeof paa === 'string' ? paa : paa.question
  );
}

export function autoSelectResearchLinks(aiAnalysis: KeywordAIAnalysis): string[] {
  if (!aiAnalysis.researchLinks || aiAnalysis.researchLinks.length === 0) {
    return [];
  }
  // Select top 7 research links
  return aiAnalysis.researchLinks.slice(0, 7).map(link => 
    typeof link === 'string' ? link : link.url
  );
}

