import { describe, expect, it } from "vitest";
import {
  MANAGER_TAB_ROUTES,
  isManagerTabId,
  legacyHashToPath,
  managerTabFromPathname,
  managerTabPath,
} from "@/lib/manager-tab-routes";

describe("manager tab routes (Wave 4)", () => {
  it("registers all 23 manager tabs with a unique segment each", () => {
    expect(MANAGER_TAB_ROUTES).toHaveLength(23);
    const segments = MANAGER_TAB_ROUTES.map((r) => r.segment);
    expect(new Set(segments).size).toBe(23);
    for (const route of MANAGER_TAB_ROUTES) {
      expect(isManagerTabId(route.id)).toBe(true);
      expect(managerTabFromPathname(`/${route.segment}`)).toBe(route.id);
    }
  });

  it("round-trips tab paths, with generator carrying its section", () => {
    expect(managerTabPath("dashboard")).toBe("/dashboard");
    expect(managerTabPath("tasks")).toBe("/tasks");
    expect(managerTabPath("generator", "opt")).toBe("/generator/opt");
    expect(managerTabPath("vertical-benchmarks")).toBe("/generator/bulk-prompt");
    expect(managerTabPath("not-a-tab")).toBe("/dashboard");
    expect(managerTabFromPathname("/generator/opt/agent-run/12")).toBe("generator");
    expect(managerTabFromPathname("/")).toBe("dashboard");
  });

  it("maps legacy hashes to their routes", () => {
    expect(legacyHashToPath("")).toBe("/dashboard");
    expect(legacyHashToPath("#settings")).toBe("/dashboard");
    expect(legacyHashToPath("#neo-emcp")).toBe("/dashboard");
    expect(legacyHashToPath("#local-grid")).toBe("/local-dominator");
    expect(legacyHashToPath("#generator/bulk-prompt")).toBe("/generator/bulk-prompt");
    expect(legacyHashToPath("#generator/opt/agent-run/42")).toBe("/generator/opt/agent-run/42");
    expect(legacyHashToPath("#api-docs/getting-started")).toBe("/api/getting-started");
    expect(legacyHashToPath("#api")).toBe("/api");
    expect(legacyHashToPath("#pulse-forge/workflows/7")).toBe("/pulse-forge/workflows/7");
    expect(legacyHashToPath("#pulse-host/sites/g1")).toBe("/pulse-host/sites/g1");
    expect(legacyHashToPath("#tasks")).toBe("/tasks");
    expect(legacyHashToPath("#m123")).toBe("/chat?message=123");
  });

  it("leaves non-routing hashes alone", () => {
    expect(legacyHashToPath("#register?invite=abc")).toBeNull();
    expect(legacyHashToPath("#access_token=xyz")).toBeNull();
  });
});
