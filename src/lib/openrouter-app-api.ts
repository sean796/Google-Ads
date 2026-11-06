import { promptTraceInputs, recordPromptTraceCall } from "@/lib/openrouter-prompt-trace";
import {
  buildOpenRouterAppChatRequestBody,
  normalizeOpenRouterChatModel,
  openRouterAppApiHeaders,
  openRouterAssistantTextFromMessage,
  openRouterChatCompletionUrl,
  openRouterModelsCatalogUrl,
} from "./openrouter-app-api-helpers";
import type {
  OpenRouterAppChatFetchResponse,
  OpenRouterAppImageConfig,
  OpenRouterAppMessage,
  OpenRouterAppReasoning,
  OpenRouterAppResponseFormat,
  OpenRouterAppStreamDelta,
  OpenRouterModelCatalogEntry,
} from "./openrouter-app-api-types";

export {
  buildOpenRouterAppChatRequestBody,
  normalizeOpenRouterChatModel,
  openRouterAppApiHeaders,
  openRouterAssistantTextFromMessage,
  openRouterChatCompletionUrl,
  openRouterModelsCatalogUrl,
};
export { openRouterPromptText } from "./openrouter-app-api-helpers";
export type {
  OpenRouterAppChatFetchResponse,
  OpenRouterAppImageConfig,
  OpenRouterAppMessage,
  OpenRouterAppReasoning,
  OpenRouterAppResponseFormat,
  OpenRouterAppStreamDelta,
  OpenRouterModelCatalogEntry,
};

