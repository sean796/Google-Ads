/**
 * Worker-safe OpenRouter streaming chat (no window/document).
 * Shared by main-thread api.ts and harness Web Workers.
 * Posts to this app's /api/openrouter/chat-completion (server talks to OpenRouter).
 */

import { openRouterAppApiHeaders, openRouterChatCompletionUrl } from "@/lib/openrouter-app-api";
import { getOpenRouterApiKeyForApp } from "@/lib/openrouter-api-key-resolve";
import {
  clampOpenRouterMaxTokens,
  type OpenRouterChatMessage,
} from "@/lib/openrouter-stream-token-limits";

export type { OpenRouterChatMessage };
export { clampOpenRouterMaxTokens };

export interface StreamOpenRouterCoreParams {
  apiKey: string;
  model: string;
  messages: OpenRouterChatMessage[];
  temperature: number;
  maxTokens: number;
  topP: number;
  /** Unused; kept so existing callers compile. Server sets OpenRouter referer. */
  httpReferer: string;
  signal?: AbortSignal;
  onContentChunk: (chunk: string) => void;
  onFinishReason?: (reason: string) => void;
}

function processSseDataLine(
  data: string,
  onContentChunk: (chunk: string) => void,
  onFinishReason: ((reason: string) => void) | undefined,
  acc: { fullContent: string; lastFinishReason: string | null },
): void {
  if (data === "[DONE]") return;
  try {
    const json = JSON.parse(data);
    const delta = json.choices[0]?.delta;
    const contentChunk =
      typeof delta?.content === "string" && delta.content.length > 0 ? delta.content : "";
    const finishReason = json.choices[0]?.finish_reason;

    if (contentChunk) {
      acc.fullContent += contentChunk;
      onContentChunk(contentChunk);
    }

    if (finishReason) {
      acc.lastFinishReason = finishReason;
      onFinishReason?.(finishReason);
    }
  } catch (e) {
    console.error("Error parsing streaming chunk:", e, { preview: data.slice(0, 120) });
  }
}

export async function streamOpenRouterChatCompletionCore({
  apiKey,
  model,
  messages,
  temperature,
  maxTokens,
  topP,
  signal,
  onContentChunk,
  onFinishReason,
}: StreamOpenRouterCoreParams): Promise<{ content: string; isGenerating: boolean; finishReason?: string }> {
  const acc = { fullContent: "", lastFinishReason: null as string | null };

  const safeMaxTokens = clampOpenRouterMaxTokens(maxTokens);

  const resolvedKey = (apiKey.trim() || getOpenRouterApiKeyForApp()).trim();
  const response = await fetch(openRouterChatCompletionUrl(), {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: openRouterAppApiHeaders(resolvedKey),
    body: JSON.stringify({
      apiKey: resolvedKey || undefined,
      model,
      messages,
      temperature,
      maxTokens: safeMaxTokens,
      topP,
      reasoning: { effort: "low" },
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    try {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.statusText} (${response.status}). Body: ${errorText}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('API Error:')) throw err;
      throw new Error(`API Error: ${response.statusText} (${response.status})`);
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Failed to get response reader for streaming.');
  }

  const decoder = new TextDecoder('utf-8');
  let sseLineBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseLineBuffer += decoder.decode(value, { stream: true });

    const lines = sseLineBuffer.split("\n");
    sseLineBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      processSseDataLine(line.substring(6).trim(), onContentChunk, onFinishReason, acc);
    }
  }

  sseLineBuffer += decoder.decode();
  if (sseLineBuffer.trim()) {
    for (const line of sseLineBuffer.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      processSseDataLine(line.substring(6).trim(), onContentChunk, onFinishReason, acc);
    }
  }

  return {
    content: acc.fullContent.trim(),
    isGenerating: false,
    finishReason: acc.lastFinishReason || undefined,
  };
}

