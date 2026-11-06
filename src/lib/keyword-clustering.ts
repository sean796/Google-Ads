import { streamChatCompletion } from "./api";
import type { KeywordData } from "./keyword-types";
import { getResearchModel } from "./optimization-settings-storage";
import { logger } from "@/lib/logger";

export interface KeywordCluster {
  id: string;
  name: string;
  description?: string;
  keywords: KeywordData[];
}

export interface ClusterKeywordsOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

/**
 * Cluster keywords using AI based on semantic similarity and topic
 */
export async function clusterKeywordsWithAI(
  keywords: KeywordData[],
  options: ClusterKeywordsOptions
): Promise<KeywordCluster[]> {
  const {
    apiKey,
    model = getResearchModel(),
    temperature = 1.0,
    maxTokens = 4000,
    topP = 0.9,
  } = options;

  if (!apiKey || !apiKey.trim()) {
    throw new Error("OpenRouter API key is required for keyword clustering");
  }

  if (!keywords || keywords.length === 0) {
    return [];
  }

  // Prepare keyword data for AI
  const keywordList = keywords.map((kw, idx) => ({
    index: idx,
    keyword: kw.keyword,
    searchVolume: kw.searchVolume,
    difficulty: kw.difficulty,
  }));

  const systemPrompt = `You are an expert SEO strategist specializing in keyword clustering and topic grouping. Your role is to analyze a list of keywords and group them into semantically related clusters based on topic similarity.

CRITICAL REQUIREMENTS:
1. Group keywords by semantic similarity and topic (e.g., "Flying Techniques", "Safety & Regulations", "Training & Education")
2. Create 3-8 clusters maximum for usability
3. Assign ALL keywords to a cluster - no keyword should be left unassigned
4. Give each cluster a descriptive, concise name (2-4 words)
5. Optionally provide a brief description for each cluster
6. Return valid JSON only - no markdown, no explanations

Cluster names should be:
- Descriptive and specific (e.g., "Flying Techniques", not "Group 1")
- Based on the common theme/topic of keywords in that cluster
- Concise (2-4 words typically)
- SEO-relevant (reflect what users are searching for)`;

  const userPrompt = `Analyze the following keywords and group them into semantically related clusters:

${JSON.stringify(keywordList, null, 2)}

Return a JSON array of clusters in this exact format:
[
  {
    "id": "cluster-1",
    "name": "Cluster Name",
    "description": "Brief description of what this cluster represents (optional)",
    "keywordIndices": [0, 2, 5]
  },
  {
    "id": "cluster-2",
    "name": "Another Cluster",
    "description": "Description here",
    "keywordIndices": [1, 3, 4]
  }
]

IMPORTANT:
- Use the "index" field from each keyword object to reference them in "keywordIndices"
- Every index from 0 to ${keywords.length - 1} must appear in exactly one cluster's keywordIndices array
- Create 3-8 clusters maximum
- Cluster names should be descriptive and SEO-relevant
- Return ONLY the JSON array, no markdown, no explanations`;

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
    const parsed = JSON.parse(cleanedResponse) as Array<{
      id: string;
      name: string;
      description?: string;
      keywordIndices: number[];
    }>;

    // Validate and build clusters
    const clusters: KeywordCluster[] = [];
    const usedIndices = new Set<number>();

    for (const clusterData of parsed) {
      if (!clusterData.id || !clusterData.name || !Array.isArray(clusterData.keywordIndices)) {
        continue;
      }

      // Filter out invalid indices and collect keywords
      const clusterKeywords: KeywordData[] = [];
      for (const idx of clusterData.keywordIndices) {
        if (typeof idx === "number" && idx >= 0 && idx < keywords.length && !usedIndices.has(idx)) {
          clusterKeywords.push(keywords[idx]);
          usedIndices.add(idx);
        }
      }

      // Only create cluster if it has keywords
      if (clusterKeywords.length > 0) {
        clusters.push({
          id: clusterData.id,
          name: clusterData.name,
          description: clusterData.description,
          keywords: clusterKeywords,
        });
      }
    }

    // Assign any unassigned keywords to an "Other" cluster
    const unassignedKeywords: KeywordData[] = [];
    for (let i = 0; i < keywords.length; i++) {
      if (!usedIndices.has(i)) {
        unassignedKeywords.push(keywords[i]);
      }
    }

    if (unassignedKeywords.length > 0) {
      clusters.push({
        id: "cluster-other",
        name: "Other",
        description: "Keywords that don't fit into other categories",
        keywords: unassignedKeywords,
      });
    }

    // Ensure we have at least one cluster
    if (clusters.length === 0) {
      // Fallback: single cluster with all keywords
      clusters.push({
        id: "cluster-all",
        name: "All Keywords",
        description: "All keywords grouped together",
        keywords: keywords,
      });
    }

    return clusters;
  } catch (error) {
    logger.error("Error in AI keyword clustering:", error);
    
    // Fallback: return single cluster with all keywords
    return [
      {
        id: "cluster-all",
        name: "All Keywords",
        description: "Clustering failed - all keywords shown together",
        keywords: keywords,
      },
    ];
  }
}

