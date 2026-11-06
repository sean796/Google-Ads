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

/** OpenRouter `reasoning` request field; effort bounds how many output tokens a reasoning model spends thinking. */
export type OpenRouterAppReasoning = { effort: "low" | "medium" | "high" };
/** OpenRouter chat-completions image output options; `aspect_ratio` is the only way to fix the frame shape for Gemini image models. */
export type OpenRouterAppImageConfig = { aspect_ratio: string };

export type OpenRouterModelCatalogEntry = {
  id: string;
  name: string;
  promptUsdPerToken: number | null;
  completionUsdPerToken: number | null;
  imageUsdPerToken: number | null;
  contextLength: number | null;
  textOutput: boolean;
  imageOutput: boolean;
  videoOutput: boolean;
  /** Legacy: local Ollama rows from API; stripped client-side and never used. */
  local?: boolean;
};


export type OpenRouterAppStreamDelta = { reasoning: string; content: string };

export type OpenRouterAppChatFetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<Record<string, unknown>>;
  text: () => Promise<string>;
};
