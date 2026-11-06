import { loadApiKey } from "@/lib/api";
import {
  generateLocalKeywordForEntityPage,
} from "@/lib/content-optimization-helpers";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";

/**
 * Extract keyword from title ONLY using AI (for SEM tasks when no GSC data).
 * Analyzes the title to determine the primary search intent keyword.
 */
export async function extractKeywordFromTitleOnly(
  title: string,
  url: string,
  siteId: string
): Promise<string> {
  if (!title || !title.trim()) {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split("/").filter((s) => s.length > 0);
      const slug = pathSegments[pathSegments.length - 1] || "content";
      return slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    } catch {
      return "content optimization";
    }
  }

  try {
    const openRouterApiKey = loadApiKey();
    if (openRouterApiKey && openRouterApiKey.trim().length > 0) {
      const researchModel = getResearchModel(siteId);
      const { content: aiKeywordRaw } = await postOpenRouterAppChat({
        apiKey: openRouterApiKey,
        model: researchModel,
        messages: [
          {
            role: "user",
            content: `Analyze this page title and extract the primary search keyword that users would use to find this content:

Page Title: "${title.replace(/<[^>]+>/g, "").trim()}"
Page URL: "${url}"

Extract the main keyword phrase (2-5 words) that best represents what this page is about. Focus on the core topic, not generic terms.
- NEVER use a competitor name or competitor-focused keyword; never optimize for competitors.
- NEVER use Bali Blinds (any casing) or DIY remove/detach topics for Bali blinds.
- this for example is not a good keyword "heritage lane dental edmonton".
- Prefer product-, service-, or topic-based keywords when they fit; not restricted to only those.

Return ONLY the keyword phrase, nothing else. No quotes, no explanation.`,
          },
        ],
        temperature: 0.3,
        maxTokens: 30,
      });
      const aiKeyword = aiKeywordRaw.trim();
      if (aiKeyword && aiKeyword.length > 2) {
        const cleaned = aiKeyword.replace(/^["']|["']$/g, "").trim().substring(0, 80);
        if (cleaned.length >= 3) {
          return cleaned;
        }
      }
    }
  } catch (error) {
    console.warn("[Keyword Extraction] Failed to extract keyword from title via AI, falling back:", error);
  }

  const cleanTitle = title.replace(/<[^>]+>/g, "").trim();
  if (cleanTitle.length > 0) {
    const words = cleanTitle.split(/\s+/).slice(0, 6);
    return words.join(" ").substring(0, 80);
  }

  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split("/").filter((s) => s.length > 0);
    const slug = pathSegments[pathSegments.length - 1] || "content";
    return slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  } catch {
    return "content optimization";
  }
}

export async function extractKeywordFromContent(
  title: string,
  content: string,
  url: string,
  isEntityPage: boolean,
  siteName: string,
  siteId: string
): Promise<string> {
  let extractedKeyword = "";

  if (isEntityPage && title) {
    try {
      const openRouterApiKey = loadApiKey();
      if (openRouterApiKey && openRouterApiKey.trim().length > 0) {
        const researchModel = getResearchModel(siteId);
        extractedKeyword = await generateLocalKeywordForEntityPage(
          title,
          url,
          siteName,
          openRouterApiKey,
          researchModel
        );
        if (extractedKeyword && extractedKeyword.trim().length > 0) {
          return extractedKeyword.trim();
        }
      }
    } catch (error) {
      console.warn("[Keyword Extraction] Failed to generate AI keyword, falling back:", error);
    }
  }

  if (!extractedKeyword || extractedKeyword.length < 3) {
    if (title && title.trim().length > 0) {
      extractedKeyword = title.trim().replace(/<[^>]+>/g, "").substring(0, 100);
    } else if (content && content.trim().length > 0) {
      const h2Match = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
      if (h2Match && h2Match[1]) {
        extractedKeyword = h2Match[1].replace(/<[^>]+>/g, "").trim().substring(0, 100);
      } else {
        const textContent = content.replace(/<[^>]+>/g, " ").trim();
        extractedKeyword = textContent.split(/[.!?]/)[0].trim().substring(0, 100);
      }
    }

    if (!extractedKeyword || extractedKeyword.length < 3) {
      try {
        const urlObj = new URL(url);
        const pathSegments = urlObj.pathname.split("/").filter((s) => s.length > 0);
        const slug = pathSegments[pathSegments.length - 1] || "content";
        extractedKeyword = slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      } catch {
        extractedKeyword = "content optimization";
      }
    }
  }

  return extractedKeyword;
}


