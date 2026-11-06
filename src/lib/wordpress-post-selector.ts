/**
 * WordPress Post Selector
 * Uses AI to analyze and select relevant WordPress posts for blog keywords
 */

import { logger } from "@/lib/logger";
import { streamChatCompletion } from './api';
import { getResearchModel } from './optimization-settings-storage';
import type { PublishedPostsResult } from './wordpress-api';
import { getSiteCache } from './wordpress-site-cache';

export interface SelectedPost {
  id: number;
  slug: string;
  title: string;
  link: string;
  relevanceScore: number;
  reasoning: string;
}

export interface PostSelectionResult {
  selectedPosts: SelectedPost[];
  reasoning: string;
}

/**
 * Select relevant WordPress posts for a blog keyword using AI analysis
 * 
 * @param blogKeyword - The keyword for the blog post
 * @param blogTitle - The title of the blog post
 * @param postsMetadata - Array of WordPress post metadata (titles + meta only)
 * @param options - AI configuration options
 * @returns Promise resolving to PostSelectionResult with selected posts
 */
export async function selectRelevantPostsForBlog(
  blogKeyword: string,
  blogTitle: string,
  postsMetadata: PublishedPostsResult['posts'] = [],
  options: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    maxPosts?: number; // Maximum number of posts to select (default: 5)
    siteId?: string; // Optional site ID for cache lookup
  }
): Promise<PostSelectionResult> {
  const {
    apiKey,
    model = getResearchModel(),
    temperature = 0.7,
    maxTokens = 2000,
    topP = 0.9,
    maxPosts = 5,
    siteId,
  } = options;

  // Try to use cache if siteId is provided, otherwise use provided postsMetadata
  let postsToUse: PublishedPostsResult['posts'] = [];
  
  if (siteId && blogKeyword) {
    try {
      const cache = getSiteCache(siteId);
      if (cache) {
        const searchResults = cache.posts;
        postsToUse = searchResults.map(p => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          date_gmt: p.date_gmt,
          excerpt: p.excerpt,
          link: p.link
        }));
      } else {
        // Fallback to provided postsMetadata if cache not available
        postsToUse = postsMetadata || [];
      }
    } catch (error) {
      logger.warn('[WordPress Post Selector] Error using cache, falling back to provided postsMetadata:', error);
      postsToUse = postsMetadata || [];
    }
  } else {
    // Use provided postsMetadata
    postsToUse = postsMetadata || [];
  }

  if (!postsToUse || postsToUse.length === 0) {
    return {
      selectedPosts: [],
      reasoning: 'No WordPress posts available for analysis.',
    };
  }

  // Build post metadata list for AI analysis
  // CRITICAL: Only include internal links (URLs and titles) - no excerpts to save tokens and improve quality
  const postsList = postsToUse
    .map((post, index) => {
      const postLink = post.link || '';
      return `${index + 1}. "${post.title}"\n   URL: ${postLink}`;
    })
    .join('\n\n');

  const systemPrompt = `You are an expert SEO content strategist. Your task is to analyze WordPress posts and select the most relevant ones for a specific blog post based on keyword relevance and internal link structure.

CRITICAL: You are ONLY provided with post titles and internal link URLs. Use these to determine relevance - focus on URL structure, path patterns, and title keywords rather than full content analysis.

CRITICAL REQUIREMENTS:
- You MUST select at least 1 post per blog idea (unless there are literally no posts available)
- Select posts that are relevant to the blog keyword and title (semantic relevance is acceptable)
- Consider semantic relevance, not just exact keyword matches - even loosely related posts are better than none
- Prioritize posts that would provide valuable context or supporting information
- Select between 1 and ${maxPosts} posts (prefer more posts if relevance is decent, but always select at least 1)
- Provide a relevance score (0-100) for each selected post
- Include clear reasoning for each selection
- If multiple posts exist, always select at least the most relevant one - never return empty selection unless there are truly no posts

Return ONLY a valid JSON object with this exact structure:
{
  "selectedPosts": [
    {
      "id": <post_id_number>,
      "slug": "<post_slug>",
      "title": "<post_title>",
      "link": "<post_url>",
      "relevanceScore": <score_0_to_100>,
      "reasoning": "<brief_explanation>"
    }
  ],
  "reasoning": "<overall_explanation_of_selection_strategy>"
}

CRITICAL: When returning the "link" field, you MUST use the EXACT link URL from the "Available WordPress Posts" list above. Do NOT create, invent, or generate URLs. Use the actual link from the post you selected from the list.`;

  const userPrompt = `Blog Keyword: "${blogKeyword}"
Blog Title: "${blogTitle}"

Available WordPress Posts (${postsToUse.length} total${siteId ? ` - from cache search` : ''}):
${postsList}

Analyze these posts and select the most relevant ones for the blog post about "${blogKeyword}" with title "${blogTitle}".

Consider:
1. How well each post's title and URL structure relates to the keyword and title (semantic relevance is acceptable)
2. Whether the internal link URL path suggests relevant content based on URL structure and title keywords
3. The semantic relevance based on title keywords and URL patterns - even loosely related posts are valuable
4. The value each post's internal link would add to the blog content based on URL structure and title

CRITICAL: You MUST select at least 1 post. If no posts are highly relevant, select the most relevant one(s) anyway. Never return an empty selection. Select the top ${maxPosts} most relevant posts (minimum 1 post required). Return the JSON response with selected posts, relevance scores, and reasoning.`;

  let fullResponse = '';

  try {
    await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      maxTokens,
      topP,
      onContentChunk: (chunk) => {
        fullResponse += chunk;
      },
    });

    // Parse JSON response
    // Try to extract JSON from the response (may have markdown code blocks)
    let jsonStr = fullResponse.trim();
    
    // Remove markdown code blocks if present
    if (jsonStr.includes('```')) {
      const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
    }
    
    // Try to find JSON object in the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    let result: PostSelectionResult;
    try {
      // Fix double-wrapped objects before parsing
      jsonStr = jsonStr.replace(/\{\s*\{/g, '{').replace(/\}\s*\}/g, '}');
      result = JSON.parse(jsonStr) as PostSelectionResult;
    } catch (parseError) {
      // If parsing fails, return empty - the fallback below will select the first post
      logger.warn('[WordPress Post Selector] JSON parse failed, will use fallback selection:', parseError);
      result = {
        selectedPosts: [],
        reasoning: 'Failed to parse AI response - will use fallback'
      };
    }

    // Validate and clean up the result
    if (!result.selectedPosts || !Array.isArray(result.selectedPosts)) {
      throw new Error('Invalid response format: missing selectedPosts array');
    }

    // Ensure all required fields are present and limit to maxPosts
    let selectedPosts = result.selectedPosts
      .slice(0, maxPosts)
      .map((post) => {
        // Find the original post metadata to ensure we have correct data
        const originalPost = postsToUse.find((p) => p.id === post.id);
        if (!originalPost) {
          return null;
        }

        return {
          id: post.id,
          slug: originalPost.slug, // ALWAYS use original post data from API/cache
          title: originalPost.title, // ALWAYS use original post data from API/cache
          link: originalPost.link, // CRITICAL: ALWAYS use original link from WordPress API/cache, never AI-generated link
          relevanceScore: Math.max(0, Math.min(100, post.relevanceScore || 50)),
          reasoning: post.reasoning || 'Selected by AI analysis',
        };
      })
      .filter((post): post is SelectedPost => post !== null);

    // CRITICAL: If no posts were selected, select the first available post as fallback
    // This ensures every blog idea gets at least 1 WordPress post
    if (selectedPosts.length === 0 && postsToUse.length > 0) {
      const fallbackPost = postsToUse[0];
      selectedPosts = [{
        id: fallbackPost.id,
        slug: fallbackPost.slug,
        title: fallbackPost.title,
        link: fallbackPost.link || '',
        relevanceScore: 50, // Neutral score for fallback
        reasoning: 'Selected as fallback to ensure blog idea has associated WordPress post for context',
      }];
      logger.warn(`[WordPress Post Selector] No posts selected for blog "${blogTitle}", using fallback: ${fallbackPost.title}`);
    }

    return {
      selectedPosts,
      reasoning: result.reasoning || 'Posts selected based on keyword and title relevance.',
    };
  } catch (error) {
    logger.error('[WordPress Post Selector] Error parsing AI response:', error);
    logger.error('[WordPress Post Selector] Raw response:', fullResponse);
    
    // Fallback: return empty selection with error message
    return {
      selectedPosts: [],
      reasoning: `Error analyzing posts: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Select relevant posts for multiple blog keywords
 * Processes each blog keyword and returns selections per blog
 * 
 * @param blogData - Array of blog data with keywords and titles
 * @param postsMetadata - Array of WordPress post metadata
 * @param options - AI configuration options
 * @returns Promise resolving to map of blog index to selected posts
 */
export async function selectRelevantPostsForMultipleBlogs(
  blogData: Array<{ keyword: string; title: string }>,
  postsMetadata: PublishedPostsResult['posts'] = [],
  options: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    maxPosts?: number;
  }
): Promise<Map<number, PostSelectionResult>> {
  const results = new Map<number, PostSelectionResult>();

  // Process each blog sequentially to avoid overwhelming the API
  for (let i = 0; i < blogData.length; i++) {
    const blog = blogData[i];
    try {
      const selection = await selectRelevantPostsForBlog(
        blog.keyword,
        blog.title,
        postsMetadata,
        options
      );
      results.set(i, selection);
    } catch (error) {
      logger.error(`[WordPress Post Selector] Error selecting posts for blog #${i + 1}:`, error);
      // Continue with fallback - select at least 1 post
      // Note: postsMetadata is still used here for backward compatibility
      if (postsMetadata.length > 0) {
        const fallbackPost = postsMetadata[0];
        results.set(i, {
          selectedPosts: [{
            id: fallbackPost.id,
            slug: fallbackPost.slug,
            title: fallbackPost.title,
            link: fallbackPost.link || '',
            relevanceScore: 50,
            reasoning: `Fallback selection due to error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
          reasoning: `Error occurred during selection, using fallback post: ${fallbackPost.title}`,
        });
      } else {
        // No posts available at all
        results.set(i, {
          selectedPosts: [],
          reasoning: 'No WordPress posts available and selection failed',
        });
      }
    }
  }

  return results;
}

