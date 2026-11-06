import { describe, expect, it } from "vitest";
import {
  buildAgentRunOptimizerPath,
  buildAgentRunViewPath,
  isAgentRunOptimizerPath,
  parseAgentRunIdFromPath,
  parseGeneratorSectionFromPath,
} from "@/lib/agent-runs/agent-run-optimizer-url";

describe("agent-run-optimizer-url", () => {
  it("builds path with run id", () => {
    expect(buildAgentRunOptimizerPath(42)).toBe("/generator/opt/agent-run/42");
    expect(buildAgentRunViewPath(42, "report")).toBe("/generator/report/agent-run/42");
  });

  it("parses run id from path", () => {
    expect(parseAgentRunIdFromPath("/generator/opt/agent-run/42")).toBe(42);
    expect(parseAgentRunIdFromPath("/generator/report/agent-run/42")).toBe(42);
  });

  it("rejects invalid paths", () => {
    expect(parseAgentRunIdFromPath("/generator/opt")).toBeNull();
    expect(parseAgentRunIdFromPath("/generator")).toBeNull();
    expect(parseAgentRunIdFromPath("/generator/opt/agent-run/0")).toBeNull();
  });

  it("detects agent optimizer path", () => {
    expect(isAgentRunOptimizerPath("/generator/opt/agent-run/7")).toBe(true);
    expect(isAgentRunOptimizerPath("/generator/report/agent-run/7")).toBe(true);
    expect(isAgentRunOptimizerPath("/generator/opt")).toBe(false);
  });

  it("parses generator section from path", () => {
    expect(parseGeneratorSectionFromPath("/generator/opt/agent-run/1")).toBe("opt");
    expect(parseGeneratorSectionFromPath("/generator/report/agent-run/1")).toBe("report");
    expect(parseGeneratorSectionFromPath("/generator/bulk-csv/agent-run/1")).toBe("bulk-csv");
    expect(parseGeneratorSectionFromPath("/generator/flow")).toBe("flow");
  });
});
