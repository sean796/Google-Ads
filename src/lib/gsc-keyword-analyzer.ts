import { streamChatCompletion } from "./api";
import { getResearchModel } from "./optimization-settings-storage";

export interface GSCQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  date: string;
}

export interface AnalysisResult {
  method: string;
  methodLabel: string;
  keywords: GSCQuery[];
  insights?: string; // For AI analysis
}

export type AnalysisMethod = 
  | 'top_movers'
  | 'quick_wins'
  | 'high_opportunity'
  | 'declining_keywords'
  | 'rising_keywords'
  | 'high_intent'
  | 'content_gaps'
  | 'position_opportunities'
  | 'custom_ai_analysis';

export const ANALYSIS_METHODS: Record<AnalysisMethod, { label: string; description: string }> = {
  top_movers: {
    label: 'Top Movers',
    description: 'Keywords with significant position/CTR variance indicating movement'
  },
  quick_wins: {
    label: 'Quick Wins',
    description: 'Keywords ranking 11-20 that could easily move to page 1'
  },
  high_opportunity: {
    label: 'High Opportunity',
    description: 'High impressions but low CTR, indicating optimization potential'
  },
  declining_keywords: {
    label: 'Declining Keywords',
    description: 'Keywords with low CTR relative to impressions, showing decline patterns'
  },
  rising_keywords: {
    label: 'Rising Keywords',
    description: 'Keywords with high CTR and improving position patterns'
  },
  high_intent: {
    label: 'High Intent',
    description: 'Keywords with high CTR indicating strong user intent'
  },
  content_gaps: {
    label: 'Content Gaps',
    description: 'Keywords with impressions but zero clicks - content opportunities'
  },
  position_opportunities: {
    label: 'Position Opportunities',
    description: 'Keywords close to page 1 (positions 4-15) with high impressions'
  },
  custom_ai_analysis: {
    label: 'Custom AI Analysis',
    description: 'AI-powered insights and recommendations for keyword optimization'
  }
};

/**
 * Analyze keywords for top movers - significant position/CTR variance
 */
export function analyzeTopMovers(queries: GSCQuery[]): AnalysisResult {
  // Calculate variance metrics for each keyword
  // Top movers have high variance in position or CTR relative to their average
  const analyzed = queries.map(q => {
    // Position variance score (higher = more movement)
    const positionVariance = q.position > 0 ? Math.abs(q.position - 10) / 10 : 0;
    
    // CTR variance score (higher CTR relative to position = better)
    const expectedCTR = q.position <= 1 ? 0.3 : q.position <= 3 ? 0.15 : q.position <= 10 ? 0.05 : 0.01;
    const ctrVariance = q.ctr > expectedCTR ? (q.ctr - expectedCTR) / expectedCTR : 0;
    
    // Combined variance score
    const varianceScore = (positionVariance * 0.4) + (ctrVariance * 0.6);
    
    return {
      ...q,
      varianceScore
    };
  });

  // Sort by variance score and take top 20%
  const sorted = analyzed.sort((a, b) => (b.varianceScore || 0) - (a.varianceScore || 0));
  const topMovers = sorted.slice(0, Math.max(10, Math.floor(sorted.length * 0.2)));

  return {
    method: 'top_movers',
    methodLabel: ANALYSIS_METHODS.top_movers.label,
    keywords: topMovers.map(({ varianceScore, ...q }) => q)
  };
}

/**
 * Analyze keywords for quick wins - ranking 11-20, sorted by impressions
 */
export function analyzeQuickWins(queries: GSCQuery[]): AnalysisResult {
  const quickWins = queries
    .filter(q => q.position >= 11 && q.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 50); // Top 50 by impressions

  return {
    method: 'quick_wins',
    methodLabel: ANALYSIS_METHODS.quick_wins.label,
    keywords: quickWins
  };
}

/**
 * Analyze keywords for high opportunity - high impressions, low CTR, position 4-20
 */
export function analyzeHighOpportunity(queries: GSCQuery[]): AnalysisResult {
  // Calculate average impressions for context
  const avgImpressions = queries.reduce((sum, q) => sum + q.impressions, 0) / queries.length;
  
  const highOpportunity = queries
    .filter(q => 
      q.position >= 4 && 
      q.position <= 20 && 
      q.impressions >= avgImpressions * 0.5 && // Above average impressions
      q.ctr < 0.05 // Low CTR indicates opportunity
    )
    .sort((a, b) => {
      // Sort by opportunity score: (impressions * (1 - CTR)) / position
      const scoreA = (a.impressions * (1 - a.ctr)) / a.position;
      const scoreB = (b.impressions * (1 - b.ctr)) / b.position;
      return scoreB - scoreA;
    })
    .slice(0, 50);

  return {
    method: 'high_opportunity',
    methodLabel: ANALYSIS_METHODS.high_opportunity.label,
    keywords: highOpportunity
  };
}

/**
 * Analyze declining keywords - low CTR relative to impressions, declining position patterns
 */