export function extractHeadingsFromContent(content: string): string[] {
  if (!content || typeof content !== "string") return [];
  const headings: string[] = [];
  const htmlRe = /<h[123][^>]*>(.*?)<\/h[123]>/gi;
  let m: RegExpExecArray | null;
  while ((m = htmlRe.exec(content)) !== null) {
    const text = (m[1] || "").replace(/<[^>]+>/g, "").trim();
    if (text) headings.push(text);
  }
  if (headings.length === 0) {
    const mdRe = /^#{1,3}\s+(.+)$/gm;
    while ((m = mdRe.exec(content)) !== null) {
      const text = (m[1] || "").trim();
      if (text) headings.push(text);
    }
  }
  return headings;
}

export async function inferPrimaryKeywordFromTitleAndMeta(
  title: string,
  metaDescription: string | undefined,
  excerpt: string | undefined,
  url: string,
  siteId: string,
  acfKeywordFocus?: string,
  promptModifier?: string,
  pageHeadings?: string[]
): Promise<string> {
  const cleanTitle = (title || "").replace(/<[^>]+>/g, "").trim();
  const meta = (metaDescription || excerpt || "").trim().substring(0, 300);
  const hint = (acfKeywordFocus || "").trim().substring(0, 100);
  const modifier = (promptModifier || "").trim().substring(0, 500);
  const headings =
    pageHeadings && pageHeadings.length > 0
      ? pageHeadings.slice(0, 15).map((h) => h.trim()).filter(Boolean)
      : [];

  try {
    const openRouterApiKey = loadApiKey();
    if (!openRouterApiKey?.trim()) return "";

    const researchModel = getResearchModel(siteId);
    const parts: string[] = [];
    if (modifier) parts.push(`PROMPT MODIFIER (context only; do not copy location from it): "${modifier}"`);
    parts.push(`Page Title: "${cleanTitle || "(none)"}"`, `Page URL: "${url}"`);
    if (headings.length > 0)
      parts.push(`Page headings (use these for context): ${headings.map((h) => `"${h}"`).join(", ")}`);
    if (meta) parts.push(`Meta description / excerpt: "${meta}"`);
    if (hint) parts.push(`Existing keyword focus hint (ignore if it is a company/brand name): "${hint}"`);

    const { content: aiKeywordRaw } = await postOpenRouterAppChat({
      apiKey: openRouterApiKey,
      model: researchModel,
      messages: [
        {
          role: "user",
          content: `Derive the primary SEO keyword for this page. Use the page headings and title to determine what the page is about.

${parts.join("\n")}

RULES:
- Use page headings and title to understand what the page is about (any topic: service, info, legal, terms, privacy, how-to, etc.). Headings define context.
- Return a 2-5 word keyword phrase that describes the main topic or subject of the page (e.g. "terms and conditions", "privacy policy", "service areas", "new patient form", "cellular shades").
- NEVER return a company name, brand name, or business name as the keyword.
- this for example is not a good keyword "heritage lane dental edmonton".
- NEVER use Bali Blinds (any casing) or DIY remove/detach topics for Bali blinds.

- NEVER return a city, region, or location as the keyword.
- For pages: NEVER use a competitor name or competitor-focused keyword; never optimize for competitors. Prefer product-, service-, or topic-based keywords when they fit the page, but you are not restricted to only product/service - use whatever best describes the page topic.
- If a PROMPT MODIFIER is provided, use it only for topic context; strip any location from the modifier and do not include location in your keyword.
- When in doubt, prefer the main heading or clear subject of the page.

Return ONLY the keyword phrase, nothing else. No quotes, no explanation.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 30,
    });
    const aiKeyword = aiKeywordRaw.trim();
    if (!aiKeyword || aiKeyword.length < 2) return "";

    const cleaned = aiKeyword.replace(/^["']|["']$/g, "").trim().substring(0, 80);
    return cleaned.length >= 3 ? cleaned : "";
  } catch (error) {
    console.warn("[Keyword Inference] Failed to infer keyword from title/meta via AI:", error);
    return "";
  }
}

export function isNoQueriesError(error: unknown): boolean {
  if (!error) return false;
  const errorMessage = error instanceof Error ? error.message : String(error);
  return errorMessage.toLowerCase().includes("no valid search queries found");
}
