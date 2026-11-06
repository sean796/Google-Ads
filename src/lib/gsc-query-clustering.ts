import { streamChatCompletion } from "./api";
import { getResearchModel } from "./optimization-settings-storage";
import { isNonEnglishKeyword } from "./gsc-query-processor";
import { logger } from "@/lib/logger";

export interface GSCQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface QueryCluster {
  name: string;
  description: string;
  queries: GSCQuery[];
  characteristics: {
    intent: 'informational' | 'navigational' | 'commercial' | 'transactional' | 'local' | 'mixed';
    isLocal: boolean;
    locationKeywords?: string[];
    avgPosition: number;
    totalClicks: number;
    totalImpressions: number;
    avgCtr: number;
  };
  recommendation: {
    priority: 'high' | 'medium' | 'low';
    reasoning: string;
    suggestedKeyword?: string;
  };
}

export interface GSCQueryClusterAnalysis {
  clusters: QueryCluster[];
  overallRecommendation: {
    topCluster: string;
    recommendedKeyword: string;
    reasoning: string;
    alternativeOptions: Array<{
      keyword: string;
      reason: string;
    }>;
  };
  insights: {
    localPresence: boolean;
    intentDistribution: Record<string, number>;
    topPerformingCluster: string;
    opportunityClusters: string[];
  };
}

export interface ClusterGSCQueriesOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  siteUrl?: string;
  pageUrl?: string;
  companyName?: string; // For entity pages - exclude keywords containing this
}

/**
 * Cluster and analyze GSC queries with AI to provide recommendations
 */
