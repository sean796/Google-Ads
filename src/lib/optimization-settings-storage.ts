import { logger } from "@/lib/logger";
import type { OptimizationSettings } from "@/lib/optimization-settings-defaults";
import { DEFAULT_SETTINGS } from "@/lib/optimization-settings-defaults";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-model-defaults";
import { DEFAULT_VIDEO_MODEL } from "@/lib/video-generator/video-model-defaults";
import {
  readGlobalAdsAgentModel,
  readGlobalBlogAgentModel,
  readGlobalDecisionAgentModel,
  readGlobalImageAgentModel,
  readGlobalMetaAgentModel,
  readGlobalReportAgentModel,
  readGlobalResearchAgentModel,
  readGlobalVideoAgentModel,
} from "@/lib/global-agent-models";
import { coerceOpenRouterModelId } from "@/lib/openrouter-model-id";

const SETTINGS_STORAGE_KEY_PREFIX = "optimization_settings_";
const MODE_STORAGE_KEY_PREFIX = "optimization_mode_";

function globalDefaultSettings(): OptimizationSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    model: readGlobalBlogAgentModel(),
    researchModel: readGlobalResearchAgentModel(),
    metaModel: readGlobalMetaAgentModel(),
    reportModel: readGlobalReportAgentModel(),
    adsModel: readGlobalAdsAgentModel(),
    imageModel: readGlobalImageAgentModel(),
    videoModel: readGlobalVideoAgentModel(),
    decisionModel: readGlobalDecisionAgentModel(),
  };
}

export function getOptimizationSettings(siteId: string): OptimizationSettings {
  const defaults = globalDefaultSettings();
  if (typeof window === "undefined") return defaults;
  try {
    const stored = localStorage.getItem(`${SETTINGS_STORAGE_KEY_PREFIX}${siteId}`);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<OptimizationSettings>;
      const merged = sanitizeOptimizationSettings({ ...defaults, ...parsed }, defaults);
      const hadLegacyModel = SITE_MODEL_FIELDS.some((field) => {
        const raw = typeof parsed[field] === "string" ? parsed[field]!.trim() : "";
        return raw.length > 0 && raw !== merged[field];
      });
      if (hadLegacyModel) {
        localStorage.setItem(`${SETTINGS_STORAGE_KEY_PREFIX}${siteId}`, JSON.stringify(merged));
      }
      return merged;
    }
  } catch (e) {
    logger.error("[OptimizationSettings] Failed to parse stored settings:", e);
  }
  return defaults;
}

export function saveOptimizationSettings(siteId: string, settings: OptimizationSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${SETTINGS_STORAGE_KEY_PREFIX}${siteId}`, JSON.stringify(settings));
  } catch (e) {
    logger.error("[OptimizationSettings] Failed to save settings:", e);
  }
}

export function getOptimizationMode(siteId: string): "quick" | "standard" | "full" {
  if (typeof window === "undefined") return "standard";
  try {
    const stored = localStorage.getItem(`${MODE_STORAGE_KEY_PREFIX}${siteId}`);
    if (stored === "quick" || stored === "standard" || stored === "full") {
      return stored;
    }
  } catch (e) {
    logger.error("[OptimizationMode] Failed to parse stored mode:", e);
  }
  return "standard";
}

export function saveOptimizationMode(siteId: string, mode: "quick" | "standard" | "full"): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${MODE_STORAGE_KEY_PREFIX}${siteId}`, mode);
  } catch (e) {
    logger.error("[OptimizationMode] Failed to save mode:", e);
  }
}

const GLOBAL_RESEARCH_MODEL_KEY = "global_research_model";
const DEFAULT_RESEARCH_MODEL = DEFAULT_SETTINGS.researchModel;

const SITE_MODEL_FIELDS = [
  "model",
  "researchModel",
  "metaModel",
  "reportModel",
  "adsModel",
  "imageModel",
  "videoModel",
  "decisionModel",
] as const;

type SiteModelField = (typeof SITE_MODEL_FIELDS)[number];

