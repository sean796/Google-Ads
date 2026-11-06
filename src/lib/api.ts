import { resolveOpenRouterWebReferer } from "@/lib/openrouter-attribution";
import { streamOpenRouterChatCompletionCore } from "@/lib/openrouter-stream-chat-core";

interface GenerationResult {
  plan: string;
  draft: string;
  final: string;
  currentStage: 'idle' | 'planning' | 'plan_approval_pending' | 'drafting' | 'reviewing' | 'complete' | 'error';
  isGenerating: boolean;
  planApproved?: boolean;
}

interface ChatCompletionRequest {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  signal?: AbortSignal;
}

const OPENROUTER_API_KEY_STORAGE_KEY = "openrouter-api-key";
const DATAFORSEO_API_KEY_STORAGE_KEY = "dataforseo-api-key";
const SEMRUSH_API_KEY_STORAGE_KEY = "semrush-api-key";
const AGENTMAIL_API_KEY_STORAGE_KEY = "agentmail-api-key";
const AGENTMAIL_INBOX_STORAGE_KEY = "agentmail-general-email";
const SLACK_BOT_TOKEN_STORAGE_KEY = "slack-bot-token";
const SLACK_GLOBAL_SETTINGS_STORAGE_KEY = "slack-global-settings";

export const loadApiKey = () => {
    // Wave 0: no baked env key in the bundle. Locally saved user key only.
    if (typeof localStorage === "undefined") return "";
    const stored = localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY) || "";
    return stored.trim() ? stored : "";
};

export const saveApiKey = (key: string) => {
    if (key) {
        localStorage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, key);
    } else {
        localStorage.removeItem(OPENROUTER_API_KEY_STORAGE_KEY);
    }
};

export const loadDataForSEOApiKey = () => {
    const envKey =
      typeof process !== "undefined"
        ? (process.env.DATAFORSEO_API_KEY ?? process.env.DATAFORSEO_LOGIN)?.trim() ?? ""
        : "";
    if (envKey) return envKey;
    if (typeof localStorage === "undefined") return "";
    return localStorage.getItem(DATAFORSEO_API_KEY_STORAGE_KEY) || "";
};

export const saveDataForSEOApiKey = (key: string) => {
    if (key) {
        localStorage.setItem(DATAFORSEO_API_KEY_STORAGE_KEY, key);
    } else {
        localStorage.removeItem(DATAFORSEO_API_KEY_STORAGE_KEY);
    }
};

export const loadSemrushApiKey = () => {
    const envKey =
      typeof process !== "undefined"
        ? (process.env.SEMRUSH_API_KEY ?? process.env.NEO_PULSE_APP_SEMRUSH_API_KEY)?.trim() ?? ""
        : "";
    if (envKey) return envKey;
    if (typeof localStorage === "undefined") return "";
    return localStorage.getItem(SEMRUSH_API_KEY_STORAGE_KEY) || "";
};

/** Browser calls omit MCP PAT so the server can use the configured Semrush API key. */
export const loadSemrushApiKeyForAppRequests = (): string => {
    const key = loadSemrushApiKey().trim();
    if (key.startsWith("semrtkn-")) return "";
    return key;
};

export const saveSemrushApiKey = (key: string) => {
    if (key) {
        localStorage.setItem(SEMRUSH_API_KEY_STORAGE_KEY, key);
    } else {
        localStorage.removeItem(SEMRUSH_API_KEY_STORAGE_KEY);
    }
};

export const loadAgentMailApiKey = () => {
    return localStorage.getItem(AGENTMAIL_API_KEY_STORAGE_KEY) || "";
};

export const saveAgentMailApiKey = (key: string) => {
    if (key) {
        localStorage.setItem(AGENTMAIL_API_KEY_STORAGE_KEY, key);
    } else {
        localStorage.removeItem(AGENTMAIL_API_KEY_STORAGE_KEY);
    }
};

export const loadAgentMailInbox = () => {
    return localStorage.getItem(AGENTMAIL_INBOX_STORAGE_KEY) || "";
};

export const saveAgentMailInbox = (inbox: string) => {
    if (inbox) {
        localStorage.setItem(AGENTMAIL_INBOX_STORAGE_KEY, inbox);
    } else {
        localStorage.removeItem(AGENTMAIL_INBOX_STORAGE_KEY);
    }
};

