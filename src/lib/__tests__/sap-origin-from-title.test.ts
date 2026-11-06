import { describe, expect, it } from "vitest";
import {
  applySapOriginFromTitleToRows,
  extractOriginFromSapTitle,
} from "@/lib/sap-origin-from-title";

describe("extractOriginFromSapTitle", () => {
  it("extracts hyperlocal tail after last in", () => {
    expect(
      extractOriginFromSapTitle("Custom Blinds Installation in Canton Rd Corridor, Marietta"),
    ).toBe("Canton Rd Corridor, Marietta");
  });

  it("uses last in when multiple clauses", () => {
    expect(extractOriginFromSapTitle("Services in Edmonton in Downtown Core")).toBe("Downtown Core");
  });

  it("returns undefined when no in", () => {
    expect(extractOriginFromSapTitle("Window Treatments Near Me")).toBeUndefined();
  });

  it("returns undefined for year-only tail", () => {
    expect(extractOriginFromSapTitle("Best Blinds in 2024")).toBeUndefined();
  });

  it("strips trailing period", () => {
    expect(extractOriginFromSapTitle("Solar in Metro Core, Calgary.")).toBe("Metro Core, Calgary");
  });
});

describe("applySapOriginFromTitleToRows", () => {
  it("fills origin from title when origin empty", () => {
    const out = applySapOriginFromTitleToRows<{
      keyword: string;
      title: string;
      entity: string;
      origin?: string;
    }>([{ keyword: "k", title: "K in Woodstock, GA", entity: "Woodstock, GA" }]);
    expect(out[0].origin).toBe("Woodstock, GA");
  });

  it("preserves existing origin", () => {
    const out = applySapOriginFromTitleToRows([
      { keyword: "k", title: "K in A, B", origin: "Explicit" },
    ]);
    expect(out[0].origin).toBe("Explicit");
  });
});
