import { getSessionToken } from "@/lib/auth-device";
import { getOpenRouterApiKeyForApp } from "@/lib/openrouter-api-key-resolve";
import { backendApiUrl } from "@/lib/wordpress-api/connection";

export type OpenRouterAppMessage = {
  role: "system" | "user" | "assistant";
  content: string | unknown[];
};

export type OpenRouterAppResponseFormat =
  | { type: "json_object" }
  | {
      type: "json_schema";
      json_schema: {
        name: string;
        strict: boolean;
        schema: Record<string, unknown>;
      };
    };

export function openRouterChatCompletionUrl(): string {
  return backendApiUrl("/openrouter/chat-completion");
}

export function openRouterModelsCatalogUrl(): string {
  return backendApiUrl("/openrouter/models");
}

export type OpenRouterModelCatalogEntry = {
  id: string;
  name: string;
  promptUsdPerToken: number | null;
  completionUsdPerToken: number | null;
  imageUsdPerToken: number | null;
  contextLength: number | null;
  textOutput: boolean;
  imageOutput: boolean;
  /** True when the row comes from Ollama /api/tags (local inference). */
  local?: boolean;
};

export async function getOpenRouterModelsCatalog(_apiKey?: string): Promise<{
  models: OpenRouterModelCatalogEntry[];
  cachedAt: string;
}> {
  const response = await fetch(openRouterModelsCatalogUrl(), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: openRouterAppApiHeaders(),
  });

  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
    models?: OpenRouterModelCatalogEntry[];
    cachedAt?: string;
  };

  if (!response.ok || !data.ok || !Array.isArray(data.models)) {
    throw new Error(data.error?.trim() || `OpenRouter models error (${response.status})`);
  }

  return {
    models: data.models,
    cachedAt: typeof data.cachedAt === "string" ? data.cachedAt : new Date().toISOString(),
  };
}

export function openRouterAppApiHeaders(apiKey?: string): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const key = (apiKey ?? getOpenRouterApiKeyForApp()).trim();
  if (key) headers.set("X-OpenRouter-Api-Key", key);
  return headers;
}

export async function postOpenRouterAppChat(args: {
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
  size?: string;
  tools?: unknown[];
  toolChoice?: unknown;
  webSearchOptions?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<{
  raw: unknown;
  content: string;
  finishReason?: string;
  nativeFinishReason?: string;
}> {
  const apiKey = (args.apiKey ?? getOpenRouterApiKeyForApp()).trim();
  const response = await fetch(openRouterChatCompletionUrl(), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    signal: args.signal,
    headers: openRouterAppApiHeaders(apiKey),
    body: JSON.stringify({
      apiKey: apiKey || undefined,
      model: args.model,
      messages: args.messages,
      system: args.system,
      user: args.user,
      temperature: args.temperature,
      maxTokens: args.maxTokens,
      topP: args.topP,
      stream: false,
      responseFormat: args.responseFormat,
      modalities: args.modalities,
      size: args.size,
      tools: args.tools,
      tool_choice: args.toolChoice,
      webSearchOptions: args.webSearchOptions,
    }),
  });

  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
    content?: string;
    finishReason?: string;
    nativeFinishReason?: string;
    raw?: unknown;
  };

  if (!response.ok || !data.ok) {
    throw new Error(data.error?.trim() || `OpenRouter error (${response.status})`);
  }
  if (typeof data.content !== "string") {
    const raw = data.raw && typeof data.raw === "object" ? (data.raw as Record<string, unknown>) : null;
    const choices = raw && Array.isArray(raw.choices) ? raw.choices : null;
    const message = choices && typeof choices[0] === "object" && choices[0]
      ? (choices[0] as { message?: { tool_calls?: unknown } }).message
      : undefined;
    if (!message?.tool_calls) {
      throw new Error(data.error?.trim() || `OpenRouter error (${response.status})`);
    }
    data.content = "";
  }

  return {
    raw: data.raw ?? data,
    content: typeof data.content === "string" ? data.content : "",
    finishReason: data.finishReason,
    nativeFinishReason: data.nativeFinishReason,
  };
}

/** Non-stream chat via app API; same call shape as the old OpenRouter fetch. */
export async function postOpenRouterAppChatFetch(init: RequestInit): Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<Record<string, unknown>>;
  text: () => Promise<string>;
}> {
  const parsed = JSON.parse(String(init.body ?? "{}")) as {
    apiKey?: string;
    model?: string;
    messages?: OpenRouterAppMessage[];
    system?: string;
    user?: string;
    temperature?: number;
    max_tokens?: number;
    maxTokens?: number;
    top_p?: number;
    topP?: number;
    response_format?: OpenRouterAppResponseFormat;
    responseFormat?: OpenRouterAppResponseFormat;
    modalities?: string[];
    size?: string;
    tools?: unknown[];
    tool_choice?: unknown;
    toolChoice?: unknown;
    webSearchOptions?: Record<string, unknown>;
    web_search_options?: Record<string, unknown>;
  };
  try {
    const result = await postOpenRouterAppChat({
      apiKey: parsed.apiKey?.trim() || getOpenRouterApiKeyForApp() || undefined,
      model: parsed.model ?? "",
      messages: parsed.messages,
      system: parsed.system,
      user: parsed.user,
      temperature: parsed.temperature,
      maxTokens: parsed.maxTokens ?? parsed.max_tokens,
      topP: parsed.topP ?? parsed.top_p,
      responseFormat: parsed.responseFormat ?? parsed.response_format,
      modalities: parsed.modalities,
      size: parsed.size,
      tools: parsed.tools,
      toolChoice: parsed.toolChoice ?? parsed.tool_choice,
      webSearchOptions: parsed.webSearchOptions ?? parsed.web_search_options,
      signal: init.signal ?? undefined,
    });
    const raw =
      result.raw && typeof result.raw === "object"
        ? (result.raw as Record<string, unknown>)
        : null;
    const json = raw && Array.isArray(raw.choices)
      ? raw
      : {
          choices: [
            {
              message: { content: result.content },
              finish_reason: result.finishReason,
              native_finish_reason: result.nativeFinishReason,
            },
          ],
        };
    return {
      ok: true,
      status: 200,
      json: async () => json,
      text: async () => JSON.stringify(json),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const json = { error: { message } };
    return {
      ok: false,
      status: 500,
      json: async () => json,
      text: async () => JSON.stringify(json),
    };
  }
}
