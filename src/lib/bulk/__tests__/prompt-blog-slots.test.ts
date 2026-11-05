import { describe, expect, it } from "vitest";
import {
  emptyPromptBlogSlot,
  normalizePromptBlogSlotCount,
  seedPromptBlogSlots,
  syncPromptBlogRowsToCount,
} from "@/lib/bulk/prompt-blog-slots";

describe("prompt-blog-slots", () => {
  it("emptyPromptBlogSlot returns blank keyword and title", () => {
    expect(emptyPromptBlogSlot()).toEqual({ keyword: "", title: "" });
  });

  it("normalizePromptBlogSlotCount enforces minimum 0 only", () => {
    expect(normalizePromptBlogSlotCount(0)).toBe(0);
    expect(normalizePromptBlogSlotCount(25)).toBe(25);
    expect(normalizePromptBlogSlotCount(120)).toBe(120);
  });

  it("syncPromptBlogRowsToCount pads empty slots", () => {
    const rows = syncPromptBlogRowsToCount([{ keyword: "solar grants", title: "" }], 3);
    expect(rows).toHaveLength(3);
    expect(rows[0].keyword).toBe("solar grants");
    expect(rows[1]).toEqual({ keyword: "", title: "" });
    expect(rows[2]).toEqual({ keyword: "", title: "" });
  });

  it("syncPromptBlogRowsToCount trims excess rows", () => {
    const rows = syncPromptBlogRowsToCount(
      [
        { keyword: "a", title: "" },
        { keyword: "b", title: "" },
        { keyword: "c", title: "" },
      ],
      2,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].keyword).toBe("a");
    expect(rows[1].keyword).toBe("b");
  });

  it("seedPromptBlogSlots creates N empty rows", () => {
    expect(seedPromptBlogSlots(4)).toEqual([
      { keyword: "", title: "" },
      { keyword: "", title: "" },
      { keyword: "", title: "" },
      { keyword: "", title: "" },
    ]);
  });
});
