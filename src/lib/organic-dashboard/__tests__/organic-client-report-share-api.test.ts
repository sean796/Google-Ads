import { describe, expect, it } from "vitest";
import { resolveOrganicClientReportDeckId } from "@/lib/organic-dashboard/organic-client-report-share-api";

describe("resolveOrganicClientReportDeckId", () => {
  const id = "5d753033-fdfe-4775-863f-aa7e84ccb9d9";

  it("reads deck query param", () => {
    const params = new URLSearchParams(`deck=${id}`);
    expect(resolveOrganicClientReportDeckId(params)).toBe(id);
  });

  it("reads hash query param when deck is absent", () => {
    const params = new URLSearchParams(`hash=${id}&ts=2825161993719155`);
    expect(resolveOrganicClientReportDeckId(params)).toBe(id);
  });

  it("prefers deck over hash", () => {
    const other = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const params = new URLSearchParams(`deck=${id}&hash=${other}`);
    expect(resolveOrganicClientReportDeckId(params)).toBe(id);
  });
});
