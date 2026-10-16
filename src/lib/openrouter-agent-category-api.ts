import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import {
  appendMasterInstructionsToSystemPrompt,
  ensureMasterInstructionsInMemory,
} from "@/lib/master-instructions-storage";
import { injectBlacklistRagIntoMessages } from "@/lib/content-word-blocklist";
import {
  getAdsModel,
  getBlogModel,
  getImageModel,
  getMetaModel,
  getReportModel,
  getResearchModel,
  getVideoModel,
} from "@/lib/optimization-settings-storage";
import {
  postOpenRouterAppChat,
  streamOpenRouterAppChat,
  type OpenRouterAppMessage,
  type OpenRouterAppReasoning,
  type OpenRouterAppResponseFormat,
  type OpenRouterAppStreamDelta,
} from "@/lib/openrouter-app-api";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { runHarnessOpenRouterSection } from "@/lib/bulk/harness-openrouter-worker-client";

export type AgentOpenRouterCategory =
  | "research"
  | "blog"
  | "image"
  | "meta"
  | "report"
  | "ads"
  | "video";

export function resolveModelForAgentCategory(
  category: AgentOpenRouterCategory,
  siteId?: string | null,
): string {
  switch (category) {
    case "research":
      return getResearchModel(siteId ?? undefined);
    case "blog":
      return getBlogModel(siteId);
    case "image":
      return getImageModel(siteId);
    case "meta":
      return getMetaModel(siteId);
    case "report":
      return getReportModel(siteId);
    case "ads":
      return getAdsModel(siteId);
    case "video":
      return getVideoModel(siteId);
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

async function prepareAgentMessages(args: {
  messages?: OpenRouterAppMessage[];
  system?: string;
  user?: string;
  siteId?: string | null;
  useMasterInstructions?: boolean;
  useWordBlacklist?: boolean;
}): Promise<{
  messages?: OpenRouterAppMessage[];
  system?: string;
  user?: string;
}> {
  if (args.useMasterInstructions) {
    await ensureMasterInstructionsInMemory(args.siteId ?? null);
  }

  let system = args.system;
  if (args.useMasterInstructions && system?.trim()) {
    system = appendMasterInstructionsToSystemPrompt(system, args.siteId ?? null);
  }

  let messages = args.messages ? [...args.messages] : undefined;
  if (args.useMasterInstructions && messages?.length) {
    messages = messages.map((m) =>
      m.role === "system" && typeof m.content === "string"
        ? { ...m, content: appendMasterInstructionsToSystemPrompt(m.content, args.siteId ?? null) }
        : m,
    );
  }

  if (args.useWordBlacklist) {
    if (messages?.length) {
      const stringMessages = messages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }));
      messages = injectBlacklistRagIntoMessages(stringMessages) as OpenRouterAppMessage[];
    } else if (system !== undefined && args.user !== undefined) {
      const injected = injectBlacklistRagIntoMessages([
        { role: "system", content: system },
        { role: "user", content: args.user },
      ]);
      system = injected[0]?.content ?? system;
      return { system, user: injected[1]?.content ?? args.user };
    }
  }

  return { messages, system, user: args.user };
}

/** Streaming variant: the category model's reasoning and content deltas arrive through `onDelta` as they are written. */
export async function streamAgentCategoryOpenRouterChat(args: {
  category: AgentOpenRouterCategory;
  siteId?: string | null;
  apiKey?: string;
  messages: OpenRouterAppMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: OpenRouterAppResponseFormat;
  reasoning?: OpenRouterAppReasoning;
  useMasterInstructions?: boolean;
  useWordBlacklist?: boolean;
  signal?: AbortSignal;
  onDelta: (delta: OpenRouterAppStreamDelta) => void;
}): Promise<{ content: string; reasoning: string; finishReason?: string }> {
  const apiKey = (args.apiKey ?? (await resolveOpenRouterApiKeyForHarness())).trim();
  const prepared = await prepareAgentMessages({
    messages: args.messages,
    siteId: args.siteId,
    useMasterInstructions: args.useMasterInstructions,
    useWordBlacklist: args.useWordBlacklist,
  });

  return streamOpenRouterAppChat({
    apiKey,
    model: resolveModelForAgentCategory(args.category, args.siteId),
    messages: prepared.messages ?? args.messages,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    responseFormat: args.responseFormat,
    reasoning: args.reasoning,
    signal: args.signal,
    onDelta: args.onDelta,
  });
}

export async function callAgentCategoryOpenRouterChat(args: {
  category: AgentOpenRouterCategory;
  siteId?: string | null;
  apiKey?: string;
  system?: string;
  user?: string;
  messages?: OpenRouterAppMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: OpenRouterAppResponseFormat;
  reasoning?: OpenRouterAppReasoning;
  useMasterInstructions?: boolean;
  useWordBlacklist?: boolean;
  signal?: AbortSignal;
}): Promise<{
  raw: unknown;
  content: string;
  finishReason?: string;
  nativeFinishReason?: string;
}> {
  const model = resolveModelForAgentCategory(args.category, args.siteId);
  const apiKey = (args.apiKey ?? (await resolveOpenRouterApiKeyForHarness())).trim();
  const prepared = await prepareAgentMessages({
    messages: args.messages,
    system: args.system,
    user: args.user,
    siteId: args.siteId,
    useMasterInstructions: args.useMasterInstructions,
    useWordBlacklist: args.useWordBlacklist,
  });

  if (prepared.messages?.length) {
    return postOpenRouterAppChat({
      apiKey,
      model,
      messages: prepared.messages,
      temperature: args.temperature,
      maxTokens: args.maxTokens,
      responseFormat: args.responseFormat,
      reasoning: args.reasoning ?? (args.category === "research" || args.category === "report" ? { effort: "low" } : undefined),
      signal: args.signal,
    });
  }

  if (!prepared.system?.trim() || prepared.user === undefined) {
    throw new Error("OpenRouter agent call requires system and user, or messages.");
  }

  return callOpenRouterChatCompletion({
    apiKey,
    model,
    system: prepared.system,
    user: prepared.user,
    maxTokens: args.maxTokens ?? 16000,
    temperature: args.temperature,
    responseFormat: args.responseFormat,
    reasoning: args.reasoning ?? (args.category === "research" || args.category === "report" ? { effort: "low" } : undefined),
    signal: args.signal,
  });
}

/** Web Worker section streaming wrapper that resolves the category model on the main thread before posting to the worker. */
export async function runAgentCategoryWorkerSection(args: {
  category: AgentOpenRouterCategory;
  siteId?: string | null;
  sectionIndex: number;
  apiKey: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature: number;
  maxTokens: number;
  topP: number;
  httpReferer: string;
}): Promise<{ content: string; finishReason?: string }> {
  return runHarnessOpenRouterSection({
    sectionIndex: args.sectionIndex,
    apiKey: args.apiKey.trim(),
    model: resolveModelForAgentCategory(args.category, args.siteId),
    messages: args.messages,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    topP: args.topP,
    httpReferer: args.httpReferer,
  });
}
