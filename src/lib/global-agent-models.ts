import { DEFAULT_SETTINGS } from "@/lib/optimization-settings-defaults";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODEL_PRESETS } from "@/lib/image-model-defaults";
import { DEFAULT_VIDEO_MODEL, VIDEO_MODEL_PRESETS } from "@/lib/video-generator/video-model-defaults";
import { coerceOpenRouterModelId } from "@/lib/openrouter-model-id";

/** Must match {@link NEO_PULSE_LLM_MODEL_KEY} in manager-cloud-settings-snapshot (legacy blog default). */
const LEGACY_LLM_MODEL_KEY = "neo-pulse-llm-selected-model";

/** Global Research agent (checklist, blueprint, image planning). */
export const NEO_PULSE_AGENT_RESEARCH_MODEL_KEY = "neo-pulse-agent-research-model";
/** Global Blog agent (harness, title, meta). */
export const NEO_PULSE_AGENT_BLOG_MODEL_KEY = "neo-pulse-agent-blog-model";
/** Global Image agent (image generation). */
export const NEO_PULSE_AGENT_IMAGE_MODEL_KEY = "neo-pulse-agent-image-model";
/** Global Meta agent (SAP/Overview meta, FAQ). */
export const NEO_PULSE_AGENT_META_MODEL_KEY = "neo-pulse-agent-meta-model";
/** Global Report agent (GSC reporting). */
export const NEO_PULSE_AGENT_REPORT_MODEL_KEY = "neo-pulse-agent-report-model";
/** Global Ads agent (PPC reporting). */
export const NEO_PULSE_AGENT_ADS_MODEL_KEY = "neo-pulse-agent-ads-model";
/** Global Video agent (OpenRouter video generation). */
export const NEO_PULSE_AGENT_VIDEO_MODEL_KEY = "neo-pulse-agent-video-model-v2";

const GLOBAL_RESEARCH_MODEL_KEY = "global_research_model";

export const TEXT_AGENT_MODEL_PRESETS: { value: string; label: string }[] = [
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5", label: "GPT-5" },
];

export { IMAGE_MODEL_PRESETS, VIDEO_MODEL_PRESETS };

function readStorageKey(key: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const t = localStorage.getItem(key)?.trim();
    return t || undefined;
  } catch {
    return undefined;
  }
}

function persistStorageKey(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readOpenRouterAgentModel(key: string, fallback: string, mirrorKeys: string[] = []): string {
  const raw =
    readStorageKey(key) ??
    mirrorKeys.map((k) => readStorageKey(k)).find((v) => v !== undefined);
  const resolved = coerceOpenRouterModelId(raw, fallback);
  if (raw && raw !== resolved) {
    persistStorageKey(key, resolved);
    for (const mirror of mirrorKeys) {
      persistStorageKey(mirror, resolved);
    }
  }
  return resolved;
}

export function readGlobalResearchAgentModel(): string {
  return readOpenRouterAgentModel(
    NEO_PULSE_AGENT_RESEARCH_MODEL_KEY,
    DEFAULT_SETTINGS.researchModel,
    [GLOBAL_RESEARCH_MODEL_KEY],
  );
}

export function readGlobalBlogAgentModel(): string {
  return readOpenRouterAgentModel(
    NEO_PULSE_AGENT_BLOG_MODEL_KEY,
    DEFAULT_SETTINGS.model,
    [LEGACY_LLM_MODEL_KEY],
  );
}

export function readGlobalImageAgentModel(): string {
  const raw = readStorageKey(NEO_PULSE_AGENT_IMAGE_MODEL_KEY);
  const resolved = coerceOpenRouterModelId(raw, DEFAULT_IMAGE_MODEL);
  if (raw && raw !== resolved) {
    persistStorageKey(NEO_PULSE_AGENT_IMAGE_MODEL_KEY, resolved);
  }
  return resolved;
}

export function readGlobalVideoAgentModel(): string {
  const raw = readStorageKey(NEO_PULSE_AGENT_VIDEO_MODEL_KEY);
  const resolved = coerceOpenRouterModelId(raw, DEFAULT_VIDEO_MODEL);
  if (raw && raw !== resolved) {
    persistStorageKey(NEO_PULSE_AGENT_VIDEO_MODEL_KEY, resolved);
  }
  return resolved;
}

const SITE_SETTINGS_STORAGE_KEY_PREFIX = "optimization_settings_";

function syncStoredSiteSettingsField(field: string, modelId: string): void {
  if (typeof window === "undefined") return;
  try {
    const len = typeof localStorage.length === "number" ? localStorage.length : 0;
    const keys: string[] = [];
    for (let i = 0; i < len; i += 1) {
      const k = localStorage.key?.(i);
      if (k && k.startsWith(SITE_SETTINGS_STORAGE_KEY_PREFIX)) {
        keys.push(k);
      }
    }
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        parsed[field] = modelId;
        localStorage.setItem(k, JSON.stringify(parsed));
      }
    }
  } catch {
    /* ignore */
  }
}

