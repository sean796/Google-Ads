/**
 * GSC Self-Learning Analysis
 * Analyzes Google Search Console performance data to provide content recommendations
 */

import { loadApiKey } from './api';
import type { WordPressSite } from '@/components/integrations/types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { logger } from "@/lib/logger";

export interface GSCPerformanceRecommendation {
  recommendedKeywords: Array<{
    keyword: string;
    clicks: number;
    impressions: number;
    position: number;
    opportunity: 'high' | 'medium' | 'low';
    reasoning: string;
  }>;
  contentThemes: string[];
  highPerformingTopics: string[];
  positionImprovements: Array<{
    keyword: string;
    currentPosition: number;
    opportunity: string;
  }>;
}

/**
 * Analyzes GSC performance data for existing posts/pages to provide recommendations
 */
export async function analyzeGSCPerformance(
  site: WordPressSite,
  postType: 'post' | 'service-area',
  dateRangeDays: number = 90
): Promise<GSCPerformanceRecommendation> {

  const BACKEND_API_BASE = import.meta.env.VITE_MCP_API_BASE?.replace('/api/mcp', '') || 
    (import.meta.env.DEV ? 'http://localhost:3001' : '');

  // Calculate date range (use the same logic as the working fetch-queries endpoint)
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() - 3); // 3 days ago (GSC data delay)
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - dateRangeDays);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];


  try {
    // Use the existing working fetch-queries endpoint
    const queriesUrl = `${BACKEND_API_BASE}/api/gsc/fetch-queries`;
    const queriesResponse = await fetch(queriesUrl, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        startDate: startDateStr,
        endDate: endDateStr,
      }),
    });

    if (!queriesResponse.ok) {
      const errorText = await queriesResponse.text();
      logger.warn('[GSC Self-Learning] Could not fetch GSC queries:', errorText);
      return createEmptyRecommendations();
    }

    const queriesData = await queriesResponse.json();

    if (!queriesData.success) {
      logger.warn('[GSC Self-Learning] No GSC data available:', queriesData.error);
      return createEmptyRecommendations();
    }

    // Extract queries from response - response structure: { success: true, queries: [...] }
    // Each query: { query, clicks, impressions, ctr, position }
    const queries = queriesData.queries || [];
    
    if (queries.length === 0) {
      logger.warn('[GSC Self-Learning] No queries in response');
      return createEmptyRecommendations();
    }
    

    // Analyze queries for opportunities
    const keywordOpportunities = analyzeKeywordOpportunities(queries);
    const contentThemes = extractContentThemes(queries);
    const highPerformingTopics = identifyHighPerformingTopics(queries);
    const positionImprovements = identifyPositionImprovements(queries);

    const recommendation: GSCPerformanceRecommendation = {
      recommendedKeywords: keywordOpportunities.slice(0, 20), // Top 20
      contentThemes: contentThemes.slice(0, 10), // Top 10 themes
      highPerformingTopics: highPerformingTopics.slice(0, 10), // Top 10 topics
      positionImprovements: positionImprovements.slice(0, 15), // Top 15 opportunities
    };

    return recommendation;
  } catch (error) {
    logger.error('[GSC Self-Learning] Error analyzing GSC performance:', error);
    return createEmptyRecommendations();
  }
}

/**
 * Analyzes queries to identify keyword opportunities
 */
