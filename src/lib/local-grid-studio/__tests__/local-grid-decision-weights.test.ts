import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalGridEvaluatedPin } from "../local-grid-types";

const chat = vi.hoisted(() => vi.fn());

vi.mock("@/lib/openrouter-agent-category-api", () => ({ callAgentCategoryOpenRouterChat: chat }));

import { planWeightedGridPlaces } from "../local-grid-decision-weights";

function pin(pointId: string, targetRank: number | null, distanceFromCenter: number, address: string): LocalGridEvaluatedPin {
  return {
    pointId,
    row: 0,
    col: 0,
    latitude: 37.7,
    longitude: -121.9,
    distanceFromCenter,
    targetRank,
    bucket: "med",
    matchedItem: null,
    items: [
      {
        rank: 1,
        business: "Rival",
        address,
        placeId: "p",
        websiteUrl: "",
        primaryCategory: "",
        secondaryCategories: "",
        rating: null,
        reviews: null,
        googleUrl: "",
      },
    ],
  };
}

const ALL_QUESTIONS = ["q1", "q2", "q3", "q4", "q5", "q6"];

/** Model answer: the same score for every question, per city. */
function answer(byCity: Record<string, number>) {
  const scores = Object.fromEntries(
    Object.entries(byCity).map(([city, s]) => [city, Object.fromEntries(ALL_QUESTIONS.map((q) => [q, s]))]),
  );
  chat.mockResolvedValue({ raw: {}, content: JSON.stringify({ scores }) });
}

const base = {
  pins: [
    pin("a", null, 1, "100 Main St, Pleasanton, CA 94566"),
    pin("b", 12, 2, "200 First St, Livermore, CA 94550"),
  ],
  keyword: "custom window treatments",
  businessName: "Blinds Co",
  totalRows: 8,
  apiKey: "key",
};

describe("planWeightedGridPlaces", () => {
  beforeEach(() => {
    chat.mockReset();
  });

  it("makes one decision-agent call and splits rows by pin priority and relevance", async () => {
    answer({ "Pleasanton, CA": 8, "Livermore, CA": 8 });
    const out = await planWeightedGridPlaces(base);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(chat.mock.calls[0]![0].category).toBe("decision");
    expect(out.map((p) => p.place)).toEqual(["Pleasanton, CA", "Livermore, CA"]);
    expect(out.reduce((s, p) => s + p.pages, 0)).toBe(8);
    expect(out[0]!.pages).toBeGreaterThan(out[1]!.pages);
  });

  it("lets low relevance pull a city down even when its pins are weak", async () => {
    answer({ "Pleasanton, CA": 0, "Livermore, CA": 10 });
    const out = await planWeightedGridPlaces({
      ...base,
      pins: [pin("a", 20, 1, "1 A St, Pleasanton, CA"), pin("b", 14, 1, "2 B St, Livermore, CA")],
    });
    expect(out[0]!.place).toBe("Livermore, CA");
  });

  it("keeps only the top cities by weight when there are more cities than rows", async () => {
    answer({ "Pleasanton, CA": 5, "Livermore, CA": 5, "Dublin, CA": 5 });
    const out = await planWeightedGridPlaces({
      ...base,
      totalRows: 2,
      pins: [
        pin("a", null, 1, "1 A St, Pleasanton, CA"),
        pin("b", 10, 1, "2 B St, Livermore, CA"),
        pin("c", 2, 1, "3 C St, Dublin, CA"),
      ],
    });
    expect(out.map((p) => p.place).sort()).toEqual(["Livermore, CA", "Pleasanton, CA"]);
    expect(out.reduce((s, p) => s + p.pages, 0)).toBe(2);
  });

  it("fails when no pin address carries a city", async () => {
    await expect(planWeightedGridPlaces({ ...base, pins: [pin("a", 5, 1, "no city here")] })).rejects.toThrow(
      /no City, ST/,
    );
  });

  it("reports the finish reason when the model returns no JSON", async () => {
    chat.mockResolvedValue({ raw: {}, content: "sorry", finishReason: "length" });
    await expect(planWeightedGridPlaces(base)).rejects.toThrow(/did not return JSON \(finish: length\)/);
  });
});