export function writeGlobalVideoAgentModel(model: string): void {
  if (typeof window === "undefined") return;
  const id = model.trim();
  if (!id) return;
  persistStorageKey(NEO_PULSE_AGENT_VIDEO_MODEL_KEY, id);
  syncStoredSiteSettingsField("videoModel", id);
}

export function writeGlobalResearchAgentModel(model: string): void {
  if (typeof window === "undefined") return;
  const id = model.trim();
  if (!id) return;
  try {
    localStorage.setItem(NEO_PULSE_AGENT_RESEARCH_MODEL_KEY, id);
    localStorage.setItem(GLOBAL_RESEARCH_MODEL_KEY, id);
  } catch {
    /* ignore */
  }
  syncStoredSiteSettingsField("researchModel", id);
}

export function writeGlobalBlogAgentModel(model: string): void {
  if (typeof window === "undefined") return;
  const id = model.trim();
  if (!id) return;
  try {
    localStorage.setItem(NEO_PULSE_AGENT_BLOG_MODEL_KEY, id);
    localStorage.setItem(LEGACY_LLM_MODEL_KEY, id);
  } catch {
    /* ignore */
  }
  syncStoredSiteSettingsField("model", id);
}

export function writeGlobalImageAgentModel(model: string): void {
  if (typeof window === "undefined") return;
  const id = model.trim();
  if (!id) return;
  try {
    localStorage.setItem(NEO_PULSE_AGENT_IMAGE_MODEL_KEY, id);
  } catch {
    /* ignore */
  }
  syncStoredSiteSettingsField("imageModel", id);
}

export function readGlobalMetaAgentModel(): string {
  return readOpenRouterAgentModel(NEO_PULSE_AGENT_META_MODEL_KEY, DEFAULT_SETTINGS.metaModel);
}

export function readGlobalReportAgentModel(): string {
  return readOpenRouterAgentModel(NEO_PULSE_AGENT_REPORT_MODEL_KEY, DEFAULT_SETTINGS.reportModel);
}

export function readGlobalAdsAgentModel(): string {
  return readOpenRouterAgentModel(NEO_PULSE_AGENT_ADS_MODEL_KEY, DEFAULT_SETTINGS.adsModel);
}

export function writeGlobalMetaAgentModel(model: string): void {
  if (typeof window === "undefined") return;
  const id = model.trim();
  if (!id) return;
  try {
    localStorage.setItem(NEO_PULSE_AGENT_META_MODEL_KEY, id);
  } catch {
    /* ignore */
  }
  syncStoredSiteSettingsField("metaModel", id);
}

export function writeGlobalReportAgentModel(model: string): void {
  if (typeof window === "undefined") return;
  const id = model.trim();
  if (!id) return;
  try {
    localStorage.setItem(NEO_PULSE_AGENT_REPORT_MODEL_KEY, id);
  } catch {
    /* ignore */
  }
  syncStoredSiteSettingsField("reportModel", id);
}

export function writeGlobalAdsAgentModel(model: string): void {
  if (typeof window === "undefined") return;
  const id = model.trim();
  if (!id) return;
  try {
    localStorage.setItem(NEO_PULSE_AGENT_ADS_MODEL_KEY, id);
  } catch {
    /* ignore */
  }
  syncStoredSiteSettingsField("adsModel", id);
}
