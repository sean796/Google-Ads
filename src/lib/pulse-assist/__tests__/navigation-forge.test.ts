import { describe, expect, it } from "vitest";
import {
  executeAssistNavigation,
  forgeContextFromPath,
  parseAppHref,
  parsePulseAssistHref,
} from "@/lib/pulse-assist/navigation";

describe("pulse assist forge navigation", () => {
  it("parses pulse:nav forge paths", () => {
    expect(parsePulseAssistHref("pulse:nav/pulse-forge")).toEqual({
      kind: "pulseForge",
      hash: "pulse-forge",
    });
    expect(parsePulseAssistHref("pulse:nav/pulse-forge/workflows/12")).toEqual({
      kind: "pulseForge",
      hash: "pulse-forge/workflows/12",
    });
    expect(parsePulseAssistHref("pulse:nav/pulse-forge/recipes/gsc-monthly-mom-report")).toEqual({
      kind: "pulseForge",
      hash: "pulse-forge/recipes/gsc-monthly-mom-report",
    });
  });

  it("parses route path forge routes", () => {
    expect(parseAppHref("/pulse-forge/forge")).toEqual({
      kind: "pulseForge",
      hash: "pulse-forge/forge",
    });
    expect(parseAppHref("/pulse-forge/workflows/12")).toEqual({
      kind: "pulseForge",
      hash: "pulse-forge/workflows/12",
    });
  });

  it("reads forge context from a workflow path", () => {
    expect(forgeContextFromPath("/pulse-forge/workflows/12")).toEqual({
      forgeSection: "workflows",
      forgeWorkflowId: 12,
    });
    expect(forgeContextFromPath("/pulse-forge/recipes/gsc-monthly-mom-report")).toEqual({
      forgeSection: "recipes",
      forgeRecipeKeyword: "gsc-monthly-mom-report",
      forgeWorkflowId: undefined,
    });
  });

  it("switches to Pulse Forge and sets the route", () => {
    const tabs: string[] = [];
    const hashes: string[] = [];
    executeAssistNavigation(
      { kind: "pulseForge", hash: "pulse-forge/workflows/12" },
      {
        onManagerTabChange: (tab) => tabs.push(tab),
        onGeneratorSectionChange: () => undefined,
        onDashboardClusterChange: () => undefined,
        onPulseForgeHash: (hash) => hashes.push(hash),
      },
    );
    expect(tabs).toEqual(["pulse-forge"]);
    expect(hashes).toEqual(["pulse-forge/workflows/12"]);
  });
});