export function analyzeDecliningKeywords(queries: GSCQuery[]): AnalysisResult {
  // Calculate average CTR for context
  const avgCTR = queries.reduce((sum, q) => sum + q.ctr, 0) / queries.length;
  
  const declining = queries
    .filter(q => 
      q.impressions > 0 &&
      q.ctr < avgCTR * 0.5 && // Below average CTR
      q.position > 10 // Poor position
    )
    .sort((a, b) => {
      // Sort by decline severity: (impressions * (avgCTR - actualCTR)) / position
      const declineScoreA = (a.impressions * (avgCTR - a.ctr)) / a.position;
      const declineScoreB = (b.impressions * (avgCTR - b.ctr)) / b.position;
      return declineScoreB - declineScoreA;
    })
    .slice(0, 50);

  return {
    method: 'declining_keywords',
    methodLabel: ANALYSIS_METHODS.declining_keywords.label,
    keywords: declining
  };
}

/**
 * Analyze rising keywords - high CTR, improving position patterns
 */
export function analyzeRisingKeywords(queries: GSCQuery[]): AnalysisResult {
  // Calculate average CTR for context
  const avgCTR = queries.reduce((sum, q) => sum + q.ctr, 0) / queries.length;
  
  const rising = queries
    .filter(q => 
      q.ctr > avgCTR * 1.5 && // Above average CTR
      q.position <= 15 && // Decent position
      q.clicks > 0 // Has clicks
    )
    .sort((a, b) => {
      // Sort by rising potential: (CTR * clicks) / position
      const risingScoreA = (a.ctr * a.clicks) / a.position;
      const risingScoreB = (b.ctr * b.clicks) / b.position;
      return risingScoreB - risingScoreA;
    })
    .slice(0, 50);

  return {
    method: 'rising_keywords',
    methodLabel: ANALYSIS_METHODS.rising_keywords.label,
    keywords: rising
  };
}

/**
 * Analyze high intent keywords - top 20% by CTR
 */
export function analyzeHighIntent(queries: GSCQuery[]): AnalysisResult {
  // Sort by CTR and take top 20%
  const sorted = queries
    .filter(q => q.clicks > 0 && q.ctr > 0)
    .sort((a, b) => b.ctr - a.ctr);
  
  const top20Percent = sorted.slice(0, Math.max(10, Math.floor(sorted.length * 0.2)));

  return {
    method: 'high_intent',
    methodLabel: ANALYSIS_METHODS.high_intent.label,
    keywords: top20Percent
  };
}

/**
 * Analyze content gaps - impressions but zero clicks
 */
export function analyzeContentGaps(queries: GSCQuery[]): AnalysisResult {
  const contentGaps = queries
    .filter(q => q.impressions > 0 && q.clicks === 0)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 50);

  return {
    method: 'content_gaps',
    methodLabel: ANALYSIS_METHODS.content_gaps.label,
    keywords: contentGaps
  };
}

/**
 * Analyze position opportunities - position 4-15, high impressions
 */
export function analyzePositionOpportunities(queries: GSCQuery[]): AnalysisResult {
  // Calculate average impressions for context
  const avgImpressions = queries.reduce((sum, q) => sum + q.impressions, 0) / queries.length;
  
  const opportunities = queries
    .filter(q => 
      q.position >= 4 && 
      q.position <= 15 && 
      q.impressions >= avgImpressions * 0.3 // Above average impressions
    )
    .sort((a, b) => {
      // Sort by opportunity: impressions / position (closer to page 1 = better)
      const opportunityA = a.impressions / a.position;
      const opportunityB = b.impressions / b.position;
      return opportunityB - opportunityA;
    })
    .slice(0, 50);

  return {
    method: 'position_opportunities',
    methodLabel: ANALYSIS_METHODS.position_opportunities.label,
    keywords: opportunities
  };
}

/**
 * Analyze keywords with AI using OpenRouter API
 */
