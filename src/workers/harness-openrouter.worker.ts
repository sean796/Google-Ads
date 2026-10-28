/// <reference lib="webworker" />

import { postOpenRouterAppChat } from '../lib/openrouter-app-api';
import { clampOpenRouterMaxTokens } from '../lib/openrouter-stream-token-limits';
import type { HarnessOpenRouterWorkerPayload } from '../lib/bulk/harness-openrouter-payload';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<HarnessOpenRouterWorkerPayload>) => {
  const data = e.data;
  void (async () => {
    try {
      const result = await postOpenRouterAppChat({
        apiKey: data.apiKey,
        model: data.model,
        messages: data.messages,
        temperature: data.temperature,
        maxTokens: clampOpenRouterMaxTokens(data.maxTokens),
        topP: data.topP,
        reasoning: { effort: 'low' },
      });
      ctx.postMessage({
        type: 'done' as const,
        sectionIndex: data.sectionIndex,
        content: (result.content ?? '').trim(),
        finishReason: result.finishReason,
      });
    } catch (err) {
      ctx.postMessage({
        type: 'error' as const,
        sectionIndex: data.sectionIndex,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();
};
