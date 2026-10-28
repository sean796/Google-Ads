import { describe, expect, it } from "vitest";
import {
  isRejectedSapGridEntityLabel,
  isRejectedSapGridWikiTitle,
  sapGridEntityHead,
} from "@/lib/local-analysis/sap-grid-entity-reject";

describe("sap-grid-entity-reject", () => {
  it("rejects law enforcement and crime-related labels", () => {
    expect(isRejectedSapGridEntityLabel("Orlando Police Department, Naples, FL")).toBe(true);
    expect(isRejectedSapGridWikiTitle("Orlando Police Department")).toBe(true);
    expect(isRejectedSapGridEntityLabel("Daniel Conahan, Naples, FL")).toBe(true);
  });

  it("rejects abstract topic heads", () => {
    expect(isRejectedSapGridEntityLabel("Multiculturalism, Estero, FL")).toBe(true);
  });

  it("allows residential neighbourhood labels", () => {
    expect(isRejectedSapGridEntityLabel("Pelican Bay, Naples, FL")).toBe(false);
    expect(isRejectedSapGridEntityLabel("Historic Downtown, Estero, FL")).toBe(false);
  });

  it("extracts entity head", () => {
    expect(sapGridEntityHead("Pelican Bay, Naples, FL")).toBe("Pelican Bay");
  });
});