function sanitizeOptimizationSettings(
  settings: OptimizationSettings,
  defaults: OptimizationSettings = DEFAULT_SETTINGS,
): OptimizationSettings {
  return {
    ...settings,
    model: coerceOpenRouterModelId(settings.model, defaults.model),
    researchModel: coerceOpenRouterModelId(settings.researchModel, defaults.researchModel),
    metaModel: coerceOpenRouterModelId(settings.metaModel, defaults.metaModel),
    reportModel: coerceOpenRouterModelId(settings.reportModel, defaults.reportModel),
    adsModel: coerceOpenRouterModelId(settings.adsModel, defaults.adsModel),
    imageModel: coerceOpenRouterModelId(settings.imageModel, defaults.imageModel),
    videoModel: coerceOpenRouterModelId(settings.videoModel, defaults.videoModel),
    decisionModel: coerceOpenRouterModelId(settings.decisionModel, defaults.decisionModel),
  };
}

function readStoredSiteModelOverride(
  siteId: string | null | undefined,
  field: SiteModelField,
): string | undefined {
  if (!siteId || typeof window === "undefined") return undefined;
  try {
    const stored = localStorage.getItem(`${SETTINGS_STORAGE_KEY_PREFIX}${siteId}`);
    if (!stored) return undefined;
    const parsed = JSON.parse(stored) as Partial<Record<SiteModelField, unknown>>;
    const raw = typeof parsed[field] === "string" ? parsed[field]!.trim() : "";
    if (!raw) return undefined;
    const coerced = coerceOpenRouterModelId(raw, "");
    return coerced || undefined;
  } catch {
    return undefined;
  }
}

function modelFromSiteSettings(
  siteId: string | null | undefined,
  field: SiteModelField,
  readGlobal: () => string,
  hardcodedDefault: string,
): string {
  const siteOverride = readStoredSiteModelOverride(siteId, field);
  if (siteOverride) return siteOverride;
  if (typeof window !== "undefined") {
    return readGlobal();
  }
  return hardcodedDefault;
}

export function getResearchModel(siteId?: string): string {
  const siteResearch = readStoredSiteModelOverride(siteId, "researchModel");
  if (siteResearch) return siteResearch;
  if (typeof window !== "undefined") {
    return readGlobalResearchAgentModel();
  }
  return DEFAULT_RESEARCH_MODEL;
}

export function getBlogModel(siteId?: string | null): string {
  return getProductionModel(siteId);
}

export function getProductionModel(siteId?: string | null): string {
  return modelFromSiteSettings(siteId, "model", readGlobalBlogAgentModel, DEFAULT_SETTINGS.model);
}

export function getImageModel(siteId?: string | null): string {
  return modelFromSiteSettings(siteId, "imageModel", readGlobalImageAgentModel, DEFAULT_IMAGE_MODEL);
}

export function getVideoModel(siteId?: string | null): string {
  return modelFromSiteSettings(siteId, "videoModel", readGlobalVideoAgentModel, DEFAULT_VIDEO_MODEL);
}

export function getMetaModel(siteId?: string | null): string {
  return modelFromSiteSettings(siteId, "metaModel", readGlobalMetaAgentModel, DEFAULT_SETTINGS.metaModel);
}

export function getReportModel(siteId?: string | null): string {
  return modelFromSiteSettings(siteId, "reportModel", readGlobalReportAgentModel, DEFAULT_SETTINGS.reportModel);
}

export function getAdsModel(siteId?: string | null): string {
  return modelFromSiteSettings(siteId, "adsModel", readGlobalAdsAgentModel, DEFAULT_SETTINGS.adsModel);
}

export function getDecisionModel(siteId?: string | null): string {
  return modelFromSiteSettings(siteId, "decisionModel", readGlobalDecisionAgentModel, DEFAULT_SETTINGS.decisionModel);
}

export function setGlobalResearchModel(model: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GLOBAL_RESEARCH_MODEL_KEY, model);
  } catch (e) {
    logger.error("[ResearchModel] Failed to save global model:", e);
  }
}

export type { OptimizationSettings } from "@/lib/optimization-settings-defaults";
export { DEFAULT_SETTINGS } from "@/lib/optimization-settings-defaults";
