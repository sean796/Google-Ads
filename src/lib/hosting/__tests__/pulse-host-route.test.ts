import { describe, expect, it } from "vitest";
import { buildPulseHostPath, isPulseHostPath, parsePulseHostRoute } from "../pulse-host-route";

describe("pulse-host-route", () => {
  it("recognises list and profile paths only", () => {
    expect(isPulseHostPath("/pulse-host")).toBe(true);
    expect(isPulseHostPath("/pulse-host/sites/abc")).toBe(true);
    expect(isPulseHostPath("/pulse-forge")).toBe(false);
    expect(isPulseHostPath("/pulse-hosting")).toBe(false);
  });

  it("parses the list route", () => {
    expect(parsePulseHostRoute("/pulse-host")).toEqual({ view: "list" });
    expect(parsePulseHostRoute("/pulse-host/sites")).toEqual({ view: "list" });
  });

  it("parses group, environment, and section", () => {
    expect(parsePulseHostRoute("/pulse-host/sites/g1")).toEqual({ view: "site", groupId: "g1", envId: null, section: "overview" });
    expect(parsePulseHostRoute("/pulse-host/sites/g1/e1/users")).toEqual({ view: "site", groupId: "g1", envId: "e1", section: "users" });
  });

  it("falls to overview for an unknown section", () => {
    expect(parsePulseHostRoute("/pulse-host/sites/g1/e1/nope")).toMatchObject({ view: "site", section: "overview" });
  });

  it("builds paths that parse back to the same route", () => {
    const route = { view: "site" as const, groupId: "g 1", envId: "e1", section: "activity" as const };
    const path = buildPulseHostPath(route);
    expect(path).toBe("/pulse-host/sites/g%201/e1/activity");
    expect(parsePulseHostRoute(path)).toEqual(route);
    expect(buildPulseHostPath({ view: "list" })).toBe("/pulse-host");
    expect(buildPulseHostPath({ view: "site", groupId: "g1", envId: null, section: "overview" })).toBe("/pulse-host/sites/g1");
  });
});