export async function clusterGSCQueriesWithAI(
  queries: GSCQuery[],
  options: ClusterGSCQueriesOptions
): Promise<GSCQueryClusterAnalysis> {
  const {
    apiKey,
    model = getResearchModel(),
    temperature = 0.2, // Low temperature for deterministic JSON output
    maxTokens = 4000,
    topP = 0.9,
    siteUrl,
    pageUrl,
    companyName
  } = options;

  if (!apiKey || !apiKey.trim()) {
    throw new Error("OpenRouter API key is required for query clustering");
  }

  if (!queries || queries.length === 0) {
    throw new Error("No queries provided for clustering");
  }

  // Let clustering AI handle all filtering (English, competitors, etc.)
  const queriesToAnalyze = queries;

  const systemPrompt = `You are an expert SEO strategist specializing in Google Search Console query analysis and keyword clustering. Your role is to analyze GSC queries, group them into meaningful clusters, identify intent, detect local vs non-local queries, and provide strategic recommendations for which keyword to optimize for.

=== ABSOLUTE MANDATORY RULES - NEVER VIOLATE ===
1. **ENGLISH ONLY**: You MUST ONLY recommend keywords that are in ENGLISH. NEVER recommend keywords in Spanish, French, German, Portuguese, or ANY other non-English language. If a keyword contains non-English words (e.g., "para que sirve", "como se usa", "qué es", "où acheter"), it is AUTOMATICALLY DISQUALIFIED regardless of its traffic metrics.
2. **NO PERSON NAMES**: NEVER recommend keywords containing people's names (first names, last names, or full names). Product/service keywords ONLY.
3. **PERFECT JSON OUTPUT**: You MUST return ONLY valid JSON. NO markdown code blocks (do NOT use \`\`\`json or \`\`\`), NO explanations, NO text outside the JSON. Start your response with { and end with }. The JSON must be parseable by JSON.parse() without any errors. Every bracket, brace, comma, and quote must be correct. Double-check your JSON syntax before responding. CRITICAL: Your response must be complete - do not truncate the JSON.
4. These rules override ALL other considerations including traffic, clicks, position, or any other metric.
=== END ABSOLUTE MANDATORY RULES ===

REQUIREMENTS:
1. Cluster queries into meaningful groups (any number is fine - 1, 2, 3, or more). Cluster based on:
   - Semantic similarity (similar topics/themes)
   - Search intent (informational, commercial, transactional, navigational, local)
   - Query structure (short-tail vs long-tail, question format, etc.)
   - Geographic/local indicators

2. For each cluster, provide:
   - name: string (cluster name)
   - description: string (what this cluster represents)
   - queries: array of query objects with query, clicks, impressions, ctr, position
   - characteristics: object with intent, isLocal, locationKeywords (array), avgPosition, totalClicks, totalImpressions, avgCtr
   - recommendation: object with priority, reasoning, suggestedKeyword

3. Provide overallRecommendation:
   - topCluster: string (name of top cluster)
   - recommendedKeyword: string (MUST be exactly one of the provided queries)
   - reasoning: string (why this keyword)
   - alternativeOptions: array of {keyword: string, reason: string}

4. Provide insights:
   - localPresence: boolean
   - intentDistribution: object mapping intent types to counts
   - topPerformingCluster: string
   - opportunityClusters: array of cluster names

CRITICAL JSON FORMAT REQUIREMENTS:
- Return ONLY the JSON object, no markdown, no code blocks, no explanations
- Every opening bracket { must have a closing bracket }
- Every opening array [ must have a closing array ]
- Every property name must be in double quotes
- Every string value must be in double quotes
- Use commas correctly between array elements and object properties
- NO trailing commas before closing brackets/braces
- NO extra closing brackets like ]] or }}
- Validate your JSON structure matches this exact schema before responding

EXACT JSON SCHEMA YOU MUST FOLLOW:
{
  "clusters": [
    {
      "name": "string",
      "description": "string",
      "queries": [
        {
          "query": "string",
          "clicks": number,
          "impressions": number,
          "ctr": number,
          "position": number
        }
      ],
      "characteristics": {
        "intent": "informational" | "navigational" | "commercial" | "transactional" | "local" | "mixed",
        "isLocal": boolean,
        "locationKeywords": ["string"],
        "avgPosition": number,
        "totalClicks": number,
        "totalImpressions": number,
        "avgCtr": number
      },
      "recommendation": {
        "priority": "high" | "medium" | "low",
        "reasoning": "string",
        "suggestedKeyword": "string"
      }
    }
  ],
  "overallRecommendation": {
    "topCluster": "string",
    "recommendedKeyword": "string",
    "reasoning": "string",
    "alternativeOptions": [
      {
        "keyword": "string",
        "reason": "string"
      }
    ]
  },
  "insights": {
    "localPresence": boolean,
    "intentDistribution": {},
    "topPerformingCluster": "string",
    "opportunityClusters": ["string"]
  }
}`;

  // Prepare query data for AI (using filtered English-only queries)
  const queryData = queriesToAnalyze.map(q => ({
    query: q.query,
    clicks: q.clicks,
    impressions: q.impressions,
    ctr: q.ctr,
    position: q.position
  }));

  const userPrompt = `Analyze and cluster the following Google Search Console queries for optimization.

**CRITICAL - READ FIRST**: You MUST ONLY recommend ENGLISH keywords. Any keyword in Spanish, French, or other non-English languages (e.g., "para que sirve", "como se usa", "qué es") is AUTOMATICALLY DISQUALIFIED regardless of traffic stats. Skip these entirely.

${siteUrl ? `Site URL: ${siteUrl}` : ''}
${pageUrl ? `Page URL: ${pageUrl}` : ''}
${companyName ? `Company Name: "${companyName}" - DO NOT recommend keywords containing this company name. Exclude any queries that contain "${companyName}" from your recommendations.` : ''}

GSC Queries (${queriesToAnalyze.length} total - these have already been filtered to remove competitor business names AND non-English keywords, so they are all English product/service-focused):
${JSON.stringify(queryData, null, 2)}

Instructions (be flexible and lenient):
1. Group queries into meaningful clusters (any number is fine - could be 1 cluster if they're all similar, or multiple if they differ)
2. Identify local queries if location keywords are present (city names, "near me", etc.)
3. Analyze performance metrics for each cluster (if multiple clusters exist)
4. Determine intent for clusters (informational, commercial, transactional, navigational, local, or mixed)
5. MOST IMPORTANT: Recommend the SINGLE BEST keyword from the provided queries to optimize for based on:
   - Traffic potential (clicks + impressions)
   - Optimization opportunity (position, CTR - positions 3-10 are good opportunities)
   - Strategic value (intent alignment, local vs non-local)
   - MUST be product/service-focused (competitor names already filtered out)
   ${companyName ? `- MUST NOT contain the company name "${companyName}"` : ''}
   - MUST be in English only - NEVER recommend keywords in Spanish, French, or any other non-English language
   - MUST NOT contain any person's name (first names, last names, or full names) - only recommend product/service keywords

6. Provide clear reasoning for your recommendation
${companyName ? `7. CRITICAL: If all queries contain "${companyName}", still analyze them but note this in your reasoning. However, prioritize any queries that don't contain the company name.` : ''}

CRITICAL RULES (NEVER VIOLATE):
- The recommended keyword MUST be exactly one of the queries from the list above. Do not create new keywords.
- All queries provided are already product/service-focused (competitor business names have been filtered out).
- **ENGLISH ONLY - ABSOLUTE REQUIREMENT**: NEVER recommend keywords in Spanish (e.g., "para que sirve", "como se usa"), French, German, Portuguese, or ANY other non-English language. If a keyword is not in English, it is AUTOMATICALLY DISQUALIFIED even if it has the best traffic stats.
- **NO PERSON NAMES**: NEVER recommend keywords containing people's names - product/service keywords ONLY.
- If ALL high-traffic keywords are non-English, you MUST still recommend an ENGLISH keyword even if it has lower traffic.

CRITICAL JSON OUTPUT REQUIREMENTS - VALIDATION CHECKLIST:
Before you respond, you MUST validate your JSON:
1. Count opening braces { and closing braces } - they must be equal
2. Count opening brackets [ and closing brackets ] - they must be equal  
3. Check for trailing commas - remove any comma before } or ]
4. Check for double brackets - remove any ]] or }} patterns
5. Ensure every property name is in double quotes
6. Ensure every string value is in double quotes
7. Ensure numbers are not quoted
8. Ensure booleans are true/false (not "true"/"false")
9. Test your JSON mentally: can it be parsed by JSON.parse()? If not, fix it.

