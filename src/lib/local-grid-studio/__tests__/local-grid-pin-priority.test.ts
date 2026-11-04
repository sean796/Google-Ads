import { describe, expect, it } from "vitest";
import { rankGridPinsByPriority } from "../local-grid-pin-priority";
import type { LocalGridEvaluatedPin, LocalGridSerpItem } from "../local-grid-types";

const item: LocalGridSerpItem = {
  rank: 1,
  business: "Rival",
  address: "1 Main St, Oakland, CA",
  placeId: "p",
  websiteUrl: "",
  primaryCategory: "",
  secondaryCategories: "",
  rating: null,
  reviews: null,
  googleUrl: "",
};

function pin(pointId: string, targetRank: number | null, distanceFromCenter: number, items = [item]): LocalGridEvaluatedPin {
  return {
    pointId,
    row: 0,
    col: 0,
    latitude: 37.8,
    longitude: -122.2,
    distanceFromCenter,
    items,
    targetRank,
    bucket: targetRank === null ? "out" : "med",
    matchedItem: null,
  };
}

describe("rankGridPinsByPriority", () => {
  it("puts weaker ranks ahead of stronger ranks", () => {
    const out = rankGridPinsByPriority([pin("a", 2, 1), pin("b", 15, 1), pin("c", 7, 1)]);
    expect(out.map((p) => p.pin.pointId)).toEqual(["b", "c", "a"]);
  });

  it("puts every unranked pin ahead of every ranked pin", () => {
    const out = rankGridPinsByPriority([pin("ranked", 20, 0), pin("none", null, 5)]);
    expect(out[0]!.pin.pointId).toBe("none");
    expect(out[0]!.priority).toBeGreaterThanOrEqual(1);
    expect(out[1]!.priority).toBeLessThanOrEqual(1);
  });

  it("orders unranked pins by closeness to the center", () => {
    const out = rankGridPinsByPriority([pin("far", null, 6), pin("near", null, 1), pin("mid", null, 3)]);
    expect(out.map((p) => p.pin.pointId)).toEqual(["near", "mid", "far"]);
  });

  it("handles an all-unranked grid with zero distances", () => {
    const out = rankGridPinsByPriority([pin("a", null, 0), pin("b", null, 0)]);
    expect(out.map((p) => p.priority)).toEqual([2, 2]);
  });

  it("keeps an all rank 1 grid ordered and low priority", () => {
    const out = rankGridPinsByPriority([pin("b", 1, 2), pin("a", 1, 1)]);
    expect(out.map((p) => p.pin.pointId)).toEqual(["a", "b"]);
    expect(out[0]!.priority).toBeCloseTo(0.05);
  });

  it("drops pins without scan results and throws when none remain", () => {
    expect(rankGridPinsByPriority([pin("a", 3, 1), pin("empty", null, 0, [])]).map((p) => p.pin.pointId)).toEqual(["a"]);
    expect(() => rankGridPinsByPriority([pin("empty", null, 0, [])])).toThrow(/no pins with results/);
  });
});