function analyzeKeywordOpportunities(
  queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>
): Array<{
  keyword: string;
  clicks: number;
  impressions: number;
  position: number;
  opportunity: 'high' | 'medium' | 'low';
  reasoning: string;
}> {
  const opportunities: Array<{
    keyword: string;
    clicks: number;
    impressions: number;
    position: number;
    opportunity: 'high' | 'medium' | 'low';
    reasoning: string;
  }> = [];

  for (const query of queries) {
    if (!query.query || query.query.trim().length === 0) continue;

    let opportunity: 'high' | 'medium' | 'low' = 'low';
    let reasoning = '';

    // High opportunity: Positions 3-10 with good impressions
    if (query.position >= 3 && query.position <= 10 && query.impressions >= 100) {
      opportunity = 'high';
      reasoning = `Currently ranking at position ${query.position.toFixed(1)} with ${query.impressions} impressions. Good opportunity to move into top 3.`;
    }
    // Medium opportunity: Positions 11-20 with good impressions
    else if (query.position >= 11 && query.position <= 20 && query.impressions >= 50) {
      opportunity = 'medium';
      reasoning = `Currently ranking at position ${query.position.toFixed(1)} with ${query.impressions} impressions. Potential to improve ranking.`;
    }
    // High impressions but low clicks (optimization opportunity)
    else if (query.impressions >= 200 && query.ctr < 0.02 && query.position <= 15) {
      opportunity = 'medium';
      reasoning = `High impressions (${query.impressions}) but low CTR (${(query.ctr * 100).toFixed(1)}%). Title/description optimization opportunity.`;
    }
    // High clicks but could improve position
    else if (query.clicks >= 10 && query.position > 5) {
      opportunity = 'medium';
      reasoning = `Getting ${query.clicks} clicks at position ${query.position.toFixed(1)}. Could increase traffic with better ranking.`;
    }
    // Low opportunity but still valuable
    else if (query.impressions >= 20) {
      opportunity = 'low';
      reasoning = `Some visibility (${query.impressions} impressions) at position ${query.position.toFixed(1)}.`;
    } else {
      continue; // Skip queries with very low visibility
    }

    opportunities.push({
      keyword: query.query.trim(),
      clicks: query.clicks || 0,
      impressions: query.impressions || 0,
      position: query.position || 0,
      opportunity,
      reasoning
    });
  }

  // Sort by opportunity (high first), then by impressions
  opportunities.sort((a, b) => {
    const opportunityOrder = { high: 3, medium: 2, low: 1 };
    if (opportunityOrder[a.opportunity] !== opportunityOrder[b.opportunity]) {
      return opportunityOrder[b.opportunity] - opportunityOrder[a.opportunity];
    }
    return b.impressions - a.impressions;
  });

  return opportunities;
}

/**
 * Extracts content themes from queries using simple keyword grouping
 */
function extractContentThemes(
  queries: Array<{ query: string; clicks: number; impressions: number }>
): string[] {
  // Group queries by common words (simplified theme extraction)
  const wordFrequency = new Map<string, number>();
  
  for (const query of queries) {
    if (!query.query) continue;
    const words = query.query.toLowerCase().split(/\s+/);
    const weight = (query.clicks || 0) * 2 + (query.impressions || 0);
    
    for (const word of words) {
      if (word.length > 3 && !isStopWord(word)) {
        wordFrequency.set(word, (wordFrequency.get(word) || 0) + weight);
      }
    }
  }

  // Get top words as themes
  const themes = Array.from(wordFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);

  return themes;
}

/**
 * Identifies high-performing topics (queries with high clicks)
 */
function identifyHighPerformingTopics(
  queries: Array<{ query: string; clicks: number; impressions: number; position: number }>
): string[] {
  // Get queries with high clicks and good position
  const highPerformers = queries
    .filter(q => q.clicks >= 5 && q.position <= 10)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 30)
    .map(q => q.query.trim());

  return highPerformers;
}

/**
 * Identifies position improvement opportunities
 */
function identifyPositionImprovements(
  queries: Array<{ query: string; clicks: number; impressions: number; position: number }>
): Array<{
  keyword: string;
  currentPosition: number;
  opportunity: string;
}> {
  const improvements: Array<{
    keyword: string;
    currentPosition: number;
    opportunity: string;
  }> = [];

  for (const query of queries) {
    if (!query.query || query.position < 3 || query.position > 20) continue;
    if (query.impressions < 50) continue;

    const opportunity = query.position <= 10
      ? `Move from position ${query.position.toFixed(1)} to top 3 (${query.impressions} impressions)`
      : `Improve from position ${query.position.toFixed(1)} to top 10 (${query.impressions} impressions)`;

    improvements.push({
      keyword: query.query.trim(),
      currentPosition: query.position,
      opportunity
    });
  }

  // Sort by position (closer to top 3 is better opportunity)
  improvements.sort((a, b) => {
    if (a.currentPosition <= 10 && b.currentPosition > 10) return -1;
    if (a.currentPosition > 10 && b.currentPosition <= 10) return 1;
    return a.currentPosition - b.currentPosition;
  });

  return improvements;
}

/**
 * Checks if a word is a stop word (common words to ignore)
 */
function isStopWord(word: string): boolean {
  const stopWords = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
    'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go',
    'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
    'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them',
    'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
    'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first',
    'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day',
    'most', 'us', 'is', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must',
    'can', 'cannot', 'shall', 'ought'
  ]);

  return stopWords.has(word.toLowerCase());
}

/**
 * Creates empty recommendations structure
 */
function createEmptyRecommendations(): GSCPerformanceRecommendation {
  return {
    recommendedKeywords: [],
    contentThemes: [],
    highPerformingTopics: [],
    positionImprovements: []
  };
}

