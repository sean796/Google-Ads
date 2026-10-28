import { describe, expect, it } from "vitest";
import { editorialContentPackageTierForPropertyName } from "@/lib/editorial-content-package";
import { buildEditorialAlignPlan, localPublishSlotToDateGmt } from "@/lib/editorial-schedule-align";

describe("editorialContentPackageTierForPropertyName", () => {
  it("maps plan client names to tiers", () => {
    expect(editorialContentPackageTierForPropertyName("Advance Blinds")).toBe("lite");
    expect(editorialContentPackageTierForPropertyName("Blind Magic")).toBe("standard");
    expect(editorialContentPackageTierForPropertyName("Interiors By Laura")).toBe("standard");
    expect(editorialContentPackageTierForPropertyName("You Junk It... I Dump It")).toBe("lite");
    expect(editorialContentPackageTierForPropertyName("DM Interiors & Design")).toBe("standard");
  });
});

describe("buildEditorialAlignPlan", () => {
  const blog = (id: number, date_gmt: string) => ({
    id,
    date_gmt,
    title: `Blog ${id}`,
    postTypeEndpoint: "posts",
    kind: "blog" as const,
  });

  const sap = (id: number, date_gmt: string) => ({
    id,
    date_gmt,
    title: `SAP ${id}`,
    postTypeEndpoint: "service-areas",
    kind: "sap" as const,
  });

  it("assigns standard tier counts across one month", () => {
    const moves = buildEditorialAlignPlan({
      blogs: [blog(1, "2026-01-01T10:00:00"), blog(2, "2026-01-02T10:00:00")],
      saps: [sap(3, "2026-01-03T10:00:00"), sap(4, "2026-01-04T10:00:00"), sap(5, "2026-01-05T10:00:00"), sap(6, "2026-01-06T10:00:00")],
      quotas: { blogsPerMonth: 2, sapsPerMonth: 4 },
      startMonthKey: "2026-04",
      publishTimeLocal: "02:00",
      notBefore: new Date("2026-04-01T00:00:00"),
    });
    expect(moves).toHaveLength(6);
    for (const m of moves) {
      expect(m.newDateGmt.startsWith("2026-04")).toBe(true);
    }
  });

  it("spills extra posts into the next month", () => {
    const moves = buildEditorialAlignPlan({
      blogs: [blog(1, "2026-01-01T10:00:00"), blog(2, "2026-01-02T10:00:00"), blog(3, "2026-01-03T10:00:00")],
      saps: [],
      quotas: { blogsPerMonth: 2, sapsPerMonth: 4 },
      startMonthKey: "2026-04",
      publishTimeLocal: "02:00",
      notBefore: new Date("2026-04-01T00:00:00"),
    });
    expect(moves).toHaveLength(3);
    const april = moves.filter((m) => m.newDateGmt.startsWith("2026-04"));
    const may = moves.filter((m) => m.newDateGmt.startsWith("2026-05"));
    expect(april).toHaveLength(2);
    expect(may).toHaveLength(1);
  });
});

describe("localPublishSlotToDateGmt", () => {
  it("returns ISO UTC without milliseconds", () => {
    const iso = localPublishSlotToDateGmt("2026-04-04", "02:00");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });
});
