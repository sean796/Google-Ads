import { DEFAULT_IMAGE_MODEL } from "@/lib/image-model-defaults";
import { DEFAULT_VIDEO_MODEL } from "@/lib/video-generator/video-model-defaults";

export interface OptimizationSettings {
  /** Blog agent: harness sections, title, meta description */
  model: string;
  /** Research agent: checklist, blueprint, briefs, image planning */
  researchModel: string;
  /** Meta agent: SAP/blog meta descriptions and FAQ copy */
  metaModel: string;
  /** Report agent: GSC reporting and analytics LLM */
  reportModel: string;
  /** Ads agent: Google Ads and Meta PPC copy */
  adsModel: string;
  /** Image agent: OpenRouter image generation */
  imageModel: string;
  /** Video agent: OpenRouter video generation (HeyGen Video) */
  videoModel: string;
  /** Decision agent: Liquid d1.1 checker, quality gate batches, score rubrics, and fix routing */
  decisionModel: string;
  customModels: string[];
  temperature: number;
  maxTokens: number;
  topP: number;
}

export const DEFAULT_SETTINGS: OptimizationSettings = {
  model: "google/gemini-2.5-flash",
  researchModel: "deepseek/deepseek-v4.1-flash",
  metaModel: "google/gemini-2.5-flash",
  reportModel: "deepseek/deepseek-v4.1-flash",
  adsModel: "deepseek/deepseek-v4.1-flash",
  imageModel: DEFAULT_IMAGE_MODEL,
  videoModel: DEFAULT_VIDEO_MODEL,
  decisionModel: "liquid/d1.1",
  customModels: [],
  temperature: 1.0,
  maxTokens: 4000,
  topP: 0.9,
};
