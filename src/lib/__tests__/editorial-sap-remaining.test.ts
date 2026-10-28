import { describe, expect, it } from "vitest";
import { editorialSapScheduledRemainingForSite } from "@/lib/editorial-content-package";

describe("editorialSapScheduledRemainingForSite", () => {
  it("returns quota minus scheduled for standard sites", () => {
    expect(
      editorialSapScheduledRemainingForSite(
        { name: "Blinds West", editorialContentPackage: "standard" },
        { entityScheduled: 0, entityCountsAvailable: true, loading: false },
      ),
    ).toBe(4);
    expect(
      editorialSapScheduledRemainingForSite(
        { name: "Blinds West", editorialContentPackage: "standard" },
        { entityScheduled: 2, entityCountsAvailable: true, loading: false },
      ),
    ).toBe(2);
  });

  it("returns null for non-editorial sites", () => {
    expect(
      editorialSapScheduledRemainingForSite({ name: "Neo Digital Agency" }, {
        entityScheduled: 0,
        entityCountsAvailable: true,
      }),
    ).toBeNull();
  });
});
