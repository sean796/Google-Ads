import { describe, expect, it } from "vitest";
import { resolveDataForSeoLocationCode } from "@/lib/dataforseo-location-code";

describe("resolveDataForSeoLocationCode", () => {
  it("maps Calgary geo labels to Calgary city code", () => {
    expect(resolveDataForSeoLocationCode("Calgary,Alberta,Canada")).toBe(1006350);
    expect(resolveDataForSeoLocationCode("Calgary, AB")).toBe(1006350);
  });

  it("maps Canada country label", () => {
    expect(resolveDataForSeoLocationCode("Canada")).toBe(2124);
  });

  it("does not default Canadian keywords to United States", () => {
    expect(resolveDataForSeoLocationCode("Edmonton,Alberta,Canada")).toBe(1006218);
  });
});
