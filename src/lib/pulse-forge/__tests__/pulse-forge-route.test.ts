import { describe, expect, it } from "vitest";
import { buildPulseForgePath, parsePulseForgeRoute, type PulseForgeRoute } from "../pulse-forge-route";

describe("parsePulseForgeRoute", () => {
  it("maps the forge root to the forge section", () => {
    expect(parsePulseForgeRoute("/pulse-forge")).toEqual({ section: "forge" });
    expect(parsePulseForgeRoute("/pulse-forge/forge")).toEqual({ section: "forge" });
  });

  it("maps workflows paths to the workflows section", () => {
    expect(parsePulseForgeRoute("/pulse-forge/workflows")).toEqual({ section: "workflows" });
    expect(parsePulseForgeRoute("/pulse-forge/workflows/new")).toEqual({ section: "workflows", view: "new" });
    expect(parsePulseForgeRoute("/pulse-forge/workflows/12")).toEqual({
      section: "workflows",
      view: "edit",
      workflowId: 12,
    });
  });

  it("maps recipes paths to the recipes section", () => {
    expect(parsePulseForgeRoute("/pulse-forge/recipes")).toEqual({ section: "recipes" });
  });
});

describe("buildPulseForgePath", () => {
  it("round-trips each section", () => {
    const routes: PulseForgeRoute[] = [{ section: "forge" }, { section: "workflows" }, { section: "recipes" }];
    for (const route of routes) {
      expect(parsePulseForgeRoute(buildPulseForgePath(route))).toEqual(route);
    }
    expect(buildPulseForgePath({ section: "workflows", view: "edit", workflowId: 7 })).toBe(
      "/pulse-forge/workflows/7",
    );
  });
});
