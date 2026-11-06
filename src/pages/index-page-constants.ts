import { DEFAULT_SETTINGS } from "@/lib/optimization-settings-defaults";
import type { GenerationResult } from "../lib/api";

export const OPENROUTER_API_KEY_STORAGE_KEY = "openrouter-api-key";

export const DEFAULT_BLOG_MODEL = DEFAULT_SETTINGS.model;
export const DEFAULT_TEMPERATURE = 1.57;
// Keep this comfortably under typical OpenRouter/model context limits
export const DEFAULT_MAX_TOKENS = 5000000;
export const DEFAULT_TOP_P = 0.90;

export const INITIAL_GENERATION_RESULT: GenerationResult = {
  plan: "",
  draft: "",
  final: "",
  currentStage: "idle",
  isGenerating: false,
  planApproved: undefined,
};
