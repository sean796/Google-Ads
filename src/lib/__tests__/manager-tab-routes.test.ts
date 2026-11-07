import { describe, expect, it } from "vitest";
import {
  MANAGER_TAB_ROUTES,
  isManagerTabId,
  legacyHashToPath,
  managerTabFromPathname,
  managerTabPath,
} from "@/lib/manager-tab-routes";

describe("manager tab routes", () => {
  it("registers 24 unique tabs", () => {
    expect(MANAGER_TAB_ROUTES).toHaveLength(24);
    expect(new Set(MANAGER_TAB_ROUTES.map((r) => r.id)).size).toBe(24);
  });

  it("routes the changelog tab at /changelog", () => {
    expect(managerTabPath("changelog")).toBe("/changelog");
    expect(managerTabFromPathname("/changelog")).toBe("changelog");
    expect(isManagerTabId("changelog")).toBe(true);
  });

  it("round-trips every tab id through its path (except vertical-benchmarks)", () => {
    for (const route of MANAGER_TAB_ROUTES) {
      if (route.id === "vertical-benchmarks") continue;
      expect(managerTabFromPathname(managerTabPath(route.id))).toBe(route.id);
    }
    // vertical-benchmarks deliberately lives inside the generator tab.
    expect(managerTabPath("vertical-benchmarks")).toBe("/generator/bulk-prompt");
    expect(managerTabFromPathname(managerTabPath("vertical-benchmarks"))).toBe("generator");
  });

  it("builds generator paths with and without a section", () => {
    expect(managerTabPath("generator")).toBe("/generator/bulk-prompt");
    expect(managerTabPath("generator", "sap")).toBe("/generator/sap");
  });

  it("lands unknown and empty paths on dashboard", () => {
    expect(managerTabFromPathname("")).toBe("dashboard");
    expect(managerTabFromPathname("/")).toBe("dashboard");
    expect(managerTabFromPathname("/no-such-tab")).toBe("dashboard");
    expect(managerTabFromPathname("/blogs/123")).toBe("dashboard");
    expect(managerTabPath("no-such-tab")).toBe("/dashboard");
  });

  it("reads the first path segment as the tab", () => {
    expect(managerTabFromPathname("/chat")).toBe("chat");
    expect(managerTabFromPathname("/chat/anything/deeper")).toBe("chat");
    expect(managerTabFromPathname("/sitemap-optimizer")).toBe("sitemap-optimizer");
  });

  it("recognizes tab ids", () => {
    expect(isManagerTabId("chat")).toBe(true);
    expect(isManagerTabId("pulse-forge")).toBe(true);
    expect(isManagerTabId("nope")).toBe(false);
    expect(isManagerTabId("")).toBe(false);
  });
});

describe("legacyHashToPath", () => {
  it("maps empty, settings, and dashboard hashes to the dashboard", () => {
    expect(legacyHashToPath("")).toBe("/dashboard");
    expect(legacyHashToPath("#")).toBe("/dashboard");
    expect(legacyHashToPath("#settings")).toBe("/dashboard");
    expect(legacyHashToPath("dashboard")).toBe("/dashboard");
  });

  it("returns null for hashes that are not tab routing", () => {
    expect(legacyHashToPath("register")).toBeNull();
    expect(legacyHashToPath("#register?invite=abc")).toBeNull();
    expect(legacyHashToPath("some-oauth-payload")).toBeNull();
  });

  it("maps renamed and nested legacy hashes", () => {
    expect(legacyHashToPath("local-grid")).toBe("/local-dominator");
    expect(legacyHashToPath("generator/vertical-benchmarks")).toBe("/generator/bulk-prompt");
    expect(legacyHashToPath("api-docs")).toBe("/api");
    expect(legacyHashToPath("api-docs/usage")).toBe("/api/usage");
  });

  it("maps chat message hashes and plain tab hashes", () => {
    expect(legacyHashToPath("#m123")).toBe("/chat?message=123");
    expect(legacyHashToPath("tasks")).toBe("/tasks");
    expect(legacyHashToPath("#pulse-forge")).toBe("/pulse-forge");
  });
});
