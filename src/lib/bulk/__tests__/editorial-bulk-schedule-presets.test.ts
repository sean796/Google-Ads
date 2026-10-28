import { describe, expect, it } from "vitest";
import { buildEditorialPackageQuickPresets } from "@/lib/bulk/editorial-bulk-schedule-presets";

describe("buildEditorialPackageQuickPresets", () => {
  it("uses SAP quota when entities sitemap is selected", () => {
    const presets = buildEditorialPackageQuickPresets(
      { name: "DM Interiors", editorialContentPackage: "standard" },
      "entities",
    );
    expect(presets).toHaveLength(2);
    expect(presets[0]?.label).toContain("Standard");
    expect(presets[0]?.values.customInterval).toBe(4);
    expect(presets[1]?.values.customInterval).toBe(2);
  });

  it("uses blog quota when posts sitemap is selected", () => {
    const presets = buildEditorialPackageQuickPresets(
      { name: "Advance Blinds", editorialContentPackage: "lite" },
      "posts",
    );
    expect(presets[0]?.values.customInterval).toBe(2);
    expect(presets[1]?.values.customInterval).toBe(1);
    expect(presets[0]?.values.startPreset).toBe("firstOfNextMonth");
  });
});
