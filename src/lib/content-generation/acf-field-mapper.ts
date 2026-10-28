/**
 * NEO Pulse native field mapping (substitutes legacy ACF discovery).
 */
export interface ACFFieldMapping {
  dateModifier?: string;
  faq?: string;
  metaDescription?: string;
  promptModifier?: string;
  extraText?: string;
  extraImage?: string;
  origin?: string;
  keywordFocus?: string;
  seoResearch?: string;
  seoTitle?: string;
}

export const NEO_PULSE_DEFAULT_FIELD_MAPPING: Required<ACFFieldMapping> = {
  dateModifier: "date_modifier",
  faq: "faq",
  metaDescription: "meta_description",
  promptModifier: "prompt_modifier",
  extraText: "seo_extra_text",
  extraImage: "seo_extra_image",
  origin: "origin",
  keywordFocus: "keyword_focus",
  seoResearch: "seo_research",
  seoTitle: "seo_title",
};

export function getPromptModifierValueFromACFFields(acfFields: Record<string, any>): string {
  if (!acfFields || typeof acfFields !== "object") return "";
  const mapping = fallbackFieldMapping(acfFields);
  const key = mapping.promptModifier;
  if (!key || !(key in acfFields)) return "";
  const v = acfFields[key];
  return typeof v === "string" ? v.trim() : "";
}

export function getMetaDescriptionValueFromACFFields(acfFields: Record<string, any>): string {
  if (!acfFields || typeof acfFields !== "object") return "";
  const mapping = fallbackFieldMapping(acfFields);
  const key = mapping.metaDescription;
  if (!key || !(key in acfFields)) return "";
  const v = acfFields[key];
  return typeof v === "string" ? v.trim() : "";
}

export function fallbackFieldMapping(acfFields: Record<string, any>): ACFFieldMapping {
  const fieldNames = Object.keys(acfFields ?? {});
  if (fieldNames.length === 0) {
    return { ...NEO_PULSE_DEFAULT_FIELD_MAPPING };
  }
  const mapping: ACFFieldMapping = {};

  for (const fieldName of fieldNames) {
    const lowerFieldName = fieldName.toLowerCase();

    if (!mapping.dateModifier) {
      if (
        lowerFieldName.includes("date_modifier") ||
        lowerFieldName.includes("date_mod") ||
        lowerFieldName === "seo_date_modifier"
      ) {
        mapping.dateModifier = fieldName;
      }
    }

    if (!mapping.faq) {
      if (lowerFieldName.includes("faq") || lowerFieldName === "seo_faq") {
        mapping.faq = fieldName;
      }
    }

    if (!mapping.metaDescription) {
      if (
        lowerFieldName.includes("meta_description") ||
        lowerFieldName.includes("meta_desc") ||
        lowerFieldName === "seo_meta_description"
      ) {
        mapping.metaDescription = fieldName;
      }
    }

    if (!mapping.promptModifier) {
      if (
        lowerFieldName.includes("prompt_modifier") ||
        lowerFieldName.includes("prompt_mod") ||
        lowerFieldName === "seo_prompt_modifier"
      ) {
        mapping.promptModifier = fieldName;
      }
    }

    if (!mapping.extraText) {
      if (lowerFieldName.includes("extra_text") || lowerFieldName === "seo_extra_text") {
        mapping.extraText = fieldName;
      }
    }

    if (!mapping.extraImage) {
      if (lowerFieldName.includes("extra_image") || lowerFieldName === "seo_extra_image") {
        mapping.extraImage = fieldName;
      }
    }

    if (!mapping.origin && lowerFieldName === "origin") {
      mapping.origin = fieldName;
    }

    if (!mapping.keywordFocus) {
      if (
        lowerFieldName.includes("keyword_focus") ||
        lowerFieldName.includes("keyword_focu") ||
        lowerFieldName.includes("focus_keyword")
      ) {
        mapping.keywordFocus = fieldName;
      }
    }

    if (!mapping.seoResearch && lowerFieldName.includes("seo_research")) {
      mapping.seoResearch = fieldName;
    }

    if (!mapping.seoTitle) {
      if (
        lowerFieldName.includes("seo_title") ||
        lowerFieldName === "post_title" ||
        (lowerFieldName.includes("title") && lowerFieldName.includes("seo"))
      ) {
        mapping.seoTitle = fieldName;
      }
    }
  }

  return mapping;
}

export async function discoverACFFieldMapping(
  acfFields: Record<string, any>,
  _postType: string,
  _apiKey: string,
  _siteUrl?: string,
  _model?: string,
): Promise<ACFFieldMapping> {
  return {
    ...NEO_PULSE_DEFAULT_FIELD_MAPPING,
    ...fallbackFieldMapping(acfFields),
  };
}

export function clearACFFieldMappingCache(_siteUrl?: string): void {
  // No-op: NEO Pulse field mapping is deterministic.
}
