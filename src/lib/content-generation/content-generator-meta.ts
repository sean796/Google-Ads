import { getBlogModel } from "@/lib/optimization-settings-storage";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";

/**
 * AI-driven function to generate a SEO-optimized meta description
 * Creates a fresh, agentic meta description from WordPress content or keyword+title context.
 * The exact page title (when provided) should be naturally front-loaded at the beginning
 * of the meta description, as part of a fluent sentence (no quotes, no label).
 */
export async function generateMetaDescription(
  markdownContent: string, // This can be WordPress content OR minimal context (keyword + title)
  primaryKeyword: string,
  apiKey: string,
  siteId?: string,
  pageTitle?: string,
  isPage?: boolean
): Promise<string> {
  try {
    // CRITICAL: Meta description is INDEPENDENT - but can use WordPress content as context if available
    // Extract text content - remove HTML and markdown formatting
    const textContent = markdownContent
      .replace(/<[^>]*>/g, '') // Remove ALL HTML tags
      .replace(/^#+\s+/gm, '') // Remove headers
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 3000); // Use up to 3000 chars if WordPress content is available

    const blogModel = getBlogModel(siteId);

    await ensureMasterInstructionsInMemory(siteId);

    const metaSystemBase = `You are an expert SEO meta description writer. Write ONLY concise meta descriptions for Google search results.

🔥 CRITICAL: This is a SEPARATE META DESCRIPTION for SEO, NOT an excerpt from the blog content, NOT a paragraph from the post, NOT a summary of the article.

You MUST create a BRAND NEW, FRESH meta description that is:
- Written specifically for Google search results (SERP)
- Optimized for click-through rate (CTR)
- Completely independent from the blog content

ABSOLUTE REQUIREMENTS:
- EXACTLY 120-150 characters (count them - this is CRITICAL for SERP display)
- ONE sentence or two short sentences maximum
${isPage ? `- Naturally FRONT-LOAD the exact page title at the very beginning of the description, woven into a fluent sentence (for example: "Emergency Plumbing Repair Edmonton – fast, reliable help when you need it most.")
- Do NOT wrap the title in quotes and do NOT repeat it multiple times` : `- Start with a direct question or hook ("Looking for...?", "Need...?", "Searching for...?") or a compelling benefit statement
- Do NOT use the page title in the description - generate a completely independent meta description`}
- Include key service/benefit (GENERIC service terms, NOT business names)
- End with a clear call to action ("Learn more", "Discover", "Find out", "Get started")
- Plain text ONLY - NO HTML, NO <p> or <h2>, NO markdown (no ## or **), NO line breaks - one short line like a meta description
- Conversational, punchy, attention-grabbing
- Optimized for SERP - this appears in Google search results, make it compelling!

ABSOLUTE FORBIDDEN:
- NO copying text from the content - create something COMPLETELY NEW
- NO "Introduction" or any variation
- NO HTML tags (<p>, <h2>, <div>, &hellip;, etc.) and NO markdown (no ## headings, no **bold**) - PLAIN TEXT ONLY, one line
- NO generic openings ("This article", "In this guide", "Many residents", etc.)
- NO full paragraphs - this is a META DESCRIPTION, not blog content
- NO quotes around text
- NO labels ("Excerpt:", "Meta description:", "Description:", etc.)
- NO company names or competitor names - use GENERIC service terms only
- NO location + business name combinations
- NO ellipsis or truncation indicators (... or &hellip;)
${isPage ? `
Example (with title naturally front-loaded):
Emergency Plumbing Repair Edmonton – fast, reliable help for burst pipes, leaks, and drain emergencies. Call now to get same-day service.` : `
Example:
Looking for expert window treatment solutions? Discover durable, moisture-resistant coverings perfect for humid climates. Get started today.`}

Your output MUST be 120-150 characters. Count them. This is a SEPARATE META DESCRIPTION for Google SERP, NOT a content excerpt. Create something FRESH and NEW, don't copy from the content.${isPage ? ' Always begin by naturally weaving in the exact page title at the start of the sentence (no quotes, no labels).' : ' Do NOT include the page title in the meta description.'}`;

    const { content: excerptRaw } = await postOpenRouterAppChat({
      apiKey,
      model: blogModel,
      messages: [
          {
            role: "system",
            content: appendMasterInstructionsToSystemPrompt(metaSystemBase, siteId),
          },
          {
            role: "user",
            content: `Write a SEPARATE, AGENTIC META DESCRIPTION (120-150 characters) for this blog.

PAGE TITLE: "${pageTitle || primaryKeyword}"
PRIMARY KEYWORD: "${primaryKeyword}"

🔥 CRITICAL: This is a COMPLETELY INDEPENDENT meta description for Google SERP.
- It is NOT an excerpt from blog content
- It is NOT a paragraph from the post
- It is NOT a summary of the article
- It is a FRESH, NEW meta description written specifically for SEO

You MUST:
- Create a BRAND NEW meta description - do NOT copy text from the content below
- Write it specifically for Google search results (SERP optimization)
- Use GENERIC service terms (e.g., "dental care", "family dentistry", "dental services")
- NEVER include business names, company names, or competitor names
- Focus on the SERVICE/BENEFIT, not the business
- Make it compelling for click-through in search results
- Use the content below ONLY as context to understand the topic - create something NEW
${isPage ? `
FRONT-LOAD TITLE NATURALLY:
- Start the description by naturally incorporating the exact PAGE TITLE at the very beginning of the sentence (no quotes, no "Title:" label)
- Example pattern: "Emergency Plumbing Repair Edmonton – fast, reliable help when you need it most. Call today for same-day service."
- Do NOT start with a question hook like "Looking for...?" or "Need...?" if it would push the title away from the beginning` : `
DO NOT USE THE TITLE:
- Do NOT include the page title in the meta description
- Start with a direct question hook ("Looking for...?", "Need...?") or a compelling benefit statement
- The meta description must be completely independent of the title`}

WordPress content (for context only - create a NEW meta description, don't copy):
${textContent.substring(0, 3000)}

Write ONLY the meta description (120-150 characters). Output a single line of plain text: no HTML, no markdown, no headings (no ##), no paragraph breaks - just one short engaging sentence like a meta description. Include a call to action. NO business names. Completely independent from content:`
          }
        ],
      temperature: 0.7,
      maxTokens: 2048,
    });

    let excerpt = excerptRaw.trim();
    
    // CRITICAL: Remove ALL HTML tags and entities (AI should not output these, but aggressive cleanup)
    excerpt = excerpt
      .replace(/<[^>]*>/g, '') // Remove ALL HTML tags
      .replace(/&hellip;/g, '') // Remove HTML ellipsis entity
      .replace(/&nbsp;/g, ' ') // Replace non-breaking space
      .replace(/&[a-z]+;/gi, '') // Remove any other HTML entities
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // CRITICAL: Strip any markdown so excerpt is plain text only (no h2, no paragraphs)
    excerpt = excerpt
      .replace(/^#+\s+/gm, '') // Remove markdown headings (##, ###)
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic
      .replace(/\n+/g, ' ') // Collapse newlines to one line
      .replace(/\s+/g, ' ')
      .trim();
    
    // Remove quotes, labels, prefixes
    excerpt = excerpt
      .replace(/^["']|["']$/g, '')
      .replace(/^(Excerpt|Meta description|Description|Meta Description):\s*/i, '')
      .replace(/^Introduction:\s*/i, '')
      .replace(/^Many residents/i, '') // Remove common content openings
      .replace(/^This article/i, '')
      .replace(/^In this guide/i, '')
      .trim();
    
    // Final aggressive cleanup - remove any remaining HTML-like patterns
    if (excerpt.includes('<') || excerpt.includes('&')) {
      console.warn('[Content Generator] ⚠️ Meta description still contains HTML-like content, cleaning aggressively');
      excerpt = excerpt.replace(/[<>&]/g, '').trim();
    }
    
    // SEO-pragmatic: use 50–160 chars. Google shows variable lengths; don't fail the flow for a short description.
    if (!excerpt || excerpt.length < 50) {
      excerpt = `${primaryKeyword.trim()} | Learn more.`;
      if (excerpt.length > 160) excerpt = excerpt.substring(0, 157) + '...';
    }
    if (excerpt.length > 160) {
      const truncated = excerpt.substring(0, 157);
      const lastSpace = truncated.lastIndexOf(' ');
      excerpt = lastSpace > 50 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
    }
    
    // CRITICAL: Final check - ensure NO HTML or content excerpt patterns
    if (excerpt.includes('<') || excerpt.includes('&') || excerpt.toLowerCase().includes('many residents') || excerpt.toLowerCase().startsWith('introduction')) {
      console.warn('[Content Generator] Meta description contains HTML or content excerpt patterns, sanitizing:', excerpt);
      excerpt = excerpt.replace(/[<>&]/g, '').trim();
      if (excerpt.toLowerCase().startsWith('introduction')) {
        excerpt = excerpt.replace(/^introduction\s*/i, '').trim();
      }
    }
    
    console.log(`[Content Generator] ✅ AI-generated FRESH agentic meta description (${excerpt.length} chars):`, excerpt);
    return excerpt;
  } catch (error) {
    console.warn('[Content Generator] Failed to generate AI excerpt:', error);
    throw error;
  }
}
