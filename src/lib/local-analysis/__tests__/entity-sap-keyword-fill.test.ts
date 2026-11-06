import { describe, expect, it } from "vitest";
import {
  buildEntitySapKeywordPickSystemPrompt,
  buildEntitySapKeywordPickUserPayload,
  collapseRepeatedPlaceSegmentsInKeyword,
  keywordPlaceSuffixFromEntity,
  normalizeSapKeywordWithPlaceSuffix,
  padGscProductBasesFromCandidates,
  sapKeywordFromShortBaseAndEntity,
  serviceKeywordForSapTitle,
} from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import { resolveEntitySapTitleFromTemplate } from "@/lib/local-analysis/entity-sap-title-agent";

describe("buildEntitySapKeywordPickSystemPrompt", () => {
  const clientCtx = "**Business:** KWB LLP\n- **Services:** accounting, tax preparation";

  it("includes client-aware service rules and drops blinds examples", () => {
    const system = buildEntitySapKeywordPickSystemPrompt({ mode: "pick" });
    expect(system).toContain("tax preparation");
    expect(system).toContain("bare trust reporting");
    expect(system).toContain("Deprioritize generic informational queries");
    expect(system).not.toContain("hunter douglas");
    expect(system).not.toContain("roman shades");
  });

  it("appends client context and entity type focus when provided", () => {
    const system = buildEntitySapKeywordPickSystemPrompt({
      mode: "pick",
      clientAudienceContextMarkdown: clientCtx,
      entityTypeFocus: ["Business districts and downtown cores"],
    });
    expect(system).toContain("Client & site context");
    expect(system).toContain("KWB LLP");
    expect(system).toContain("Business districts and downtown cores");
  });
});

describe("buildEntitySapKeywordPickUserPayload", () => {
  it("includes clientAudienceContextMarkdown and entityTypeFocus in user JSON", () => {
    const user = buildEntitySapKeywordPickUserPayload({
      siteName: "KWB LLP",
      siteUrl: "https://kwb.example.com",
      entity: "Sherwood Park, AB",
      count: 3,
      seedKeywords: ["accounting services"],
      gscKeywords: ["tax preparation sherwood park"],
      gridLocations: ["Sherwood Park, AB"],
      clientAudienceContextMarkdown: "**Services:** tax preparation",
      entityTypeFocus: ["Business districts and downtown cores"],
    });
    const parsed = JSON.parse(user) as Record<string, unknown>;
    expect(parsed.clientAudienceContextMarkdown).toContain("tax preparation");
    expect(parsed.entityTypeFocus).toEqual(["Business districts and downtown cores"]);
  });
});

describe("padGscProductBasesFromCandidates", () => {
  const entity = "Strathcona County, Sherwood Park, AB";
  const gridLocations = ["Sherwood Park, AB", "Edmonton, AB"];

  it("strips place tokens from AI bases instead of keeping full geographic GSC strings", () => {
    const bases = padGscProductBasesFromCandidates({
      bases: ["alberta tax brackets strathcona county sherwood park"],
      count: 1,
      gscKeywords: [],
      entity,
      gridLocations,
    });
    expect(bases).toEqual(["alberta tax brackets"]);
    expect(bases[0]).not.toContain("sherwood park");
  });

  it("pads from GSC only with stripped service phrases, not raw queries", () => {
    const bases = padGscProductBasesFromCandidates({
      bases: [],
      count: 2,
      gscKeywords: [
        "bare trust reporting sherwood park",
        "alberta tax brackets strathcona county sherwood park",
      ],
      entity,
      gridLocations,
    });
    expect(bases).toHaveLength(2);
    expect(bases[0]).toBe("bare trust reporting");
    expect(bases[1]).toBe("alberta tax brackets");
  });

  it("leaves slots empty when stripped candidates cannot fill count", () => {
    const bases = padGscProductBasesFromCandidates({
      bases: [],
      count: 3,
      gscKeywords: ["sherwood park"],
      entity: "Sherwood Park, AB",
      gridLocations: ["Sherwood Park, AB"],
    });
    expect(bases).toHaveLength(0);
  });
});

