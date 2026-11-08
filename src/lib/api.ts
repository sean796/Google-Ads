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

// Wave 1 (C5): API keys live server-side (server env first, then the manager
// cloud snapshot). The browser keeps them in memory only, hydrated from the
// cloud snapshot at boot; localStorage is never written for credentials, and
// legacy stored copies are scrubbed on hydration.
const CREDENTIAL_STORAGE_KEYS = [
    OPENROUTER_API_KEY_STORAGE_KEY,
    DATAFORSEO_API_KEY_STORAGE_KEY,
    SEMRUSH_API_KEY_STORAGE_KEY,
    AGENTMAIL_API_KEY_STORAGE_KEY,
] as const;

const runtimeApiKeys = {
    openRouter: "",
    dataForSeo: "",
    semrush: "",
    agentMail: "",
    agentMailInbox: "",
};

function scrubLegacyStoredApiKeys(): void {
    try {
        for (const k of CREDENTIAL_STORAGE_KEYS) localStorage.removeItem(k);
    } catch {
        /* storage unavailable */
    }
}

/** Hydrate in-memory API keys from the manager cloud snapshot keys record. */
export function hydrateRuntimeApiKeys(keys: Record<string, unknown> | null | undefined): void {
    if (keys && typeof keys === "object") {
        const read = (name: string): string =>
            typeof keys[name] === "string" ? (keys[name] as string) : "";
        if (Object.prototype.hasOwnProperty.call(keys, OPENROUTER_API_KEY_STORAGE_KEY)) {
            runtimeApiKeys.openRouter = read(OPENROUTER_API_KEY_STORAGE_KEY);
        }
        if (Object.prototype.hasOwnProperty.call(keys, DATAFORSEO_API_KEY_STORAGE_KEY)) {
            runtimeApiKeys.dataForSeo = read(DATAFORSEO_API_KEY_STORAGE_KEY);
        }
        if (Object.prototype.hasOwnProperty.call(keys, SEMRUSH_API_KEY_STORAGE_KEY)) {
            runtimeApiKeys.semrush = read(SEMRUSH_API_KEY_STORAGE_KEY);
        }
        if (Object.prototype.hasOwnProperty.call(keys, AGENTMAIL_API_KEY_STORAGE_KEY)) {
            runtimeApiKeys.agentMail = read(AGENTMAIL_API_KEY_STORAGE_KEY);
        }
        if (Object.prototype.hasOwnProperty.call(keys, AGENTMAIL_INBOX_STORAGE_KEY)) {
            runtimeApiKeys.agentMailInbox = read(AGENTMAIL_INBOX_STORAGE_KEY);
        }
    }
    scrubLegacyStoredApiKeys();
}

export const loadApiKey = () => runtimeApiKeys.openRouter;

export const saveApiKey = (key: string) => {
    runtimeApiKeys.openRouter = key;
    scrubLegacyStoredApiKeys();
};

export const loadDataForSEOApiKey = () => {
    const envKey =
      typeof process !== "undefined"
        ? (process.env.DATAFORSEO_API_KEY ?? process.env.DATAFORSEO_LOGIN)?.trim() ?? ""
        : "";
    if (envKey) return envKey;
    return runtimeApiKeys.dataForSeo;
};

export const saveDataForSEOApiKey = (key: string) => {
    runtimeApiKeys.dataForSeo = key;
    scrubLegacyStoredApiKeys();
};

export const loadSemrushApiKey = () => {
    const envKey =
      typeof process !== "undefined"
        ? (process.env.SEMRUSH_API_KEY ?? process.env.NEO_PULSE_APP_SEMRUSH_API_KEY)?.trim() ?? ""
        : "";
    if (envKey) return envKey;
    return runtimeApiKeys.semrush;
};

/** Browser calls omit MCP PAT so the server can use the configured Semrush API key. */
export const loadSemrushApiKeyForAppRequests = (): string => {
    const key = loadSemrushApiKey().trim();
    if (key.startsWith("semrtkn-")) return "";
    return key;
};

export const saveSemrushApiKey = (key: string) => {
    runtimeApiKeys.semrush = key;
    scrubLegacyStoredApiKeys();
};

export const loadAgentMailApiKey = () => runtimeApiKeys.agentMail;

export const saveAgentMailApiKey = (key: string) => {
    runtimeApiKeys.agentMail = key;
    scrubLegacyStoredApiKeys();
};

export const loadAgentMailInbox = () => runtimeApiKeys.agentMailInbox;

export const saveAgentMailInbox = (inbox: string) => {
    runtimeApiKeys.agentMailInbox = inbox;
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
