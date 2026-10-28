import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseAssistantJsonObject } from "@/lib/competitor-research/competitor-report-json-parse";
import { getProductionModel } from "@/lib/optimization-settings-storage";
import {
  findPhraseOutsideTags,
  listHtmlParagraphBlocksForAddLinks,
  plainVisibleTextFromHtml,
} from "@/lib/overview/overview-blog-links-extract";

const WEAVE_SYSTEM = `Add one internal link inside the paragraph. Return JSON only.

Rules:
- anchorText: copy 2-4 words character-for-character from paragraphText where the link fits naturally mid-sentence
- destinationUrl: copy one url from allowedUrls exactly — pick the URL whose title best matches what the anchor phrase refers to (product/brand names must link to that product page, not a generic blog)
- NEVER invent anchor text outside paragraphText
- NEVER suggest appending a link after the final period
- NEVER pick the last words of the sentence as the anchor
- NEVER pick text that is bold (** or <strong>)
- NEVER link a product name to an unrelated page when a matching product URL exists in allowedUrls

If no natural fit: {"anchorText":"","destinationUrl":""}`;

type AllowedPost = { title: string; link: string };

function readWeaveFields(raw: Record<string, unknown>): { anchorText: string; destinationUrl: string } {
  const anchorText = typeof raw.anchorText === "string" ? raw.anchorText.trim() : "";
  const destinationUrl =
    (typeof raw.destinationUrl === "string" ? raw.destinationUrl.trim() : "") ||
    (typeof raw.url === "string" ? raw.url.trim() : "") ||
    (typeof raw.href === "string" ? raw.href.trim() : "");
  return { anchorText, destinationUrl };
}

function weaveAtPhrase(blockHtml: string, anchorText: string, href: string): string | null {
  const hit = findPhraseOutsideTags(blockHtml, anchorText);
  if (!hit) return null;
  const actual = blockHtml.slice(hit.start, hit.start + hit.length);
  return (
    blockHtml.slice(0, hit.start) +
    `<a href="${href}">${actual}</a>` +
    blockHtml.slice(hit.start + hit.length)
  );
}

/**
 * OpenRouter picks anchor text from paragraph prose and weaves one internal link in place.
 */
export async function aiWeaveInternalLinkInSectionHtml(
  sectionHtml: string,
  allowedPosts: AllowedPost[],
  opts: { apiKey: string; model?: string; signal?: AbortSignal },
): Promise<string> {
  if (!sectionHtml.trim() || !allowedPosts.length || !opts.apiKey.trim()) {
    return sectionHtml;
  }

  const allowedUrls = allowedPosts
    .filter((p) => p.link?.trim())
    .map((p) => ({ title: p.title.trim(), url: p.link.trim() }));

  if (!allowedUrls.length) return sectionHtml;

  const blocks = listHtmlParagraphBlocksForAddLinks(sectionHtml);
  for (const block of blocks) {
    if (/<a\s[^>]*href=["']https?:\/\//i.test(block.html)) continue;
    const paragraphText = plainVisibleTextFromHtml(block.html);
    if (!paragraphText.trim()) continue;

    const { content } = await callOpenRouterChatCompletion({
      apiKey: opts.apiKey,
      model: opts.model?.trim() || getProductionModel(),
      system: WEAVE_SYSTEM,
      user: JSON.stringify({ paragraphText, allowedUrls }),
      maxTokens: 2048,
      temperature: 0.15,
      responseFormat: { type: "json_object" },
      signal: opts.signal,
    });

    let raw: Record<string, unknown>;
    try {
      raw = parseAssistantJsonObject(content) as Record<string, unknown>;
    } catch {
      continue;
    }

    const { anchorText, destinationUrl } = readWeaveFields(raw);
    if (!anchorText || !destinationUrl) continue;
    if (!allowedUrls.some((p) => p.url === destinationUrl)) continue;

    const woven = weaveAtPhrase(block.html, anchorText, destinationUrl);
    if (!woven) continue;

    return sectionHtml.slice(0, block.start) + woven + sectionHtml.slice(block.end);
  }

  return sectionHtml;
}
