import { loadApiKey, streamChatCompletion } from "@/lib/api";
import { appendUniversalContentRulesToSystemPrompt } from "@/lib/content-word-blocklist";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import { BULK_WORDPRESS_POST_TITLE_RULE, META_DESCRIPTION_ANTI_CLICKBAIT_RULE } from "@/lib/prompt-builders/title-rules";

export interface OptimizedMetaFields {
  [key: string]: any;
}

/**
 * Generate optimized meta fields using AI based on post content
 * 
 * @param postContent - Full post content (HTML or markdown)
 * @param postTitle - Post title
 * @param metaDescription - Meta description (not excerpt)
 * @param primaryKeyword - Primary keyword for SEO
 * @param existingMeta - Existing meta fields from WordPress
 * @param siteUrl - Site URL for canonical URL generation
 * @param postLink - Post link/URL
 * 
 * @returns Promise resolving to OptimizedMetaFields object
 */
export async function generateOptimizedMetaFields(
  postContent: string,
  postTitle: string,
  metaDescription: string | undefined,
  primaryKeyword: string,
  existingMeta: Record<string, any>,
  siteUrl: string,
  postLink?: string,
  isPage?: boolean,
  siteId?: string,
  gscKeywordsContext?: string,
  /** When set, primary intent context; raw GSC JSON is omitted from the prompt. */
  seoResearchBrief?: string,
): Promise<OptimizedMetaFields> {
  const briefTrimmed =
    typeof seoResearchBrief === "string" ? seoResearchBrief.trim() : "";
  const hasBrief = briefTrimmed.length > 0;
  const hasGsc =
    !hasBrief &&
    typeof gscKeywordsContext === "string" &&
    gscKeywordsContext.trim().length > 0;

  const openRouterApiKey = loadApiKey();
  if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
    throw new Error('OpenRouter API key not found. Please set it in settings.');
  }

  await ensureMasterInstructionsInMemory(siteId);

  // Extract text content from HTML if needed
  let textContent = postContent;
  if (postContent.includes('<') && postContent.includes('>')) {
    // Remove HTML tags for analysis
    textContent = postContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Limit content length for AI processing (keep first 5000 chars)
  const limitedContent = textContent.substring(0, 5000);
  // Handle meta description safely - it may be undefined
  const limitedMetaDescription = metaDescription 
    ? metaDescription.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300)
    : '';

  // Exclude heavy/Elementor fields from prompt to avoid AI echoing them and producing malformed JSON
  const EXCLUDE_FROM_PROMPT = new Set([
    '_elementor_data',
    '_elementor_edit_mode',
    '_elementor_template_type',
    '_elementor_css',
    '_elementor_page_settings',
  ]);
  const MAX_META_VALUE_LENGTH = 2000;
  const existingMetaForPrompt: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(existingMeta)) {
    if (EXCLUDE_FROM_PROMPT.has(k)) continue;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (s.length > MAX_META_VALUE_LENGTH) continue;
    existingMetaForPrompt[k] = v;
  }

  // Build system prompt
  const systemPrompt = `You are a senior SEO content specialist optimizing WordPress SEO meta fields. Analyze the post and write accurate, neutral titles and descriptions aligned with search intent.

CRITICAL REQUIREMENTS:
1. SEO title: Act as a senior SEO content title specialist. Must be 50-60 characters, include primary keyword naturally near the BEGINNING (first few words), and be accurate, specific, and neutral. Treat the title as a neutral page label, not an advertisement. Reject clickbait, sensationalism, manufactured urgency, exaggerated importance, empty promotional claims, sales-driven calls to action, and immediate-action or acquisition framing. Avoid promotional hype verbs and marketing stock language such as boost, maximize, unlock, and similar. Do NOT prepend site name, business name, or brand. Forbidden: leading company/site before the topic (e.g. "Brand | …", "Brand – …", "Company: …", or "EJH Distribution …"). Output ONLY the topic-focused SEO title text - the same rule applies to Facebook and Twitter titles (no brand prefix; topic only)
2. Meta description: Write a grammatically natural, fluent 140-155 character sentence in standard sentence case. Weave the topic words from the Focus Keyword naturally with prepositions/articles (never shove the raw keyword at the start with a colon or force an ungrammatical keyword string).${isPage ? ' Naturally weave the page topic into the opening clause, then continue with a clear value proposition.' : ' Do NOT copy the post title verbatim; summarize the concrete value and specifics of the article in natural prose.'}
${META_DESCRIPTION_ANTI_CLICKBAIT_RULE}
3. Focus keyword: Use the exact primary keyword provided
4. Canonical URL: Use the post link if provided, otherwise construct from site URL and title
5. Robots meta: Preserve existing value or use ["index", "follow"] if not present
6. Social meta: Optimize Facebook and Twitter titles/descriptions (can be longer than SEO title/description)
7. Preserve ALL other existing meta fields - only optimize the SEO title, meta description, focus keyword, canonical URL, robots, and social title/description fields
8. Never invent patient/customer testimonials, review quotes, star ratings, or fake attributions (e.g. "Name, Local Resident") in the meta description, Facebook/Twitter descriptions, or any meta field. If the page content does not include a real quoted testimonial supplied by the site, do not add testimonial-style copy - use factual, benefit-focused SEO text only.
${hasBrief ? `
SEO CONTENT BRIEF: Structured JSON (SERP highlights, GSC queries, Semrush keywords/URLs) is in the user message. Use it as the **primary** signal for intent and angles when writing the SEO title, meta description, and social fields. Do NOT paste JSON into outputs; write fresh, concise copy.
` : ""}${hasGsc ? `
SEARCH CONSOLE QUERIES: Real Google search queries for this page are in the user message as JSON (gsc_keywords_for_url + rows). Pick the **strongest 10–20** phrasings that fit the title and meta intent; you do **not** need to echo every query. Use them as inspiration for intent and wording in the SEO title, meta description, and social fields. Do NOT paste or list queries, do NOT keyword-stuff, do NOT copy wording verbatim - write fresh copy within the character limits.
` : ''}
Return ONLY a valid JSON object. Use the exact same meta field keys as in EXISTING META FIELDS for the SEO title, meta description, focus keyword, canonical URL, robots, and social fields you optimize.

Character limits are STRICT:
- SEO Title: 50-60 characters (optimal: 55). Count before returning; if over 60, rewrite shorter with a complete last word (never end mid-word).
- Meta Description: 150-160 characters (optimal: 155)
- Social titles can be up to 70 characters
- Social descriptions can be up to 200 characters

${BULK_WORDPRESS_POST_TITLE_RULE}`;

  // Build user prompt
  const userPrompt = `Analyze this WordPress post and generate optimized meta fields:

POST TITLE: ${postTitle}
META DESCRIPTION: ${limitedMetaDescription || 'Not provided'}
PRIMARY KEYWORD: ${primaryKeyword}
POST CONTENT (first 5000 chars): ${limitedContent}
SITE URL: ${siteUrl}
POST LINK: ${postLink || 'Not provided'}
${hasBrief ? `
SEO CONTENT BRIEF (JSON - primary intent; parse for themes; do not copy into meta field values verbatim)
${briefTrimmed.slice(0, 12000)}
` : ''}
${hasGsc ? `
REAL GOOGLE SEARCH QUERIES FOR THIS URL (JSON: gsc_keywords_for_url + rows - use for inspiration only per system rules; do not paste or list queries in output)
${gscKeywordsContext}
` : ''}

EXISTING META FIELDS (heavy/Elementor fields excluded; those are preserved automatically):
${JSON.stringify(existingMetaForPrompt, null, 2)}

Generate optimized meta fields. Focus on:
1. SEO title (50-60 chars, keyword near the start, specific and informative). Match POST TITLE intent; one keyword mention; complete last word within 60 chars.
2. Meta description (150-160 chars). CRITICAL: Must clearly include the Focus Keyword "${primaryKeyword}" somewhere in the description.${isPage ? ' Begin by naturally weaving in the exact POST TITLE at the very start of the sentence (no quotes, no "Title:" label).' : ' Do NOT include the post title in the description. Start with a question hook or benefit statement.'} Apply the restrained SEO editorial standard above.
3. Focus keyword (exact match: "${primaryKeyword}")
4. Canonical URL (use post link if provided)
5. Robots directives (preserve existing or use ["index", "follow"])
6. Facebook OG title (can be up to 70 chars)
7. Facebook OG description (can be up to 200 chars)
8. Twitter title (can be up to 70 chars)
9. Twitter description (can be up to 200 chars)
10. Twitter card type (preserve existing or use "summary_large_image")

IMPORTANT:
- Titles (SEO + social): topic only - never lead with business name, site name, or "Brand | topic" patterns.
- Do NOT include _elementor_data, _elementor_edit_mode, _elementor_template_type, or other Elementor/large fields in your JSON. They are preserved automatically.
- Include only the SEO title, meta description, focus keyword, canonical URL, robots, and social title/description fields in your response. Preserve other small existing fields as-is if you include them.
- Use the exact field keys from EXISTING META FIELDS for those SEO fields.
- Ensure character limits are strictly followed.
- Make titles and descriptions specific, useful, and neutral (not clickbait or promotional hype).
- Include primary keyword naturally (not forced).

Return ONLY a JSON object with the optimized meta fields.`;

  let aiResponse = '';
  const systemWithMaster = appendUniversalContentRulesToSystemPrompt(
    appendMasterInstructionsToSystemPrompt(
      systemPrompt,
      siteId ?? null
    ),
  );

  try {
    const result = await streamChatCompletion({
      apiKey: openRouterApiKey,
        model: getResearchModel(siteId),
      messages: [
        { role: 'system', content: systemWithMaster },
        { role: 'user', content: userPrompt },
      ],
      contentHarness: true,
      temperature: 0.7,
      maxTokens: 4000,
      topP: 0.9,
      onContentChunk: (chunk) => {
        aiResponse += chunk;
      },
    });

    // Get final content from result if available
    if (result.content) {
      aiResponse = result.content;
    }
  } catch (error) {
    console.error('[Meta Field Optimizer] AI generation failed:', error);
    throw new Error(`AI meta field optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  if (!aiResponse || aiResponse.trim().length === 0) {
    throw new Error('AI meta field optimization returned empty response');
  }

  // Parse AI response to extract JSON
  let optimizedMeta: OptimizedMetaFields = {};
  
  try {
    // Try to extract JSON object from response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0];
      
      // Handle unterminated strings by attempting to fix common issues
      // If JSON parsing fails, try to repair the JSON
      try {
        optimizedMeta = JSON.parse(jsonStr);
      } catch (innerError) {
        // Try to fix unterminated strings by finding the last complete field
        // Find the last complete key-value pair before the error
        const lastCompleteMatch = jsonStr.match(/^\{[\s\S]*?("[\w_]+"\s*:\s*"[^"]*")\s*\}?$/);
        if (lastCompleteMatch) {
          // Extract all complete fields before the unterminated one
          const completeFields = jsonStr.match(/"[\w_]+"\s*:\s*(?:"[^"]*"|\[[^\]]*\]|\{[^\}]*\}|[^,}]+)/g) || [];
          if (completeFields.length > 0) {
            // Reconstruct JSON with only complete fields
            const repairedJson = '{' + completeFields.join(',') + '}';
            try {
              optimizedMeta = JSON.parse(repairedJson);
            } catch {
              // If repair fails, use fallback
              throw innerError;
            }
          } else {
            throw innerError;
          }
        } else {
          throw innerError;
        }
      }
    } else {
      // Fallback: try parsing the entire response
      optimizedMeta = JSON.parse(aiResponse);
    }
  } catch (parseError) {
    // Non-fatal: we use fallback meta and continue. Downgrade to warn to avoid noisy console.error.
    console.warn('[Meta Field Optimizer] Failed to parse AI response, using fallback meta:', parseError instanceof Error ? parseError.message : parseError);
    console.warn('[Meta Field Optimizer] AI Response (first 1000 chars):', aiResponse.substring(0, 1000));
    
    // Fallback: create basic optimized meta fields (full post title — never mid-word cut)
    optimizedMeta = {
      ...existingMeta, // Preserve existing fields (including Elementor, etc.)
      rank_math_title: postTitle.trim() || primaryKeyword,
      rank_math_description: limitedMetaDescription || postTitle,
      rank_math_focus_keyword: primaryKeyword,
      rank_math_canonical_url: postLink || siteUrl,
      rank_math_robots: existingMeta.rank_math_robots || ["index", "follow"],
    };
    
    console.warn('[Meta Field Optimizer] Using fallback meta fields due to parse error');
  }

  // Keep a complete title string. Prefer full WordPress post title over a shortened SERP rewrite.
  const fullPostTitle = postTitle.trim();
  if (fullPostTitle) {
    optimizedMeta.rank_math_title = fullPostTitle;
  } else if (optimizedMeta.rank_math_title) {
    optimizedMeta.rank_math_title = String(optimizedMeta.rank_math_title).trim();
  }

  // Ensure focus keyword is set
  if (!optimizedMeta.rank_math_focus_keyword) {
    optimizedMeta.rank_math_focus_keyword = primaryKeyword;
  }
// Ensure canonical URL is set
  if (!optimizedMeta.rank_math_canonical_url && postLink) {
    optimizedMeta.rank_math_canonical_url = postLink;
  }

  // Merge with existing meta to preserve all fields
  const finalMeta = {
    ...existingMeta,
    ...optimizedMeta,
  };

  // CRITICAL: Always ensure focus keyword is set
  // Set it after merge to override any existing value with the primary keyword
  finalMeta.rank_math_focus_keyword = primaryKeyword;

  // ACF Keyword Focus: write via post meta so it persists when ACF REST write does not
  // Many sites store ACF keyword_focus in wp_postmeta; including it here ensures it gets saved
  if (primaryKeyword && primaryKeyword.trim()) {
    finalMeta.keyword_focus = primaryKeyword.trim();
  }

  return finalMeta;
}

