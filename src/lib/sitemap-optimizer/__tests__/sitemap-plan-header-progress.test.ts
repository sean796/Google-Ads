import { describe, expect, it } from "vitest";
import {
  buildSitemapPlanMicroSnapshot,
  sitemapPlanHeaderProgressFromState,
  SITEMAP_ANALYZE_LABEL,
  SITEMAP_APPROVE_LABEL,
  SITEMAP_RANK_MATH_LABEL,
} from "../sitemap-plan-header-progress";
import type { SitemapOptimizerProgress } from "../types";

const analyzeProgress = (overrides: Partial<SitemapOptimizerProgress>): SitemapOptimizerProgress => ({
  phase: "clustering",
  completed: 2,
  total: 6,
  detail: "Clustering URLs…",
  ...overrides,
});

describe("sitemapPlanHeaderProgressFromState", () => {
  it("returns null when idle", () => {
    expect(
      sitemapPlanHeaderProgressFromState({
        rankMathImportRunning: false,
        rankMathProgress: null,
        analyzeRunning: false,
        analyzeProgress: null,
        approving: false,
        approveProgress: null,
      }),
    ).toBeNull();
  });

  it("prefers NEO Pulse redirect import over analyze", () => {
    const p = sitemapPlanHeaderProgressFromState({
      rankMathImportRunning: true,
      rankMathProgress: analyzeProgress({ detail: "Importing plan…" }),
      analyzeRunning: true,
      analyzeProgress: analyzeProgress({ detail: "Analyze" }),
      approving: false,
      approveProgress: null,
    });
    expect(p?.label).toBe(SITEMAP_RANK_MATH_LABEL);
  });

  it("maps analyze progress", () => {
    const p = sitemapPlanHeaderProgressFromState({
      rankMathImportRunning: false,
      rankMathProgress: null,
      analyzeRunning: true,
      analyzeProgress: analyzeProgress({}),
      approving: false,
      approveProgress: null,
    });
    expect(p?.label).toBe(SITEMAP_ANALYZE_LABEL);
  });
});

describe("buildSitemapPlanMicroSnapshot", () => {
  it("maps approve label and detail", () => {
    const snap = buildSitemapPlanMicroSnapshot({
      label: SITEMAP_APPROVE_LABEL,
      phase: "Trash: Hello world",
      completed: 1,
      total: 3,
      progressPct: 40,
    });
    expect(snap?.label).toBe(SITEMAP_APPROVE_LABEL);
    expect(snap?.statusMessage).toBe("Trash: Hello world");
  });
});