export async function analyzeWithAI(
  queries: GSCQuery[],
  apiKey: string,
  model: string = getResearchModel(),
  temperature: number = 1.0,
  maxTokens: number = 4000,
  topP: number = 0.9,
  siteName?: string,
  siteUrl?: string
): Promise<AnalysisResult> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("OpenRouter API key is required for AI analysis");
  }

  // Prepare keyword data for AI (top 100 by impressions for context)
  const topQueries = queries
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 100);

  const systemPrompt = `You are an expert SEO strategist specializing in Google Search Console keyword analysis. Your role is to analyze GSC query data and provide actionable insights, prioritization, and optimization recommendations.

Analyze the provided keyword data and return a structured JSON response with:
1. Keyword prioritization (which keywords to focus on first)
2. Optimization recommendations (how to improve performance)
3. Content opportunities (what content to create or improve)
4. Competitive insights (what competitors might be doing)

Return ONLY valid JSON in this exact format:
{
  "prioritizedKeywords": [
    {
      "keyword": "example keyword",
      "priority": "high|medium|low",
      "reason": "why this keyword is prioritized"
    }
  ],
  "optimizationRecommendations": [
    "specific recommendation 1",
    "specific recommendation 2"
  ],
  "contentOpportunities": [
    {
      "keyword": "example keyword",
      "opportunity": "what content opportunity exists"
    }
  ],
  "insights": "overall strategic insights and recommendations"
}`;

  const userPrompt = `Analyze the following Google Search Console keyword data for ${siteName ? `the website "${siteName}" (${siteUrl || 'N/A'})` : 'this website'}:

Total Keywords: ${queries.length}
Date Range: ${queries[0]?.date || 'N/A'}

Top Keywords by Impressions:
${topQueries.slice(0, 30).map((q, idx) => 
  `${idx + 1}. "${q.query}" - Position: ${q.position.toFixed(1)}, Impressions: ${q.impressions}, Clicks: ${q.clicks}, CTR: ${(q.ctr * 100).toFixed(2)}%`
).join('\n')}

Key Metrics:
- Average Position: ${(queries.reduce((sum, q) => sum + q.position, 0) / queries.length).toFixed(2)}
- Average CTR: ${(queries.reduce((sum, q) => sum + q.ctr, 0) / queries.length * 100).toFixed(2)}%
- Total Impressions: ${queries.reduce((sum, q) => sum + q.impressions, 0).toLocaleString()}
- Total Clicks: ${queries.reduce((sum, q) => sum + q.clicks, 0).toLocaleString()}

Provide comprehensive analysis focusing on:
1. Which keywords should be prioritized for optimization
2. Specific optimization tactics (title tags, meta descriptions, content improvements)
3. Content gaps and opportunities
4. Strategic recommendations for improving overall search performance

Return ONLY the JSON object, no markdown, no explanations.`;

  let fullResponse = "";

  try {
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      maxTokens,
      topP,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
    });

    // Clean the response - remove markdown code blocks if present
    let cleanedResponse = fullResponse.trim();
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // Parse JSON response
    const parsed = JSON.parse(cleanedResponse) as {
      prioritizedKeywords?: Array<{ keyword: string; priority: string; reason: string }>;
      optimizationRecommendations?: string[];
      contentOpportunities?: Array<{ keyword: string; opportunity: string }>;
      insights?: string;
    };

    // Format insights as a readable string
    const insights = `AI Analysis Insights:

PRIORITIZED KEYWORDS:
${parsed.prioritizedKeywords?.map((kw) =>
  `- "${kw.keyword}" (${kw.priority}): ${kw.reason}`
).join('\n') || 'None provided'}

OPTIMIZATION RECOMMENDATIONS:
${parsed.optimizationRecommendations?.map((rec: string, idx: number) => 
  `${idx + 1}. ${rec}`
).join('\n') || 'None provided'}

CONTENT OPPORTUNITIES:
${parsed.contentOpportunities?.map((opp) =>
  `- "${opp.keyword}": ${opp.opportunity}`
).join('\n') || 'None provided'}

STRATEGIC INSIGHTS:
${parsed.insights || 'None provided'}`;

    // Return all queries with AI insights
    return {
      method: 'custom_ai_analysis',
      methodLabel: ANALYSIS_METHODS.custom_ai_analysis.label,
      keywords: queries, // Include all queries
      insights: insights
    };
  } catch (error) {
    console.error('[GSC AI Analysis] Error:', error);
    throw new Error(`AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Run multiple analyses based on selected methods
 */
export async function runAnalyses(
  queries: GSCQuery[],
  selectedMethods: AnalysisMethod[],
  aiOptions?: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    siteName?: string;
    siteUrl?: string;
  }
): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];

  for (const method of selectedMethods) {
    try {
      let result: AnalysisResult;

      switch (method) {
        case 'top_movers':
          result = analyzeTopMovers(queries);
          break;
        case 'quick_wins':
          result = analyzeQuickWins(queries);
          break;
        case 'high_opportunity':
          result = analyzeHighOpportunity(queries);
          break;
        case 'declining_keywords':
          result = analyzeDecliningKeywords(queries);
          break;
        case 'rising_keywords':
          result = analyzeRisingKeywords(queries);
          break;
        case 'high_intent':
          result = analyzeHighIntent(queries);
          break;
        case 'content_gaps':
          result = analyzeContentGaps(queries);
          break;
        case 'position_opportunities':
          result = analyzePositionOpportunities(queries);
          break;
        case 'custom_ai_analysis':
          if (!aiOptions?.apiKey) {
            console.warn('[GSC Analysis] Skipping AI analysis - no API key provided');
            continue;
          }
          result = await analyzeWithAI(
            queries,
            aiOptions.apiKey,
            aiOptions.model,
            aiOptions.temperature,
            aiOptions.maxTokens,
            aiOptions.topP,
            aiOptions.siteName,
            aiOptions.siteUrl
          );
          break;
        default:
          console.warn(`[GSC Analysis] Unknown analysis method: ${method}`);
          continue;
      }

      results.push(result);
    } catch (error) {
      console.error(`[GSC Analysis] Error running ${method}:`, error);
      // Continue with other analyses even if one fails
    }
  }

  return results;
}

