import { describe, expect, it } from "vitest";
import {
  browserAutomationIsConfigured,
  browserAutomationRequiresClient,
  browserInstructionsForJob,
  extractUrlFromStepOutput,
  resolveBrowserTargetUrl,
} from "@/lib/browser-automation/resolve-browser-target-url";
import type { WorkflowStepOutput } from "@/lib/workflow/workflow-types";

describe("resolveBrowserTargetUrl", () => {
  it("uses manual targetUrl by default", () => {
    const url = resolveBrowserTargetUrl(
      { targetUrl: "https://example.com/page" },
      null,
    );
    expect(url).toBe("https://example.com/page");
  });

  it("resolves client_site from site record", () => {
    const url = resolveBrowserTargetUrl(
      { targetUrlSource: "client_site" },
      { name: "Acme", siteUrl: "https://acme.test/" },
    );
    expect(url).toBe("https://acme.test/");
  });

  it("substitutes {{client_url}} in manual URLs", () => {
    const url = resolveBrowserTargetUrl(
      { targetUrl: "{{client_url}}/about" },
      { name: "Acme", siteUrl: "https://acme.test" },
    );
    expect(url).toBe("https://acme.test/about");
  });

  it("resolves variable source from textPreview URL", () => {
    const outputs: WorkflowStepOutput[] = [
      {
        id: 1,
        runId: 1,
        nodeId: "a1",
        variableKey: "step_a1__site-a",
        scope: "run",
        siteId: "site-a",
        label: "Prior step",
        textPreview: "https://prior.example/home",
        fileRefs: [],
        createdAt: "",
      },
    ];
    const url = resolveBrowserTargetUrl(
      { targetUrlSource: "variable", targetUrlVariable: "step_a1" },
      { name: "Site A", siteUrl: "https://a.example" },
      { outputs, siteId: "site-a", clientSiteIds: ["site-a", "site-b"] },
    );
    expect(url).toBe("https://prior.example/home");
  });

  it("extractUrlFromStepOutput prefers file ref URL", () => {
    const output: WorkflowStepOutput = {
      id: 1,
      runId: 1,
      nodeId: "a1",
      variableKey: "step_a1",
      scope: "run",
      label: "Drive",
      textPreview: "Uploaded report",
      fileRefs: [{ name: "report.csv", url: "https://drive.example/file" }],
      createdAt: "",
    };
    expect(extractUrlFromStepOutput(output)).toBe("https://drive.example/file");
  });
});

describe("browserAutomationRequiresClient", () => {
  it("requires client for client_site and variable sources", () => {
    expect(browserAutomationRequiresClient({ targetUrlSource: "manual", targetUrl: "https://x.test" })).toBe(false);
    expect(browserAutomationRequiresClient({ targetUrlSource: "client_site" })).toBe(true);
    expect(browserAutomationRequiresClient({ targetUrlSource: "variable", targetUrlVariable: "step_a1" })).toBe(true);
  });
});

describe("browserAutomationIsConfigured", () => {
  it("validates by URL source", () => {
    expect(
      browserAutomationIsConfigured({
        browserInstructionsHtml: "<p>Go</p>",
        targetUrlSource: "client_site",
      }),
    ).toBe(true);
    expect(
      browserAutomationIsConfigured({
        browserInstructionsHtml: "<p>Go</p>",
        targetUrlSource: "variable",
        targetUrlVariable: "step_a1",
      }),
    ).toBe(true);
    expect(
      browserAutomationIsConfigured({
        browserInstructionsHtml: "<p>Go</p>",
        targetUrl: "https://example.com",
      }),
    ).toBe(true);
  });
});

describe("browserInstructionsForJob", () => {
  it("appends workflow context block to instructions", () => {
    const html = browserInstructionsForJob("<p>Audit pages</p>", "=== WORKFLOW CONTEXT ===");
    expect(html).toContain("Audit pages");
    expect(html).toContain("WORKFLOW CONTEXT");
  });
});
