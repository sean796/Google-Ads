import { describe, expect, it } from "vitest";
import { isChartBoxReady } from "@/ui/vendor/chart-box-ready";

describe("isChartBoxReady", () => {
  it("does not treat a 0x0 box as ready to mount a Recharts child", () => {
    expect(isChartBoxReady(0, 0)).toBe(false);
  });

  it("does not treat a zero-width box as ready", () => {
    expect(isChartBoxReady(0, 56)).toBe(false);
  });

  it("does not treat a zero-height box as ready", () => {
    expect(isChartBoxReady(320, 0)).toBe(false);
  });

  it("treats a reserved hero or usage box as ready", () => {
    expect(isChartBoxReady(320, 56)).toBe(true);
    expect(isChartBoxReady(640, 192)).toBe(true);
  });
});
