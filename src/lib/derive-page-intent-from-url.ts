import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
/**
 * FIRST step: Derive page intent from URL slug via AI.
 * Use this before GSC/prompt_modifier - URL is page-level, modifier is site-level.
 * When title/meta/siteServiceContext are provided, the AI uses them for better keyword derivation than URL-only.
 */

export interface DerivePageIntentOptions {
  /** Page title from WordPress (or other source) for richer context than URL slug alone */
  title?: string;
  /** Meta description / excerpt for this page */
  metaDescription?: string;
  /** Short AI-derived description of the site's service category (from sibling page titles) */
  siteServiceContext?: string;
}

export async function derivePageIntentFromUrlViaAI(
  pageUrl: string,
  apiKey: string,
  model: string,
  options?: DerivePageIntentOptions
): Promise<string | null> {
  const path = (pageUrl.split('?')[0] || '').toLowerCase();
  const slug = (pageUrl.split('/').filter(Boolean).pop() || '').replace(/-/g, ' ');
  if (!slug || slug.length < 4) return null;

  const { title, metaDescription, siteServiceContext } = options ?? {};
  const hasContext = Boolean((title?.trim() || metaDescription?.trim() || siteServiceContext?.trim()));

  const isServiceAreaPage = path.includes('service-area') || path.includes('service_area');
  const serviceAreaRule = isServiceAreaPage
    ? `
*** SERVICE-AREA / ENTITY PAGE ***
The slug is typically {service}-{location}. Return ONLY the service/product phrase. The location is the ENTITY (handled separately) - NEVER include it in the keyword.
Keyword = service/product ONLY. No location, no entity, no place name.`
    : '';

  const contextBlock = hasContext
    ? `
ADDITIONAL CONTEXT (use this to infer the real topic; do not rely only on the URL slug):
${siteServiceContext ? `Site context: ${siteServiceContext}\n` : ''}${title?.trim() ? `Page title: ${title.trim()}\n` : ''}${metaDescription?.trim() ? `Meta description: ${metaDescription.trim().substring(0, 200)}` : ''}`
    : '';

  const prompt = `This page URL slug is: "${slug}"${contextBlock}

What specific topic, product, or comparison does this page cover? Return ONE 2-4 word keyword phrase a user might search for.
${serviceAreaRule}

RULES:
- Prefer the topic implied by the page title and meta when provided; the URL slug may be abbreviated or location-only.
- Be specific; match the page topic.
- Return ONLY the keyword phrase. No quotes, no explanation.`;

  try {
    const response = await postOpenRouterAppChatFetch({
      method: 'POST',
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 80,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '').trim();
    if (!content || content.length < 2) return null;
    return content.substring(0, 80);
  } catch {
    return null;
  }
}

/**
 * Derives a short site-level service category from sibling page titles (and optional excerpts).
 * Call once per site and pass the result as siteServiceContext to derivePageIntentFromUrlViaAI for each page.
 */
export async function deriveSiteServiceContext(
  siblingTitles: Array<{ title: string; excerpt?: string }>,
  apiKey: string,
  model: string
): Promise<string | null> {
  if (!siblingTitles.length) return null;
  const sample = siblingTitles.slice(0, 20).map((t, i) => `${i + 1}. ${t.title}${t.excerpt?.trim() ? ` - ${t.excerpt.trim().substring(0, 80)}` : ''}`).join('\n');

  const prompt = `These are page titles (and optional excerpts) from the same site:

${sample}

In one short phrase, what service or product category does this site focus on? Return only that phrase (e.g. "event structures", "window coverings", "HVAC services"). No location names, no explanation.`;

  try {
    const response = await postOpenRouterAppChatFetch({
      method: 'POST',
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 50,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '').trim();
    if (!content || content.length < 2) return null;
    return content.substring(0, 100);
  } catch {
    return null;
  }
}
