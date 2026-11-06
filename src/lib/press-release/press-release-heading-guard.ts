import { getProductionModel } from "@/lib/optimization-settings-storage";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

/** Structural labels models copy; used only for detection, never shown in prompts. */
const BANNED_HEADING_NORMALIZED = new Set([
  "lead paragraph",
  "lead",
  "supporting details",
  "supporting detail",
  "details",
  "quote or attribution",
  "quote",
  "attribution",
  "about the organization",
  "about the company",
  "media contact",
  "media contacts",
  "headline and dateline",
  "headline",
  "dateline",
  "core announcement",
  "context and impact",
  "statement",
  "company background",
  "press inquiries",
  "introduction",
  "intro",
  "conclusion",
  "overview",
  "summary",
  "body",
  "boilerplate",
  "background",
  "announcement",
]);

function normalizeHeadingText(line: string): string {
  return line
    .replace(/^#+\s*/, "")
    .trim()
    .toLowerCase();
}

export function isBannedPressReleaseHeading(headingLine: string): boolean {
  const raw = headingLine.replace(/^#+\s*/, "").trim();
  if (!raw) return true;
  if (raw.startsWith("[") || raw.toLowerCase().includes("compose")) return true;
  const norm = normalizeHeadingText(raw);
  if (BANNED_HEADING_NORMALIZED.has(norm)) return true;
  if (/^section\s+\d+$/.test(norm)) return true;
  return false;
}

function parseFirstH2Line(markdown: string): { heading: string; rest: string } | null {
  const trimmed = markdown.trimStart();
  const match = trimmed.match(/^(##[^\n]*)\n?([\s\S]*)$/);
  if (!match) return null;
  return {
    heading: match[1].replace(/^##\s*/, "").trim(),
    rest: match[2] ?? "",
  };
}

/**
 * If the section opens with a template-style ## line, rewrite via OpenRouter using topic + body context.
 */
export async function ensurePressReleaseSectionHeading(opts: {
  sectionMarkdown: string;
  topic: string;
  headlineHint?: string;
  sectionIntent: string;
  apiKey: string;
  model?: string;
}): Promise<string> {
  const parsed = parseFirstH2Line(opts.sectionMarkdown);
  if (!parsed) return opts.sectionMarkdown;
  if (!isBannedPressReleaseHeading(parsed.heading)) {
    return opts.sectionMarkdown;
  }

  const model = opts.model || getProductionModel();
  const res = await postOpenRouterAppChatFetch({
    method: "POST",
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `Fix the opening ## line of this press release section. Return JSON only: {"markdown":"..."}.

Rules:
- "markdown" is the full section: one ## line you invent, then the same body content (you may lightly edit body for flow).
- The ## line must be a specific, newsworthy subhead about the topic (names, actions, products, places). It must read like wire copy, not an outline label.
- Topic: ${opts.topic}
- Headline hint: ${opts.headlineHint?.trim() || opts.topic}
- What this section covers: ${opts.sectionIntent}

Current section:
${opts.sectionMarkdown.trim()}`,
        },
      ],
      temperature: 0.35,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) return opts.sectionMarkdown;

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim() || "";
  try {
    const parsedJson = JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, "").trim()) as {
      markdown?: string;
    };
    const md = parsedJson.markdown?.trim();
    if (!md || !md.startsWith("##")) return opts.sectionMarkdown;
    const fixed = parseFirstH2Line(md);
    if (!fixed || isBannedPressReleaseHeading(fixed.heading)) return opts.sectionMarkdown;
    return md;
  } catch {
    return opts.sectionMarkdown;
  }
}
