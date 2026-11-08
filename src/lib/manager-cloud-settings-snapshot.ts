import { MANAGER_SETTINGS_CLUSTER_KEY } from "@/components/manager/manager-settings-cluster";
import { WORDPRESS_SITES_STORAGE_KEY, KB_FILES_STORAGE_KEY } from "@/components/integrations/types";
import { WORDPRESS_BENCHMARK_CATEGORY_TAGS_KEY } from "@/lib/benchmark-category-tags";
import {
  NEO_PULSE_AGENT_ADS_MODEL_KEY,
  NEO_PULSE_AGENT_BLOG_MODEL_KEY,
  NEO_PULSE_AGENT_IMAGE_MODEL_KEY,
  NEO_PULSE_AGENT_META_MODEL_KEY,
  NEO_PULSE_AGENT_REPORT_MODEL_KEY,
  NEO_PULSE_AGENT_RESEARCH_MODEL_KEY,
} from "@/lib/global-agent-models";

/** Persisted so cloud restore + reload can hydrate Index LLM state. */
export const NEO_PULSE_LLM_MODEL_KEY = "neo-pulse-llm-selected-model";
export const NEO_PULSE_LLM_TEMPERATURE_KEY = "neo-pulse-llm-temperature";
export const NEO_PULSE_LLM_MAX_TOKENS_KEY = "neo-pulse-llm-max-tokens";
export const NEO_PULSE_LLM_TOP_P_KEY = "neo-pulse-llm-top-p";

const STORED_BLUEPRINTS_KEY = "stored-blueprints";

const EXACT_LOCAL_KEYS = [
  // Wave 0: secret keys are never snapshotted to the server. They live in
  // server env / wp-config constants only.
  WORDPRESS_SITES_STORAGE_KEY,
  WORDPRESS_BENCHMARK_CATEGORY_TAGS_KEY,
  KB_FILES_STORAGE_KEY,
  "kb_profiles",
  MANAGER_SETTINGS_CLUSTER_KEY,
  "global_research_model",
  "primaryColor",
  STORED_BLUEPRINTS_KEY,
  NEO_PULSE_LLM_MODEL_KEY,
  NEO_PULSE_LLM_TEMPERATURE_KEY,
  NEO_PULSE_LLM_MAX_TOKENS_KEY,
  NEO_PULSE_LLM_TOP_P_KEY,
  NEO_PULSE_AGENT_RESEARCH_MODEL_KEY,
  NEO_PULSE_AGENT_BLOG_MODEL_KEY,
  NEO_PULSE_AGENT_IMAGE_MODEL_KEY,
  NEO_PULSE_AGENT_META_MODEL_KEY,
  NEO_PULSE_AGENT_REPORT_MODEL_KEY,
  NEO_PULSE_AGENT_ADS_MODEL_KEY,
] as const;

const PREFIX_KEYS = ["optimization_settings_", "optimization_mode_"] as const;

function readExactAndPrefixedLocalStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const k of EXACT_LOCAL_KEYS) {
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = v;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || Object.prototype.hasOwnProperty.call(out, k)) continue;
      for (const p of PREFIX_KEYS) {
        if (k.startsWith(p)) {
          const v = localStorage.getItem(k);
          if (v !== null) out[k] = v;
          break;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

export type ManagerCloudSnapshotV1 = {
  version: 1;
  collectedAt: string;
  keys: Record<string, string>;
};

export type ManagerCloudLlmSlice = {
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
};

/**
 * Build a JSON snapshot of manager / integration settings (localStorage + current in-memory secrets / LLM).
 */
export function collectManagerCloudSettingsSnapshot(
  keyOverrides: Record<string, string | undefined>,
  llm: ManagerCloudLlmSlice,
): ManagerCloudSnapshotV1 {
  const keys = readExactAndPrefixedLocalStorage();
  for (const [k, v] of Object.entries(keyOverrides)) {
    if (typeof v === "string") keys[k] = v;
  }
  keys[NEO_PULSE_LLM_MODEL_KEY] = llm.selectedModel;
  keys[NEO_PULSE_LLM_TEMPERATURE_KEY] = String(llm.temperature);
  keys[NEO_PULSE_LLM_MAX_TOKENS_KEY] = String(llm.maxTokens);
  keys[NEO_PULSE_LLM_TOP_P_KEY] = String(llm.topP);
  return {
    version: 1,
    collectedAt: new Date().toISOString(),
    keys,
  };
}

/**
 * Write snapshot keys back to localStorage, except credential keys (hydrated
 * into memory via hydrateRuntimeApiKeys, not localStorage). Callers may
 * `location.reload()` so React state matches.
 */
export const WORKSPACE_CREDENTIAL_STORAGE_KEYS = [
  "openrouter-api-key",
  "dataforseo-api-key",
  "semrush-api-key",
  "agentmail-api-key",
  "agentmail-general-email",
] as const;

const CREDENTIAL_SNAPSHOT_KEYS = new Set<string>(WORKSPACE_CREDENTIAL_STORAGE_KEYS);

export function applyManagerCloudSnapshotToLocalStorage(snapshot: unknown): { keyCount: number; error?: string } {
  if (!snapshot || typeof snapshot !== "object") {
    return { keyCount: 0, error: "Invalid snapshot" };
  }
  const rec = snapshot as Record<string, unknown>;
  if (rec.version !== 1 || !rec.keys || typeof rec.keys !== "object") {
    return { keyCount: 0, error: "Unsupported snapshot format" };
  }
  const keys = rec.keys as Record<string, unknown>;
  let n = 0;
  try {
    for (const [k, v] of Object.entries(keys)) {
      if (typeof v !== "string") continue;
      if (CREDENTIAL_SNAPSHOT_KEYS.has(k)) continue;
      if (k === WORDPRESS_SITES_STORAGE_KEY) {
        try {
          const parsed = JSON.parse(v) as unknown;
          if (Array.isArray(parsed) && parsed.length === 0) continue;
        } catch {
          continue;
        }
      }
      localStorage.setItem(k, v);
      n++;
    }
    try {
      window.dispatchEvent(new CustomEvent("kb-files-updated", { detail: { reload: true } }));
    } catch {
      /* ignore */
    }
  } catch (e) {
    return { keyCount: n, error: e instanceof Error ? e.message : String(e) };
  }
  return { keyCount: n };
}

export function readStoredLlmModelForIndex(defaultModel: string): string {
  try {
    const t = localStorage.getItem(NEO_PULSE_LLM_MODEL_KEY)?.trim();
    if (t) return t;
  } catch {
    /* ignore */
  }
  return defaultModel;
}

export function readStoredLlmNumberForIndex(key: string, fallback: number): number {
  try {
    const t = localStorage.getItem(key);
    if (t == null || t === "") return fallback;
    const n = Number(t);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}
