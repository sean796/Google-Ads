/**
 * AI-Driven ACF Reader
 *
 * Interprets WordPress ACF (Advanced Custom Fields) objects by semantic role using AI only.
 * No static field names or pattern matching - all read semantics go through this module.
 */

import { logger } from "@/lib/logger";
import { streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";

/** Semantic context from AI-driven interpretation of ACF fields. Use this type everywhere; do not rely on raw ACF key names for read semantics. */
export interface AIDrivenACFContext {
  promptModifier?: string;
  keywordFocus?: string;
  metaDescription?: string;
  extraText?: string;
  extraImage?: string;
  origin?: string;
  dateModifier?: string;
  faq?: string;
  serviceArea?: string;
  /** Cached SEO research brief from ACF `seo_research` (markdown). */
  seoResearch?: string;
  /** Any other content-relevant fields the AI identified (key = semantic label, value = string). */
  contentRelevantFields?: Record<string, string>;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<
  string,
  { context: AIDrivenACFContext; timestamp: number }
>();

function acfNormKey(k: string): string {
  return k.toLowerCase();
}

function acfNormalizeLoose(k: string): string {
  return acfNormKey(k).replace(/[^a-z0-9]/g, "");
}

function acfGetStringValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v).trim();
  if (Array.isArray(v)) {
    const first = v.find((x) => x != null && String(x).trim() !== "");
    return first != null ? String(first).trim() : "";
  }
  return String(v).trim();
}

/**
 * Deterministic ACF keyword_focus extraction (any key style: keyword_focus, keywordFocus, *_keyword_focus).
 */
export function readKeywordFocusFromAcfFields(acf: Record<string, unknown> | undefined): string {
  if (!acf || typeof acf !== "object") return "";
  const entries = Object.entries(acf);
  if (!entries.length) return "";

  const keywordFocusKeys = entries
    .map(([k]) => k)
    .filter((k) => {
      const lk = acfNormKey(k);
      const loose = acfNormalizeLoose(k);
      const isUrlVariant = lk.includes("keyword_focus_url") || loose.includes("keywordfocusurl");
      if (isUrlVariant) return false;
      return (
        lk === "keyword_focus" ||
        lk.endsWith("keyword_focus") ||
        loose === "keywordfocus" ||
        loose.endsWith("keywordfocus")
      );
    });

  for (const k of keywordFocusKeys) {
    const val = acfGetStringValue(acf[k]);
    if (val) return val;
  }

  return "";
}

/** Read cached SEO research JSON from ACF (`seo_research`). */
export function getSeoResearchFromAcf(acf: Record<string, unknown> | undefined): string {
  if (!acf || typeof acf !== "object") return "";
  for (const [k, v] of Object.entries(acf)) {
    const lk = acfNormKey(k);
    const loose = acfNormalizeLoose(k);
    if (lk === "seo_research" || loose === "seoresearch") {
      const val = acfGetStringValue(v);
      if (val) return val;
    }
  }
  return "";
}

/** Merge deterministic `seo_research` from raw ACF into context (e.g. Content Optimizer `keyword_focus`-only read). */
export function mergeSeoResearchFromAcfIntoContext(
  acfFields: Record<string, unknown>,
  acfContext?: AIDrivenACFContext,
): AIDrivenACFContext | undefined {
  const sr = getSeoResearchFromAcf(acfFields);
  if (!sr) return acfContext;
  return { ...(acfContext ?? {}), seoResearch: sr };
}

function cacheKey(acf: Record<string, unknown>, siteUrl?: string, postType?: string): string {
  const keysHash = Object.keys(acf).sort().join(",");
  return [siteUrl ?? "", postType ?? "", keysHash].filter(Boolean).join("|") || keysHash || "empty";
}

/** Whether the context indicates a field for extra text (for pages). Does not depend on static ACF key names. */
export function hasExtraTextField(ctx: AIDrivenACFContext): boolean {
  return ctx.extraText !== undefined && ctx.extraText !== null;
}

/** Whether the context indicates a field for extra image (for pages). Does not depend on static ACF key names. */
export function hasExtraImageField(ctx: AIDrivenACFContext): boolean {
  return ctx.extraImage !== undefined && ctx.extraImage !== null && String(ctx.extraImage).trim() !== "";
}

/**
 * Read ACF fields agentically: given a raw WordPress acf object, use AI to map each field to a semantic role and return values.
 * Use this for prompt generation, optimization, and upload logic - never static key names for read semantics.
 */
