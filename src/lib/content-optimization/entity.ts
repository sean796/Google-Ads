import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";

export interface GeographicSiteContext {
  siteUrl?: string;
  siteName?: string;
  locations?: Array<{ city?: string; state?: string }>;
  napAddress?: string;
}

/**
 * Agentic AI-driven: one Open Router call. No manual pattern matching or blocklist validation.
 * Pass whole post context; returns the single geographic location (origin) or null (NONE).
 * Used by ACF origin update, blueprint entity, and determineEntity - one script only.
 *
 * Optional siteContext provides disambiguation so we don't mis-classify brand names that look
 * like locations (e.g. "Phoenix" in phoenixpainting.ca) when the site's actual operating region
 * is different.
 */
export async function extractGeographicEntityWithAI(
  context: { url?: string; title?: string; excerpt?: string; slug?: string },
  apiKey?: string,
  siteContext?: GeographicSiteContext
): Promise<string | null> {
  const { url, title, excerpt, slug } = context;
  const key = apiKey || loadApiKey();
  if (!key?.trim()) return null;

  const parts: string[] = [];
  if (title?.trim()) parts.push(`Title: ${title.trim()}`);
  if (url?.trim()) parts.push(`URL: ${url.trim()}`);
  if (slug?.trim()) parts.push(`Slug: ${slug.trim()}`);
  if (excerpt?.trim()) parts.push(`Excerpt: ${excerpt.trim()}`);
  if (parts.length === 0) return null;

  const siteLines: string[] = [];
  if (siteContext?.siteUrl) {
    siteLines.push(`- Site URL: ${siteContext.siteUrl} (TLD hints at country/region)`);
  }
  if (siteContext?.siteName) {
    siteLines.push(`- Company/Brand: ${siteContext.siteName}`);
  }
  if (siteContext?.locations && siteContext.locations.length > 0) {
    const locs = siteContext.locations
      .map((l) => [l.city, l.state].filter(Boolean).join(", "))
      .filter(Boolean)
      .join("; ");
    if (locs) {
      siteLines.push(`- Known service locations: ${locs}`);
    }
  }
  if (siteContext?.napAddress) {
    siteLines.push(`- NAP address: ${siteContext.napAddress}`);
  }

  const siteContextSection =
    siteLines.length > 0
      ? `\n\nSITE CONTEXT (for disambiguation):\n${siteLines.join(
          "\n"
        )}\n\nDISAMBIGUATION RULES:\n` +
        `- If a word in the title or URL looks like a location but is clearly part of the company/brand name or domain, treat it as a BRAND, not a geographic location.\n` +
        `- Use the site URL's TLD and the known locations above to understand the site's real operating region.\n` +
        `- When a potential location word does not make geographic sense for the site's region, or only appears inside the brand/domain, return NONE instead of forcing a location.\n` +
        `- Example: "phoenix" on phoenixpainting.ca (a Canadian site serving Edmonton, Alberta) is a brand name, NOT Phoenix, Arizona.\n` +
        `- Only extract a location when it clearly represents a real geographic area the business serves.\n`
      : "";

  const systemPrompt =
    `You are a local SEO expert. Extract the single geographic location (service area / origin) from the post context. ` +
    `Return ONLY the location phrase (e.g. "Downtown Edmonton", "Baranow, Edmonton") or exactly NONE if none. ` +
    `No other text. Agentic: you decide; no validation lists.` +
    siteContextSection;

  const userPrompt = `From this post, return the one geographic origin or NONE:\n\n${parts.join("\n")}`;

  try {
    const { content } = await postOpenRouterAppChat({
      apiKey: key,
      model: getResearchModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 120,
    });
    const out = content
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\*\*/g, "")
      .trim();
    if (!out || /^n\/a$|^none$/i.test(out)) return null;
    return out;
  } catch {
    return null;
  }
}
