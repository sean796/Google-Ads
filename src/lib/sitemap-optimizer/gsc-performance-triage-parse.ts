import { extractFirstBalancedJsonValue } from "@/lib/competitor-research/competitor-report-json-parse";
import { z } from "zod";

export type GscPerformanceDisposition = "keep" | "consolidate";

export type ParsedGscTriageDecision = {
  postId: string;
  disposition: GscPerformanceDisposition;
  rationale: string;
  confidence: "high" | "medium" | "low";
};

const confidenceSchema = z.enum(["high", "medium", "low"]);

function unwrapTriageRoot(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  for (const key of ["decisions", "results", "rows", "urls", "items"]) {
    if (Array.isArray(o[key])) return o;
  }
  for (const key of ["triage", "result", "data", "output"]) {
    const nested = o[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }
  return o;
}

function decisionsArrayFromRoot(raw: Record<string, unknown>): unknown[] {
  for (const key of ["decisions", "results", "rows", "urls", "items", "triage"]) {
    const v = raw[key];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function normalizeDecision(raw: unknown, fallbackPostId?: string): ParsedGscTriageDecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const postId = String(o.postId ?? o.id ?? fallbackPostId ?? "").trim();
  if (!postId) return null;

  const dispositionRaw = String(o.disposition ?? o.action ?? o.verdict ?? "").trim().toLowerCase();
  let disposition: GscPerformanceDisposition = "consolidate";
  if (dispositionRaw === "keep" || dispositionRaw === "preserve" || dispositionRaw === "skip") {
    disposition = "keep";
  }

  const confidenceRaw = String(o.confidence ?? "medium").trim().toLowerCase();
  const confidence = confidenceSchema.safeParse(confidenceRaw).success
    ? (confidenceRaw as ParsedGscTriageDecision["confidence"])
    : "medium";

  const rationale = String(o.rationale ?? o.reason ?? "").trim();

  return { postId, disposition, rationale, confidence };
}

export function parseGscPerformanceTriageJson(
  text: string,
  allowedPostIds: readonly string[],
): ParsedGscTriageDecision[] {
  const jsonText = extractFirstBalancedJsonValue(text);
  if (!jsonText) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const root = unwrapTriageRoot(parsed);
  const items = decisionsArrayFromRoot(root);
  const allowed = new Set(allowedPostIds);
  const out: ParsedGscTriageDecision[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const decision = normalizeDecision(item);
    if (!decision || !allowed.has(decision.postId) || seen.has(decision.postId)) continue;
    seen.add(decision.postId);
    out.push(decision);
  }

  return out;
}
