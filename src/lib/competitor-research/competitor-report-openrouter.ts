import { REPORT_TEMPERATURE } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { postOpenRouterAppChat, type OpenRouterAppReasoning, type OpenRouterAppResponseFormat } from "@/lib/openrouter-app-api";

export async function callOpenRouterChatCompletion(args: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  signal?: AbortSignal;
  /** Defaults to REPORT_TEMPERATURE. Use a lower value for structured JSON outputs. */
  temperature?: number;
  /** When set, requests JSON-only output on models that support OpenAI-style response_format. */
  responseFormat?: OpenRouterAppResponseFormat;
  reasoning?: OpenRouterAppReasoning;
}): Promise<{
  raw: unknown;
  content: string;
  parsed?: Record<string, unknown>;
  finishReason?: string;
  nativeFinishReason?: string;
}> {
  return postOpenRouterAppChat({
    apiKey: args.apiKey,
    model: args.model,
    system: args.system,
    user: args.user,
    maxTokens: args.maxTokens,
    signal: args.signal,
    temperature: args.temperature ?? REPORT_TEMPERATURE,
    responseFormat: args.responseFormat,
    reasoning: args.reasoning ?? { effort: "low" },
  });
}
