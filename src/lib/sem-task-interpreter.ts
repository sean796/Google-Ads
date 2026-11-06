import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

export interface InterpretedSemTask {
  lineIndex: number;
  url: string;
  suggestedAction: string;
  rawLine: string;
  /** Checklist of operations to complete for this row (e.g. fix link steps) */
  checklist: string[];
}

const URL_REGEX = /https?:\/\/[^\s,]+/i;

/**
 * Fallback: extract URL from a single line when AI fails.
 * Returns null if no URL found.
 */
function extractUrlFromLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const match = trimmed.match(URL_REGEX);
  if (match) return match[0].replace(/[.,;:)]+$/, "").trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

/**
 * Interpret a raw task list (CSV or plain text, one item per line) via AI.
 * Each line is parsed into: url, suggestedAction, checklist.
 * focusCategories: user-selected fix areas (traditional tech SEO labels); AI emphasizes these.
 * promptModifier: optional extra instructions appended to the request.
 */
export async function interpretSemTaskList(
  rawList: string,
  siteUrl?: string,
  focusCategories?: string[],
  promptModifier?: string
): Promise<InterpretedSemTask[]> {
  const apiKey = loadApiKey();
  if (!apiKey?.trim()) {
    throw new Error("OpenRouter API key not found. Please set it in settings.");
  }

  const lines = rawList
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const model = getResearchModel();

  const focusNote =
    focusCategories?.length &&
    focusCategories.some((c) => c.trim().length > 0)
      ? `\nFocus ONLY on these fix categories (use traditional tech SEO terminology for suggestedAction and checklist): ${focusCategories.join(", ")}.`
      : "";

  const systemPrompt = `You are an SEO/technical assistant. Your job is to interpret a task list where each line is a URL or a note about a page (e.g. from SEM, crawl, or manual list).${focusNote}

For each non-empty line:
1. Extract or infer the page URL. If the line is only a URL, use it. If it's "URL, note" or "note – URL" or "Issue: URL", parse out the URL.
2. Produce a short "suggestedAction" label using traditional tech SEO terms (e.g. "Fix relative link", "Fix title and meta", "Optimize for keyword X", "Add FAQ schema").
3. Produce a "checklist" array of 3–5 concrete operations using traditional tech SEO labels (e.g. "Locate relative or broken links in content", "Replace with correct absolute URL", "Verify link works"; or "Add Article schema", "Check H1/H2 for keyword", "Optimize meta description").

Return a JSON array only, no markdown or explanation. Each item: { "lineIndex": number (1-based), "url": string, "suggestedAction": string, "rawLine": string, "checklist": string[] }.
Use the exact raw line text for rawLine. If a line has no recognizable URL, use "" for url and put the line content in suggestedAction. Checklist must be an array of 3–5 short step strings.`;

  let userPrompt = `Site context: ${siteUrl || "none"}

Task list (one item per line):
${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}

Return JSON array of { lineIndex, url, suggestedAction, rawLine, checklist } for each line. checklist = array of 3–5 operation steps for that row.`;
  if (promptModifier?.trim()) {
    userPrompt += `\n\nAdditional instructions: ${promptModifier.trim()}`;
  }

  try {
    const response = await postOpenRouterAppChatFetch({
      method: "POST",
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content ?? "").trim();

    let jsonStr = content;
    const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlock?.[1]) {
      jsonStr = codeBlock[1].trim();
    } else {
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) jsonStr = arrayMatch[0];
    }
    const parsed = JSON.parse(jsonStr) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error("AI did not return an array");
    }

    const tasks: InterpretedSemTask[] = parsed
      .filter(
        (item: unknown): item is { lineIndex?: number; url?: string; suggestedAction?: string; rawLine?: string; checklist?: string[] } =>
          item != null && typeof item === "object"
      )
      .map((item, idx) => {
        const lineIndex = typeof item.lineIndex === "number" ? item.lineIndex : idx + 1;
        const rawLine = typeof item.rawLine === "string" ? item.rawLine : lines[idx] ?? "";
        let url = typeof item.url === "string" ? item.url.trim() : "";
        if (!url) url = extractUrlFromLine(rawLine) ?? "";
        const suggestedAction =
          typeof item.suggestedAction === "string" && item.suggestedAction.trim()
            ? item.suggestedAction.trim()
            : url
              ? "Fix link"
              : "Unknown";
        const checklist = Array.isArray(item.checklist) && item.checklist.length > 0
          ? item.checklist.filter((s): s is string => typeof s === "string").slice(0, 8)
          : ["Locate relative or broken links", "Replace with correct absolute URL", "Verify link works"];
        return { lineIndex, url, suggestedAction, rawLine, checklist };
      })
      .filter((t) => t.url.length > 0);

    if (tasks.length === 0) {
      return fallbackInterpret(lines);
    }
    return tasks;
  } catch (e) {
    console.warn("[SEM Task Interpreter] AI interpretation failed, using fallback:", e);
    return fallbackInterpret(lines);
  }
}

const DEFAULT_LINK_CHECKLIST = [
  "Locate relative or broken links in content",
  "Replace with correct absolute URL",
  "Verify link works",
];

function fallbackInterpret(lines: string[]): InterpretedSemTask[] {
  const tasks: InterpretedSemTask[] = [];
  lines.forEach((rawLine, idx) => {
    const url = extractUrlFromLine(rawLine);
    if (url) {
      tasks.push({
        lineIndex: idx + 1,
        url,
        suggestedAction: "Fix link",
        rawLine,
        checklist: [...DEFAULT_LINK_CHECKLIST],
      });
    }
  });
  return tasks;
}
