import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  planToTaskDef,
  recipeToPlan,
  taskDefToPlan,
  validateAutomationPlan,
} from "@/lib/automation-planner-compile";

const recipesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../wordpress-plugins/neo-pulse-app/recipes",
);

function loadRecipes() {
  return readdirSync(recipesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const raw = readFileSync(join(recipesDir, f), "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    });
}

describe("automation-planner-compile", () => {
  it("compiles GSC trigger recipe from posts-ctr-rescue shape", () => {
    const plan = taskDefToPlan(
      {
        keyword: "posts-ctr",
        title: "Full AISEO on posts when CTR drops",
        scheduleMode: "trigger",
        executionKind: "content_optimizer",
        executionPayload: { targetBucket: "posts", updateMode: "update" },
        triggerConfig: {
          sources: ["gsc"],
          match: "any",
          conditions: [{ signal: "ctr_drop", operator: "gte", value: 15, minImpressions: 100 }],
          lookbackDays: 28,
          compareDays: 28,
          pollHours: 24,
          cooldownHours: 72,
          maxUrls: 5,
        },
      },
      { keyword: "posts-ctr-rescue", name: "Posts CTR Rescue", description: "", category: "reactive", prerequisites: [] },
    );
    expect(plan.trigger.kind).toBe("gsc");
    const task = planToTaskDef(plan);
    expect(task.scheduleMode).toBe("trigger");
    expect(task.executionKind).toBe("content_optimizer");
  });

  it("compiles calendar schedule block", () => {
    const plan = taskDefToPlan({
      keyword: "monthly-post-creator-run",
      title: "Create scheduled blog posts",
      scheduleMode: "calendar",
      recurrenceRule: "monthly",
      dueDate: "2026-09-01",
      dueTime: "09:00",
      executionKind: "post_creator",
      executionPayload: { postCount: 1 },
    });
    expect(plan.trigger.kind).toBe("calendar");
    if (plan.trigger.kind === "calendar") {
      expect(plan.trigger.frequency).toBe("monthly");
    }
    const task = planToTaskDef(plan);
    expect(task.scheduleMode).toBe("calendar");
    expect(task.recurrenceRule).toBe("monthly");
  });

  it("compiles dual-signal ALL match", () => {
    const plan = taskDefToPlan({
      title: "Dual signal",
      scheduleMode: "trigger",
      executionKind: "content_optimizer_meta",
      executionPayload: { targetBucket: "pages" },
      triggerConfig: {
        sources: ["gsc"],
        match: "all",
        conditions: [
          { signal: "impressions_up_ctr_down", operator: "gte", value: 0, minImpressions: 100 },
          { signal: "clicks_drop", operator: "gte", value: 10, minImpressions: 100 },
        ],
        lookbackDays: 28,
        compareDays: 28,
        pollHours: 24,
        cooldownHours: 72,
        maxUrls: 5,
      },
    });
    if (plan.trigger.kind === "gsc") {
      expect(plan.trigger.keyword).toBe("gsc-dual-decay");
      expect(plan.trigger.triggerConfig.match).toBe("all");
    }
  });

  it("validates plan requires name and keyword", () => {
    const errors = validateAutomationPlan({
      keyword: "",
      name: "",
      trigger: {
        keyword: "gsc-ctr-drop",
        kind: "gsc",
        source: "gsc",
        triggerConfig: {
          sources: ["gsc"],
          match: "any",
          conditions: [],
          lookbackDays: 28,
          compareDays: 28,
          pollHours: 24,
          cooldownHours: 72,
          maxUrls: 5,
        },
      },
      action: {
        keyword: "content-optimizer-full",
        executionKind: "content_optimizer",
        executionPayload: {},
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("automation-planner recipe round-trip", () => {
  const recipes = loadRecipes();

  it(`loads ${recipes.length} recipe files`, () => {
    const onDisk = readdirSync(recipesDir).filter((f) => f.endsWith(".json")).length;
    expect(recipes.length).toBe(onDisk);
  });

  for (const recipe of recipes) {
    const keyword = String(recipe.keyword ?? "");
    it(`round-trips ${keyword}`, () => {
      const catalog = recipe as import("@/lib/automation-recipes-types").AutomationRecipeCatalogItem;
      const plan = recipeToPlan(catalog);
      const compiled = planToTaskDef(plan);
      const original = catalog.defaultTasks?.[0];
      if (!original) return;
      expect(compiled.scheduleMode).toBe(original.scheduleMode);
      expect(compiled.executionKind).toBe(original.executionKind);
      if (original.triggerConfig) {
        expect(compiled.triggerConfig?.conditions?.length).toBe(original.triggerConfig.conditions?.length);
      }
      if (original.scheduleMode === "calendar") {
        expect(compiled.recurrenceRule).toBe(original.recurrenceRule);
        // Production defaults a missing calendar time to "09:00" (automation-planner-compile.ts).
        expect(compiled.dueTime).toBe(original.dueTime ?? "09:00");
      }
    });
  }
});
