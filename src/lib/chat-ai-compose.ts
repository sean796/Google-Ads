import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

export type ChatAiMode = "correct" | "enhance" | "professional" | "shorter" | "clearer";

const MODE_INSTRUCTIONS: Record<ChatAiMode, string> = {
  correct: "Fix grammar, spelling, and punctuation only. Do not change meaning, tone, or length.",
  enhance: "Improve clarity and flow. Keep the same intent and facts.",
  professional: "Rewrite in a professional workplace tone. Keep the same intent and facts.",
  shorter: "Make the message more concise. Keep all essential information.",
  clearer: "Simplify wording for easier reading. Keep the same intent and facts.",
};

function htmlToPlainForAi(html: string): string {
  const div = typeof document !== "undefined" ? document.createElement("div") : null;
  if (div) {
    div.innerHTML = html;
    return (div.textContent ?? div.innerText ?? "").trim();
  }
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseBodyHtmlJson(raw: string): string | null {
  try {
    const data = JSON.parse(raw) as { bodyHtml?: unknown };
    if (typeof data.bodyHtml !== "string") return null;
    const trimmed = data.bodyHtml.trim();
    return trimmed === "" ? null : trimmed;
  } catch {
    return null;
  }
}

export async function transformChatHtml(
  bodyHtml: string,
  mode: ChatAiMode,
  signal?: AbortSignal,
): Promise<{ ok: true; bodyHtml: string } | { ok: false; error: string }> {
  const apiKey = loadApiKey().trim();
  if (!apiKey) {
    return { ok: false, error: "Add OpenRouter API key in settings" };
  }

  const plain = htmlToPlainForAi(bodyHtml);
  if (!plain) {
    return { ok: false, error: "Nothing to transform" };
  }

  const model = getResearchModel();

  try {
    const response = await postOpenRouterAppChatFetch({
      method: "POST",
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You rewrite team chat messages. Preserve @mentions and links when present. Return JSON only: {"bodyHtml":"..."}. Use simple HTML: p, strong, em, s, code, ul, ol, li, a, blockquote. No markdown fences.`,
          },
          {
            role: "user",
            content: `Mode: ${mode}\nInstruction: ${MODE_INSTRUCTIONS[mode]}\n\nOriginal HTML:\n${bodyHtml}\n\nPlain text reference:\n${plain}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, error: errText.trim() || `Request failed (${response.status})` };
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const transformed = parseBodyHtmlJson(content);
    if (!transformed) {
      return { ok: false, error: "Could not parse AI response" };
    }
    return { ok: true, bodyHtml: transformed };
  } catch (err) {
    if (signal?.aborted) {
      return { ok: false, error: "Cancelled" };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}