export async function getOpenRouterModelsCatalog(apiKey?: string): Promise<{
  models: OpenRouterModelCatalogEntry[];
  cachedAt: string;
}> {
  const response = await fetch(openRouterModelsCatalogUrl(), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: openRouterAppApiHeaders(apiKey),
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
  imageConfig?: OpenRouterAppImageConfig;
  tools?: unknown[];
  toolChoice?: unknown;
  webSearchOptions?: Record<string, unknown>;
  reasoning?: OpenRouterAppReasoning;
  signal?: AbortSignal;
}): Promise<{
  raw: unknown;
  content: string;
  finishReason?: string;
  nativeFinishReason?: string;
  parsed?: Record<string, unknown>;
}> {
  const effectiveModel = normalizeOpenRouterChatModel(args.model);
  const requestBody = buildOpenRouterAppChatRequestBody({ ...args, model: effectiveModel });
  const payloadStr = JSON.stringify(requestBody);
  const openRouterStart = Date.now();
  const traceInputs = promptTraceInputs(args);
  const traceSchema = args.responseFormat?.type === "json_schema" ? args.responseFormat.json_schema.name : null;
  const recordTrace = (finishReason: string, response: string, servedModel: string | null = null) =>
    recordPromptTraceCall({
      model: effectiveModel,
      servedModel,
      ...traceInputs,
      schemaName: traceSchema,
      durationMs: Date.now() - openRouterStart,
      finishReason,
      response,
    });
  console.log(
    `%c[OpenRouter API] 🚀 POST /openrouter/chat-completion`,
    "color: #84bc00; font-weight: bold;",
    {
      model: effectiveModel,
      maxTokens: args.maxTokens,
      temperature: args.temperature,
      payloadBytes: payloadStr.length,
    },
  );
  let response: Response | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    response = await fetch(openRouterChatCompletionUrl(), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      signal: args.signal,
      headers: openRouterAppApiHeaders(),
      body: payloadStr,
    });
        // Rate-limit Retry-After or backoff
        if (response.status === 429 && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          continue;
        }
        if (
          attempt < 3 &&
          (response.status === 502 || response.status === 503 || response.status === 504)
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
          continue;
        }
    break;
  }
  if (!response) {
    throw new Error("OpenRouter request failed");
  }

  const elapsedSec = ((Date.now() - openRouterStart) / 1000).toFixed(1);
  console.log(
    `%c[OpenRouter API] 🏁 Response in ${elapsedSec}s (HTTP ${response.status})`,
    response.ok ? "color: #84bc00; font-weight: bold;" : "color: #ff4444; font-weight: bold;",
    { status: response.status },
  );

  let data: {
    ok?: boolean;
    error?: string | { message?: string };
    content?: string;
    finishReason?: string;
    nativeFinishReason?: string;
    raw?: unknown;
    parsed?: Record<string, unknown>;
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    throw new Error(`OpenRouter error (${response.status})`);
  }

  // Handle direct OpenRouter responses (e.g. CLI or direct calls)
  if (data?.choices && Array.isArray(data.choices)) {
    data = {
      ok: true,
      content: data.choices[0]?.message?.content || "",
      finishReason: data.choices[0]?.finish_reason,
      raw: data,
    };
  }

  if (!response.ok || !data.ok) {
    const errorMsg =
      (typeof data.error === "string" ? data.error : data.error?.message) ||
      `OpenRouter error (${response.status})`;
    console.error(
      `%c[OpenRouter API] ❌ Error (${response.status}):`,
      "color: #ff4444; font-weight: bold;",
      errorMsg,
    );
    recordTrace(`error ${response.status}`, errorMsg);
    throw new Error(errorMsg);
  }
  const hasParsed =
    data.parsed && typeof data.parsed === "object" && !Array.isArray(data.parsed);
  if (typeof data.content !== "string") {
    if (hasParsed) {
      data.content = "";
    } else {
      const raw = data.raw && typeof data.raw === "object" ? (data.raw as Record<string, unknown>) : null;
      const choices = raw && Array.isArray(raw.choices) ? raw.choices : null;
      const message = choices && typeof choices[0] === "object" && choices[0]
        ? (choices[0] as { message?: { tool_calls?: unknown } }).message
        : undefined;
      if (!message?.tool_calls) {
        throw new Error(
          (typeof data.error === "string" ? data.error.trim() : data.error?.message?.trim()) ||
            `OpenRouter error (${response.status})`,
        );
      }
      data.content = "";
    }
  }

  let parsed =
    data.parsed && typeof data.parsed === "object" && !Array.isArray(data.parsed)
      ? data.parsed
      : undefined;
  if (!parsed && data.raw && typeof data.raw === "object") {
    const raw = data.raw as Record<string, unknown>;
    const choices = Array.isArray(raw.choices) ? raw.choices : null;
    const message =
      choices && choices[0] && typeof choices[0] === "object"
        ? (choices[0] as { message?: unknown }).message
        : undefined;
    if (message && typeof message === "object" && !Array.isArray(message)) {
      const msgParsed = (message as { parsed?: unknown }).parsed;
      if (msgParsed && typeof msgParsed === "object" && !Array.isArray(msgParsed)) {
        parsed = msgParsed as Record<string, unknown>;
      }
    }
  }
  let content = typeof data.content === "string" ? data.content : "";
  if (parsed) {
    content = JSON.stringify(parsed);
  } else if (!content.trim() && data.raw) {
    const raw = data.raw as Record<string, unknown>;
    const choices = Array.isArray(raw.choices) ? raw.choices : null;
    const message =
      choices && choices[0] && typeof choices[0] === "object"
        ? (choices[0] as { message?: unknown }).message
        : undefined;
    const fromMessage = openRouterAssistantTextFromMessage(message);
    if (fromMessage.trim()) {
      content = fromMessage;
    }
  }

  const servedModel =
    typeof (data as { model?: unknown }).model === "string"
      ? (data as { model: string }).model
      : data.raw && typeof data.raw === "object" && typeof (data.raw as { model?: unknown }).model === "string"
        ? (data.raw as { model: string }).model
        : null;
  recordTrace(data.finishReason ?? "stop", content, servedModel);
  return {
    raw: data.raw ?? data,
    content,
    finishReason: data.finishReason,
    nativeFinishReason: data.nativeFinishReason,
    parsed,
  };
}

