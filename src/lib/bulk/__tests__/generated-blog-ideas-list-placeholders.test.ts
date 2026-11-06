import { describe, expect, it } from "vitest";
import { padListWithPlaceholders } from "@/components/keyword-research/bulk/generated-blog-ideas-list-helpers";
import { BULK_GENERATOR_EMPTY_ROW_COUNT } from "@/components/keyword-research/blog-generator-tab-classes";

describe("padListWithPlaceholders", () => {
  it("pads two real rows to 18 zebra slots", () => {
    const items = [
      {
        generatedIdx: 0,
        row: { keyword: "a", title: "A" },
        slotIdx: 0,
        sortableId: "0",
      },
      {
        generatedIdx: 1,
        row: { keyword: "b", title: "B" },
        slotIdx: 1,
        sortableId: "1",
      },
    ];
    const padded = padListWithPlaceholders(items, BULK_GENERATOR_EMPTY_ROW_COUNT);
    expect(padded).toHaveLength(BULK_GENERATOR_EMPTY_ROW_COUNT);
    expect(padded.filter((i) => i.placeholder).length).toBe(
      BULK_GENERATOR_EMPTY_ROW_COUNT - 2,
    );
  });
});
