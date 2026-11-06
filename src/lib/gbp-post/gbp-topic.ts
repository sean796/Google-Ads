import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { WordPressSite } from "@/components/integrations/types";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

function parseJsonObject(raw: string): Record<string, unknown> | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Topic for harness + GBP AI. Uses keyword when provided; otherwise OpenRouter picks from site context.
 */
export async function resolveGbpTopicKeyword(
  keywordInput: string,
  site: WordPressSite,
  openRouterApiKey: string,
  recentPostTitles: string[] = [],
): Promise<string> {
  const trimmed = keywordInput.trim();
  if (trimmed) return trimmed;

  const apiKey = openRouterApiKey.trim();
  if (!apiKey) {
    return site.name?.trim() || "local business";
  }

  const postsBlock =
    recentPostTitles.length > 0
      ? `Recent site content titles:\n${recentPostTitles.slice(0, 12).map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "No recent post titles available.";

  const res = await postOpenRouterAppChatFetch({
    method: "POST",
    body: JSON.stringify({
      model: getResearchModel(site.id),
      messages: [
        {
          role: "system",
          content:
            'Pick a short topic phrase (2-6 words) for a Google Business Profile post. Output valid JSON only: { "topic": "string" }.',
        },
        {
          role: "user",
          content: `Business: ${site.name}\nSite: ${site.siteUrl}\n\n${postsBlock}\n\nReturn one relevant topic phrase for a local business update post.`,
        },
      ],
      max_tokens: 120,
      temperature: 0.5,
    }),
  });

  if (!res.ok) {
    return site.name?.trim() || "local business";
  }
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return site.name?.trim() || "local business";
  }
  const parsed = parseJsonObject(content);
  const topic = typeof parsed?.topic === "string" ? parsed.topic.trim() : "";
  return topic || site.name?.trim() || "local business";
}