MANDATORY OUTPUT FORMAT:
- Return ONLY the raw JSON object
- NO markdown code blocks (no \`\`\`json or \`\`\`)
- NO explanations before or after
- NO text outside the JSON
- Start with { and end with }
- The entire response must be valid JSON that passes JSON.parse()

Return ONLY the JSON object following the exact schema. Validate it before sending.`;

  let fullResponse = "";
  let finishReason: string | null = null;

  try {
    const actualTemperature = Math.min(temperature, 0.2); // Very low temperature for deterministic JSON output
    const actualMaxTokens = Math.max(maxTokens || 4000, 8000); // Increased to 8000 to prevent truncation

    // Use streamChatCompletion with finish_reason callback
    const result = await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: actualTemperature,
      maxTokens: actualMaxTokens,
      topP,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
      onFinishReason: (reason) => {
        finishReason = reason;
      },
    });
    
    // Capture finish_reason from result if not already captured
    if (result.finishReason && !finishReason) {
      finishReason = result.finishReason;
    }

    // Validate response completeness
    if (finishReason === 'length') {
      throw new Error(`AI response was truncated (finish_reason: length). Response length: ${fullResponse.length} characters. Increase maxTokens or reduce query data size.`);
    }

    // Clean markdown code blocks if present (but AI should not include them)
    let cleanedResponse = fullResponse.trim();
    
    // Aggressively remove markdown
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    }
    
    // Extract JSON object if wrapped in text
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedResponse = jsonMatch[0];
    }

    // Validate JSON completeness before parsing
    const bracketBalance = (cleanedResponse.match(/\{/g) || []).length - (cleanedResponse.match(/\}/g) || []).length;
    const arrayBalance = (cleanedResponse.match(/\[/g) || []).length - (cleanedResponse.match(/\]/g) || []).length;
    
    if (bracketBalance !== 0 || arrayBalance !== 0) {
      throw new Error(`JSON structure is incomplete. Bracket balance: ${bracketBalance}, Array balance: ${arrayBalance}. Response may be truncated. Finish reason: ${finishReason || 'unknown'}`);
    }
    
    if (!cleanedResponse.trim().endsWith('}')) {
      throw new Error(`JSON response does not end with closing brace. Response may be truncated. Finish reason: ${finishReason || 'unknown'}`);
    }

    // Parse JSON - NO REPAIR, NO FALLBACK - AI must get it right
    interface RawQueryCluster {
      name?: string;
      description?: string;
      queries?: GSCQuery[];
      characteristics?: Partial<QueryCluster["characteristics"]>;
      recommendation?: Partial<QueryCluster["recommendation"]>;
    }
    const parsed = JSON.parse(cleanedResponse) as {
      clusters?: RawQueryCluster[];
      overallRecommendation?: {
        topCluster?: string;
        recommendedKeyword?: string;
        reasoning?: string;
        alternativeOptions?: Array<{ keyword: string; reason: string }>;
      };
      recommendedKeyword?: string;
      reasoning?: string;
      insights?: {
        localPresence?: boolean;
        intentDistribution?: Record<string, number>;
        topPerformingCluster?: string;
        opportunityClusters?: string[];
      };
    };

    // AI-FORWARD: Use AI's recommendation directly without validation or matching
    // If AI provides a recommendation, trust it completely
    let recommendedKeyword = parsed.overallRecommendation?.recommendedKeyword || 
                            parsed.recommendedKeyword || "";
    
    // Only use fallback if AI provided no recommendation at all
    if (!recommendedKeyword || typeof recommendedKeyword !== 'string' || recommendedKeyword.trim().length === 0) {
      if (queriesToAnalyze.length > 0 && queriesToAnalyze[0]?.query && typeof queriesToAnalyze[0].query === 'string') {
        // Fallback: use top query by clicks/impressions only if AI didn't recommend anything
        recommendedKeyword = queriesToAnalyze[0].query;
      } else {
        // Fallback if no valid queries
        recommendedKeyword = '';
      }
    } else {
      // AI provided a recommendation - use it directly, no validation, no matching
    }

    // Build clusters array (handle missing or malformed clusters)
    let clusters: QueryCluster[] = [];
    if (Array.isArray(parsed.clusters) && parsed.clusters.length > 0) {
      clusters = parsed.clusters.map((cluster) => {
        // Ensure cluster has required structure
        return {
          name: cluster.name || "Unnamed Cluster",
          description: cluster.description || "",
          queries: Array.isArray(cluster.queries) ? cluster.queries : [],
          characteristics: {
            intent: cluster.characteristics?.intent || "mixed",
            isLocal: cluster.characteristics?.isLocal || false,
            locationKeywords: cluster.characteristics?.locationKeywords || [],
            avgPosition: cluster.characteristics?.avgPosition || 0,
            totalClicks: cluster.characteristics?.totalClicks || 0,
            totalImpressions: cluster.characteristics?.totalImpressions || 0,
            avgCtr: cluster.characteristics?.avgCtr || 0
          },
          recommendation: {
            priority: cluster.recommendation?.priority || "medium",
            reasoning: cluster.recommendation?.reasoning || "",
            suggestedKeyword: cluster.recommendation?.suggestedKeyword || cluster.queries?.[0]?.query || ""
          }
        };
      });
    } else {
      // If no clusters provided, create a single cluster with all queries
      // Filter out invalid queries first (use our English-filtered queries)
      const validQueriesForCluster = queriesToAnalyze.filter(q => 
        q && 
        typeof q === 'object' && 
        q.query && 
        typeof q.query === 'string' &&
        q.query.trim().length > 0 &&
        !isNonEnglishKeyword(q.query) // Extra safety check
      );
      
      clusters = [{
        name: "All Queries",
        description: "All queries grouped together",
        queries: validQueriesForCluster,
        characteristics: {
          intent: "mixed",
          isLocal: validQueriesForCluster.some(q => 
            q.query && typeof q.query === 'string' && /jensen beach|near me|local/i.test(q.query)
          ),
          locationKeywords: [],
          avgPosition: validQueriesForCluster.length > 0 
            ? validQueriesForCluster.reduce((sum, q) => sum + (q.position || 0), 0) / validQueriesForCluster.length 
            : 0,
          totalClicks: validQueriesForCluster.reduce((sum, q) => sum + (q.clicks || 0), 0),
          totalImpressions: validQueriesForCluster.reduce((sum, q) => sum + (q.impressions || 0), 0),
          avgCtr: validQueriesForCluster.length > 0
            ? validQueriesForCluster.reduce((sum, q) => sum + (q.ctr || 0), 0) / validQueriesForCluster.length
            : 0
        },
        recommendation: {
          priority: "high",
          reasoning: "Combined analysis of all queries",
          suggestedKeyword: recommendedKeyword || (validQueriesForCluster[0]?.query || '')
        }
      }];
    }

    // Build final analysis with all fields guaranteed
    // AI-FORWARD: Use alternative options directly from AI without filtering
    const filteredAlternatives = Array.isArray(parsed.overallRecommendation?.alternativeOptions) 
      ? parsed.overallRecommendation.alternativeOptions.filter((alt) =>
          alt && alt.keyword && typeof alt.keyword === 'string'
        )
      : [];
    
    const analysis: GSCQueryClusterAnalysis = {
      clusters: clusters,
      overallRecommendation: {
        topCluster: parsed.overallRecommendation?.topCluster || clusters[0]?.name || "",
        recommendedKeyword: recommendedKeyword,
        reasoning: parsed.overallRecommendation?.reasoning || 
                   parsed.reasoning || 
                   `Recommended based on ${queriesToAnalyze[0]?.clicks || queriesToAnalyze[0]?.impressions || 0} ${queriesToAnalyze[0]?.clicks ? 'clicks' : 'impressions'} and position ${queriesToAnalyze[0]?.position?.toFixed(1) || 'N/A'}`,
        alternativeOptions: filteredAlternatives
      },
      insights: {
        localPresence: parsed.insights?.localPresence ?? queriesToAnalyze.some(q => /jensen beach|near me|local/i.test(q.query)),
        intentDistribution: parsed.insights?.intentDistribution || {},
        topPerformingCluster: parsed.insights?.topPerformingCluster || clusters[0]?.name || "",
        opportunityClusters: Array.isArray(parsed.insights?.opportunityClusters) 
          ? parsed.insights.opportunityClusters 
          : []
      }
    };

    return analysis;
  } catch (error) {
    logger.error('[GSC Clustering] Error analyzing queries:', error);
    throw new Error(`Failed to cluster GSC queries: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