describe("collapseRepeatedPlaceSegmentsInKeyword", () => {
  it("collapses adjacent duplicate comma segments", () => {
    expect(collapseRepeatedPlaceSegmentsInKeyword("posh outdoors Fort Saskatchewan, Fort Saskatchewan, AB")).toBe(
      "posh outdoors Fort Saskatchewan, AB",
    );
  });
});

describe("keywordPlaceSuffixFromEntity", () => {
  it("drops trailing region code and joins with spaces", () => {
    expect(keywordPlaceSuffixFromEntity("Ritchie, Edmonton, AB")).toBe("Ritchie Edmonton");
    expect(keywordPlaceSuffixFromEntity("Edmonton, AB")).toBe("Edmonton");
    expect(keywordPlaceSuffixFromEntity("Parkland County, AB")).toBe("Parkland County");
  });

  it("dedupes identical adjacent place segments", () => {
    expect(keywordPlaceSuffixFromEntity("Fort Saskatchewan, Fort Saskatchewan, AB")).toBe(
      "Fort Saskatchewan",
    );
  });
});

describe("sapKeywordFromShortBaseAndEntity", () => {
  it("strips foreign places and appends AdGroup entity lowercase", () => {
    expect(sapKeywordFromShortBaseAndEntity("posh glamping", "Parkland County, AB")).toBe(
      "posh glamping parkland county",
    );
    expect(sapKeywordFromShortBaseAndEntity("forensic accounting", "Ritchie, Edmonton, AB")).toBe(
      "forensic accounting ritchie edmonton",
    );
    expect(
      sapKeywordFromShortBaseAndEntity("posh outdoors", "Fort Saskatchewan, Fort Saskatchewan, AB"),
    ).toBe("posh outdoors fort saskatchewan");
  });

  it("strips place tokens already present in the GSC base then appends entity", () => {
    expect(
      sapKeywordFromShortBaseAndEntity("accountant Ritchie Edmonton", "Ritchie, Edmonton, AB"),
    ).toBe("accountant ritchie edmonton");
    expect(
      sapKeywordFromShortBaseAndEntity(
        "blinds edmonton",
        "West Meadowlark Park, Edmonton, AB",
        ["Edmonton, AB"],
      ),
    ).toBe("blinds west meadowlark park edmonton");
    expect(
      sapKeywordFromShortBaseAndEntity("blinds edmonton", "Westmount, Edmonton, AB", ["Edmonton, AB"]),
    ).toBe("blinds westmount edmonton");
    expect(
      sapKeywordFromShortBaseAndEntity(
        "blinds sherwood park",
        "North Glenora, Edmonton, AB",
        ["Edmonton, AB", "Sherwood Park, AB"],
      ),
    ).toBe("blinds north glenora edmonton");
  });
});

describe("normalizeSapKeywordWithPlaceSuffix", () => {
  it("strips place tokens then appends AdGroup entity", () => {
    expect(normalizeSapKeywordWithPlaceSuffix("accounting services Ritchie", "Ritchie, Edmonton, AB")).toBe(
      "accounting services ritchie edmonton",
    );
    expect(
      normalizeSapKeywordWithPlaceSuffix("tax preparation Ritchie, Edmonton", "Ritchie, Edmonton, AB"),
    ).toBe("tax preparation ritchie edmonton");
  });
});

describe("serviceKeywordForSapTitle", () => {
  it("strips entity place tokens for title agent input", () => {
    const entity = "Municipality of Rhineland, Altona, MB";
    const keyword = "window treatments municipality of rhineland altona";
    expect(serviceKeywordForSapTitle(keyword, entity)).toBe("window treatments");
  });

  it("template fallback does not duplicate entity in title", () => {
    const entity = "Municipality of Rhineland, Altona, MB";
    const keyword = "window treatments municipality of rhineland altona";
    const title = resolveEntitySapTitleFromTemplate(keyword, entity);
    expect(title).toBe("Window Treatments Near Municipality Of Rhineland, Altona");
    expect(title.toLowerCase().match(/municipality of rhineland/g)?.length).toBe(1);
  });
});
