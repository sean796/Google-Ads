import { getSessionToken } from "@/lib/auth-device";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import type {
  OpenRouterAppImageConfig,
  OpenRouterAppMessage,
  OpenRouterAppReasoning,
  OpenRouterAppResponseFormat,
} from "./openrouter-app-api-types";

export function openRouterChatCompletionUrl(): string {
  return backendApiUrl("/openrouter/chat-completion");
}

export function openRouterModelsCatalogUrl(): string {
  return backendApiUrl("/openrouter/models");
}

/** Coerce OpenRouter system/user prompt fields to trimmed strings (handles bad runtime types). */
export function openRouterPromptText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

/** Non-stream assistant text when `content` is empty (reasoning models, structured `parsed`). */
export function openRouterAssistantTextFromMessage(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const msg = message as Record<string, unknown>;
  const content = msg.content;
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (trimmed) return trimmed;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") {
        const trimmed = text.trim();
        if (trimmed) parts.push(trimmed);
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  if (typeof msg.reasoning === "string") {
    const trimmed = msg.reasoning.trim();
    if (trimmed) return trimmed;
  }
  const details = msg.reasoning_details;
  if (Array.isArray(details)) {
    const parts: string[] = [];
    for (const detail of details) {
      if (!detail || typeof detail !== "object") continue;
      const text = (detail as { text?: unknown }).text;
      if (typeof text === "string") {
        const trimmed = text.trim();
        if (trimmed) parts.push(trimmed);
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  const parsed = msg.parsed;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return JSON.stringify(parsed);
  }
  return "";
}

export function openRouterAppApiHeaders(_apiKey?: string): Headers {
  // Wave 0: no key leaves the browser. Session Bearer only; the server
  // resolves its own OpenRouter key. The apiKey argument is accepted and
  // ignored so existing callers keep compiling.
  void _apiKey;
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getSessionToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

function messageContentNonEmpty(content: OpenRouterAppMessage["content"]): boolean {
  if (typeof content === "string") return content.trim().length > 0;
  if (Array.isArray(content)) return content.length > 0;
  return false;
}

function filterOpenRouterAppMessages(messages: OpenRouterAppMessage[] | undefined): OpenRouterAppMessage[] {
  if (!messages?.length) return [];
  return messages.filter((msg) => {
    const role = openRouterPromptText(msg.role);
    return role.length > 0 && messageContentNonEmpty(msg.content);
  });
}

export function normalizeOpenRouterChatModel(model: string): string {
  if (
    model === "liquid/d1.1" ||
    model === "liquid/lfm-2.5-2.6b" ||
    model === "liquid/lfm-2.5-2.6b:free"
  ) {
    return "liquid/lfm-2.5-24b-a2b";
  }
  return model;
}

/** Wire JSON for POST /openrouter/chat-completion (messages or system+user, never an empty mix). */
export function buildOpenRouterAppChatRequestBody(args: {
  apiKey?: string;
  model: string;
  messages?: OpenRouterAppMessage[];
  system?: string;
  user?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  responseFormat?: OpenRouterAppResponseFormat;
  modalities?: string[];
  imageConfig?: OpenRouterAppImageConfig;
  tools?: unknown[];
  toolChoice?: unknown;
  webSearchOptions?: Record<string, unknown>;
  reasoning?: OpenRouterAppReasoning;
}): Record<string, unknown> {
  const system = openRouterPromptText(args.system);
  const user = openRouterPromptText(args.user);
  const filteredMessages = filterOpenRouterAppMessages(args.messages);

  const effectiveModel = normalizeOpenRouterChatModel(args.model);

  // One model per call. No silent fallback: if the requested model fails,
  // the call fails visibly and the prompt trace shows what was requested.
  const base: Record<string, unknown> = {
    model: effectiveModel,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    topP: args.topP,
    stream: false,
    responseFormat: args.responseFormat,
    modalities: args.modalities,
    image_config: args.imageConfig,
    tools: args.tools,
    tool_choice: args.toolChoice,
    webSearchOptions: args.webSearchOptions,
    reasoning: args.reasoning ?? { effort: "low" },
  };

  if (filteredMessages.length > 0) {
    return { ...base, messages: filteredMessages };
  }
  if (system !== "" && user !== "") {
    return { ...base, system, user };
  }
  if (user !== "") {
    return { ...base, user };
  }
  if (system !== "") {
    return { ...base, system };
  }

  throw new Error("OpenRouter chat request has no message content.");
}
