import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const recipesDir = join(root, "recipes");

describe("automation recipe catalog json", () => {
  it("loads every recipe file on disk and validates its shape", () => {
    const files = readdirSync(recipesDir).filter((name) => name.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const raw = readFileSync(join(recipesDir, file), "utf8");
      const data = JSON.parse(raw);
      expect(data.keyword).toBeTruthy();
      expect(data.name).toBeTruthy();
      expect(data.isAutomation).toBe(true);
      expect(Array.isArray(data.defaultTasks)).toBe(true);
      expect(data.defaultTasks.length).toBeGreaterThan(0);
      const targetsBuckets = (data.filters?.targetBuckets?.length ?? 0) > 0;
      const targetsExecutionKinds = (data.filters?.executionKinds?.length ?? 0) > 0;
      expect(targetsBuckets || targetsExecutionKinds).toBe(true);
      expect(Array.isArray(data.notes)).toBe(true);
      expect(data.notes.length).toBeGreaterThan(0);
    }
  });
});