export async function readACFFieldsAgentically(
  acf: Record<string, unknown>,
  options?: { apiKey?: string; siteUrl?: string; postType?: string; model?: string }
): Promise<AIDrivenACFContext> {
  if (!acf || typeof acf !== "object") {
    return {};
  }

  const keys = Object.keys(acf);
  if (keys.length === 0) {
    return {};
  }

  const apiKey = options?.apiKey?.trim();
  if (!apiKey) {
    logger.warn("[AI-Driven ACF Reader] API key required for agentic read. Returning empty context.");
    return {};
  }

  const deterministicKeywordFocus = readKeywordFocusFromAcfFields(acf);

  const deterministicSeoResearch = getSeoResearchFromAcf(acf as Record<string, unknown>);

  const key = cacheKey(acf, options?.siteUrl, options?.postType);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.context;
  }

  const systemPrompt = `You are an expert at interpreting WordPress ACF (Advanced Custom Fields) objects for local SEO and content.

Given a JSON object of ACF field key-value pairs, map each field to exactly one semantic role and return the VALUE (as string) for that role. Use the actual values from the input; do not invent keys.

Semantic roles (return these keys in your JSON with string values; use empty string "" if no field maps to that role):
- promptModifier: instruction text for content optimization / what the page is about
- keywordFocus: primary keyword or focus keyword
- metaDescription: meta description text
- extraText: additional text content (e.g. for pages)
- extraImage: image ID or URL (e.g. for pages)
- origin: location/entity (e.g. city, region)
- dateModifier: date value (e.g. YYYY-MM-DD)
- faq: FAQ schema or JSON-LD
- serviceArea: service area or location-specific data
- seoResearch: cached merged SEO content brief (JSON text: SERP + GSC + Semrush), typically ACF seo_research

If a field clearly fits one role, use its value (stringify numbers/objects if needed). If multiple ACF fields could map to one role, pick the most relevant value. If no field fits a role, use "".

Also return an optional "contentRelevantFields" object: any other ACF keys that are clearly content-related (e.g. headings, modifiers) as key: string value. Omit if none.

Return ONLY a valid JSON object with these keys: promptModifier, keywordFocus, metaDescription, extraText, extraImage, origin, dateModifier, faq, serviceArea, seoResearch, and optionally contentRelevantFields. No markdown, no explanation.`;

  const userPrompt = `ACF object (post type: ${options?.postType ?? "unknown"}):
${JSON.stringify(acf, null, 2)}

Map each field to the semantic roles and return the JSON object with string values only.`;

  try {
    let responseContent = "";
    await streamChatCompletion({
      apiKey,
      model: options?.model ?? getResearchModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 2000,
      topP: 0.9,
      onContentChunk: (chunk) => {
        responseContent += chunk;
      },
    });

    let jsonStr = responseContent.trim();
    jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const context: AIDrivenACFContext = {
      promptModifier: typeof parsed.promptModifier === "string" ? parsed.promptModifier.trim() : "",
      keywordFocus: typeof parsed.keywordFocus === "string" ? parsed.keywordFocus.trim() : "",
      metaDescription: typeof parsed.metaDescription === "string" ? parsed.metaDescription.trim() : "",
      extraText: parsed.extraText != null ? String(parsed.extraText).trim() : undefined,
      extraImage: parsed.extraImage != null ? String(parsed.extraImage).trim() : undefined,
      origin: typeof parsed.origin === "string" ? parsed.origin.trim() : "",
      dateModifier: typeof parsed.dateModifier === "string" ? parsed.dateModifier.trim() : "",
      faq: typeof parsed.faq === "string" ? parsed.faq.trim() : "",
      serviceArea: typeof parsed.serviceArea === "string" ? parsed.serviceArea.trim() : "",
      seoResearch: typeof parsed.seoResearch === "string" ? parsed.seoResearch.trim() : "",
    };

    // Override AI-derived keywordFocus with deterministic extraction when present.
    if (deterministicKeywordFocus) {
      context.keywordFocus = deterministicKeywordFocus;
    }
    if (deterministicSeoResearch) {
      context.seoResearch = deterministicSeoResearch;
    } else if (!context.seoResearch) {
      delete context.seoResearch;
    }
    if (parsed.contentRelevantFields && typeof parsed.contentRelevantFields === "object") {
      const cr: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.contentRelevantFields)) {
        if (typeof v === "string" && v.trim()) cr[k] = v.trim();
      }
      if (Object.keys(cr).length > 0) context.contentRelevantFields = cr;
    }

    // Normalize empty strings to undefined for optional fields (keep extraText/extraImage so hasExtraTextField/hasExtraImageField can detect field presence)
    if (context.promptModifier === "") delete context.promptModifier;
    if (context.keywordFocus === "") delete context.keywordFocus;
    if (context.metaDescription === "") delete context.metaDescription;
    if (context.origin === "") delete context.origin;
    if (context.dateModifier === "") delete context.dateModifier;
    if (context.faq === "") delete context.faq;
    if (context.serviceArea === "") delete context.serviceArea;
    if (context.seoResearch === "") delete context.seoResearch;

    cache.set(key, { context, timestamp: Date.now() });
    return context;
  } catch (error) {
    logger.warn("[AI-Driven ACF Reader] AI read failed, returning empty context:", error);
    return {};
  }
}

/** Clear reader cache (e.g. when field structure changes). */
export function clearAIDrivenACFReaderCache(siteUrl?: string): void {
  if (siteUrl) {
    for (const k of cache.keys()) {
      if (k.startsWith(`${siteUrl}|`)) cache.delete(k);
    }
  } else {
    cache.clear();
  }
}