/** SSE chat via app API: every reasoning and content delta is reported as it arrives; resolves with the full text. */
export async function streamOpenRouterAppChat(args: {
  apiKey?: string;
  model: string;
  messages: OpenRouterAppMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: OpenRouterAppResponseFormat;
  reasoning?: OpenRouterAppReasoning;
  signal?: AbortSignal;
  onDelta: (delta: OpenRouterAppStreamDelta) => void;
}): Promise<{ content: string; reasoning: string; finishReason?: string }> {
  const requestBody = { ...buildOpenRouterAppChatRequestBody({ ...args }), stream: true };
  const startedAt = Date.now();
  const acc = { content: "", reasoning: "", finishReason: undefined as string | undefined, lines: 0, servedModel: null as string | null };
  const traceInputs = promptTraceInputs(args);
  const recordTrace = (finishReason: string, response: string) =>
    recordPromptTraceCall({
      model: args.model,
      servedModel: acc.servedModel,
      ...traceInputs,
      schemaName: args.responseFormat?.type === "json_schema" ? args.responseFormat.json_schema.name : null,
      durationMs: Date.now() - startedAt,
      finishReason,
      response,
    });
  const log = (event: string, data?: unknown) => console.log(`[video:openrouter-stream] ${event}`, data ?? "");
  log("request sent", { model: args.model, maxTokens: args.maxTokens, messages: args.messages.length, reasoning: args.reasoning?.effort });
  const response = await fetch(openRouterChatCompletionUrl(), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    signal: args.signal,
    headers: openRouterAppApiHeaders(),
    body: JSON.stringify(requestBody),
  });
  log("response headers", { status: response.status, contentType: response.headers.get("content-type"), ms: Date.now() - startedAt });
  if (!response.ok || !response.body) {
    const text = (await response.text()).trim();
    console.error("[video:openrouter-stream] request failed", { status: response.status, body: text.slice(0, 500) });
    recordTrace(`error ${response.status}`, text);
    throw new Error(text || `OpenRouter error (${response.status})`);
  }
  const handleLine = (line: string) => {
    if (!line.startsWith("data: ")) return;
    const data = line.slice(6).trim();
    if (data === "[DONE]") return log("[DONE]");
    let json: {
      model?: string;
      error?: { message?: string };
      choices?: { delta?: { content?: string; reasoning?: string }; finish_reason?: string | null }[];
    };
    try {
      json = JSON.parse(data);
    } catch (e) {
      console.error("[video:openrouter-stream] unparseable line", data.slice(0, 300));
      throw e;
    }
    if (!acc.servedModel && typeof json.model === "string" && json.model.trim()) {
      acc.servedModel = json.model;
    }
    if (json.error) {
      console.error("[video:openrouter-stream] error event", json.error);
      throw new Error(json.error.message?.trim() || "OpenRouter stream error");
    }
    const choice = json.choices?.[0];
    const content = typeof choice?.delta?.content === "string" ? choice.delta.content : "";
    const reasoning = typeof choice?.delta?.reasoning === "string" ? choice.delta.reasoning : "";
    acc.lines += 1;
    if (content || reasoning) {
      acc.content += content;
      acc.reasoning += reasoning;
      log(`delta #${acc.lines}`, { reasoning, content });
      args.onDelta({ reasoning, content });
    } else {
      log(`delta #${acc.lines} (no text)`, choice ?? json);
    }
    if (choice?.finish_reason) {
      acc.finishReason = choice.finish_reason;
      log("finish_reason", choice.finish_reason);
    }
  };
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let firstByte = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!firstByte) {
        firstByte = true;
        log("first bytes", { bytes: value.byteLength, ms: Date.now() - startedAt });
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handleLine);
    }
    buffer += decoder.decode();
    buffer.split("\n").forEach(handleLine);
  } catch (error) {
    recordTrace("aborted", acc.content);
    throw error;
  }
  recordTrace(acc.finishReason ?? "stop", acc.content);
  log("stream closed", {
    seconds: Math.round((Date.now() - startedAt) / 1000),
    lines: acc.lines,
    reasoningChars: acc.reasoning.length,
    contentChars: acc.content.length,
    finishReason: acc.finishReason,
  });
  return { content: acc.content.trim(), reasoning: acc.reasoning.trim(), finishReason: acc.finishReason };
}


/** Non-stream chat via app API; same call shape as the old OpenRouter fetch. */
export async function postOpenRouterAppChatFetch(init: RequestInit): Promise<OpenRouterAppChatFetchResponse> {
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
    image_config?: OpenRouterAppImageConfig;
    tools?: unknown[];
    tool_choice?: unknown;
    toolChoice?: unknown;
    webSearchOptions?: Record<string, unknown>;
    web_search_options?: Record<string, unknown>;
  };
  try {
    const result = await postOpenRouterAppChat({
      model: parsed.model ?? "",
      messages: parsed.messages,
      system: parsed.system,
      user: parsed.user,
      temperature: parsed.temperature,
      maxTokens: parsed.maxTokens ?? parsed.max_tokens,
      topP: parsed.topP ?? parsed.top_p,
      responseFormat: parsed.responseFormat ?? parsed.response_format,
      modalities: parsed.modalities,
      imageConfig: parsed.image_config,
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
      statusText: "OK",
      json: async () => json,
      text: async () => JSON.stringify(json),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const json = { error: { message } };
    return {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => json,
      text: async () => JSON.stringify(json),
    };
  }
}