export interface SlackGlobalSettings {
  /** Slack API → App Credentials → App ID */
  slackAppId?: string;
  /** Optional copy of "Date of App Creation" from the Slack app page. */
  appCreatedAt?: string;
  /** App Credentials → Client ID (OAuth). */
  clientId?: string;
  /** App Credentials → Client Secret (sensitive). */
  clientSecret?: string;
  /** App Credentials → Signing Secret (Events API; prefer env in production). */
  signingSecret?: string;
  /** Deprecated by Slack; optional legacy verification. */
  verificationToken?: string;
  /** From auth.test or manual label. */
  workspaceLabel?: string;
  /** When false, NEO Pulse does not send Slack messages. Default true when unset. */
  notificationsEnabled?: boolean;
  /** Fallback channel when a site has no channel ID. */
  defaultChannelId?: string;
  /** Prepended to outbound messages (e.g. [NEO Pulse][prod]). */
  messagePrefix?: string;
  /** Mirror Slack → OAuth & Permissions → Redirect URLs (paste the same into Slack). */
  redirectUrls?: string[];
}

function defaultSlackGlobalSettings(): SlackGlobalSettings {
  return {
    notificationsEnabled: true,
    messagePrefix: "",
    defaultChannelId: "",
    slackAppId: "",
    appCreatedAt: "",
    clientId: "",
    clientSecret: "",
    signingSecret: "",
    verificationToken: "",
    workspaceLabel: "",
    redirectUrls: [],
  };
}

export const loadSlackBotToken = (): string => {
  try {
    return localStorage.getItem(SLACK_BOT_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
};

export const saveSlackBotToken = (key: string) => {
  if (key) {
    localStorage.setItem(SLACK_BOT_TOKEN_STORAGE_KEY, key);
  } else {
    localStorage.removeItem(SLACK_BOT_TOKEN_STORAGE_KEY);
  }
};

export const loadSlackGlobalSettings = (): SlackGlobalSettings => {
  try {
    const raw = localStorage.getItem(SLACK_GLOBAL_SETTINGS_STORAGE_KEY);
    if (!raw) return defaultSlackGlobalSettings();
    const parsed = JSON.parse(raw) as Partial<SlackGlobalSettings>;
    const merged = { ...defaultSlackGlobalSettings(), ...parsed };
    if (!Array.isArray(merged.redirectUrls)) {
      merged.redirectUrls = [];
    } else {
      merged.redirectUrls = merged.redirectUrls.filter((u) => typeof u === "string");
    }
    return merged;
  } catch {
    return defaultSlackGlobalSettings();
  }
};

export const saveSlackGlobalSettings = (partial: Partial<SlackGlobalSettings>) => {
  const next = { ...loadSlackGlobalSettings(), ...partial };
  try {
    localStorage.setItem(SLACK_GLOBAL_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
};

export const streamGeneration = async ({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  temperature,
  maxTokens,
  topP,
  onContentChunk,
  signal,
}: ChatCompletionRequest & { onContentChunk: (chunk: string) => void }): Promise<{ content: string; isGenerating: boolean }> => {
  return streamOpenRouterChatCompletionCore({
    apiKey,
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    maxTokens,
    topP,
    httpReferer: resolveOpenRouterWebReferer(),
    signal,
    onContentChunk,
  });
};

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChatRequest {
  apiKey: string;
  model: string;
  messages: Message[];
  temperature: number;
  maxTokens: number;
  topP: number;
  signal?: AbortSignal;
  /** When true, prepends read-only WORD BLACKLIST RAG to the first user message. */
  contentHarness?: boolean;
}

export const streamChatCompletion = async ({
  apiKey,
  model,
  messages,
  temperature,
  maxTokens,
  topP,
  onContentChunk,
  onFinishReason,
  signal,
  contentHarness,
}: StreamChatRequest & { 
  onContentChunk: (chunk: string) => void;
  onFinishReason?: (reason: string) => void;
}): Promise<{ content: string; isGenerating: boolean; finishReason?: string }> => {
  const httpReferer = resolveOpenRouterWebReferer();

  let outboundMessages = messages;
  if (contentHarness) {
    const { injectBlacklistRagIntoMessages } = await import("@/lib/content-word-blocklist");
    outboundMessages = injectBlacklistRagIntoMessages(messages);
  }

  return streamOpenRouterChatCompletionCore({
    apiKey,
    model,
    messages: outboundMessages,
    temperature,
    maxTokens,
    topP,
    httpReferer,
    signal,
    onContentChunk,
    onFinishReason,
  });
};

export type { GenerationResult, ChatCompletionRequest };
