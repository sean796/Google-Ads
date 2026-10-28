import type { Message } from '@/lib/api';
import { streamChatCompletion } from '@/lib/api';
import type { HarnessOpenRouterWorkerPayload } from '@/lib/bulk/harness-openrouter-payload';
import { resolveOpenRouterWebReferer } from '@/lib/openrouter-attribution';

export type { HarnessOpenRouterWorkerPayload };

export function resolveHarnessHttpReferer(): string {
  return resolveOpenRouterWebReferer();
}

/**
 * One streaming OpenRouter harness section: dedicated module worker when available,
 * otherwise parallel main-thread streamChatCompletion (e.g. Vitest / no Worker).
 */
export async function runHarnessOpenRouterSection(
  payload: HarnessOpenRouterWorkerPayload,
): Promise<{ content: string; finishReason?: string }> {
  let buf = '';
  let finishReason: string | undefined;
  const result = await streamChatCompletion({
    apiKey: payload.apiKey,
    model: payload.model,
    messages: payload.messages as Message[],
    temperature: payload.temperature,
    maxTokens: payload.maxTokens,
    topP: payload.topP,
    onContentChunk: (c) => {
      buf += c;
    },
    onFinishReason: (r) => {
      finishReason = r;
    },
  });
  return { content: result.content || buf, finishReason: result.finishReason ?? finishReason };
}
