import type { OpenRouterAppResponseFormat } from "@/lib/openrouter-app-api";
import { GSC_OUTLINE_OUTPUT_LIMITS } from "@/lib/gsc-reporting/gsc-reporting-outline-schema";

const L = GSC_OUTLINE_OUTPUT_LIMITS;

export const ORGANIC_REPORTING_HIGHLIGHTS_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: true,
  required: ["executiveSummary"],
  properties: {
    executiveSummary: { type: "string" },
    performanceNarrative: {
      type: "array",
      minItems: 0,
      maxItems: 6,
      items: { type: "string" },
    },
    keywordNarrative: {
      type: "array",
      minItems: 0,
      maxItems: 4,
      items: { type: "string" },
    },
    googleAdsNarrative: {
      type: "array",
      minItems: 0,
      maxItems: 4,
      items: { type: "string" },
    },
    localGridNarrative: {
      type: "array",
      minItems: 0,
      maxItems: 4,
      items: { type: "string" },
    },
    keyTakeaways: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: { type: "string" },
    },
    topOpportunities: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          rank: { type: "integer" },
          label: { type: "string" },
          why: { type: "string" },
          comparisonRows: {
            type: "array",
            minItems: 0,
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: true,
              properties: {
                metric: { type: "string" },
                comparePeriodValue: { type: "string" },
                primaryPeriodValue: { type: "string" },
              },
            },
          },
          evidence: {
            type: "array",
            maxItems: L.evidenceMaxItems,
            items: { type: "string" },
          },
        },
      },
    },
  },
};

export const ORGANIC_REPORTING_HIGHLIGHTS_RESPONSE_FORMAT: OpenRouterAppResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "organic_reporting_highlights",
    strict: false,
    schema: ORGANIC_REPORTING_HIGHLIGHTS_JSON_SCHEMA,
  },
};
