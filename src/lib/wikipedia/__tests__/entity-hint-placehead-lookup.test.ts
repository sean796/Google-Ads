import { describe, expect, it, vi, beforeEach } from "vitest";

const checkWikipediaPageExists = vi.fn();
const searchWikipediaPages = vi.fn();

vi.mock("../mediawiki-search", () => ({
  checkWikipediaPageExists: (...args: unknown[]) => checkWikipediaPageExists(...args),
  searchWikipediaPages: (...args: unknown[]) => searchWikipediaPages(...args),
}));

vi.mock("../../api", () => ({
  loadApiKey: () => "test-key",
}));

vi.mock("../filter-wikipedia-titles-for-community-entity-openrouter", () => ({
  filterWikipediaTitlesForCommunityEntity: async (args: { titles: string[] }) => args.titles,
}));

vi.mock("../entity-hint-openrouter", () => ({
  forcedPickFromList: async () => null,
  pickTitleFromCandidates: async () => null,
  proposeCanonicalArticleTitle: async () => null,
  suggestBroaderSearch: async () => ({}),
}));

vi.mock("../mediawiki-intro", () => ({
  fetchWikipediaIntroPlainText: async () => "Mill Woods is a neighbourhood in Edmonton.",
}));

vi.mock("../validate-wikipedia-place-page-openrouter", () => ({
  validateWikipediaPlacePage: async () => ({
    kind: "neighbourhood",
    matchesExpectedCity: true,
  }),
  isAcceptedWikiPlaceValidation: (
    result: { kind: string; matchesExpectedCity: boolean } | null | undefined,
    tier: string,
  ) =>
    Boolean(result?.matchesExpectedCity) &&
    (tier === "neighbourhood"
      ? result!.kind === "neighbourhood" || result!.kind === "district"
      : result!.kind === "city"),
}));

describe("lookupEntityHintWikipedia sub-city placeHead", () => {
  beforeEach(() => {
    checkWikipediaPageExists.mockReset();
    searchWikipediaPages.mockReset();
  });

  it("resolves bare neighbourhood title for Mill Woods before city fallback", async () => {
    checkWikipediaPageExists.mockImplementation(async (title: string) => {
      if (title === "Mill Woods") {
        return {
          exists: true,
          title: "Mill Woods",
          url: "https://en.wikipedia.org/wiki/Mill_Woods",
        };
      }
      if (title === "Edmonton") {
        return {
          exists: true,
          title: "Edmonton, Alberta",
          url: "https://en.wikipedia.org/wiki/Edmonton,_Alberta",
        };
      }
      return { exists: false };
    });
    searchWikipediaPages.mockResolvedValue([]);

    const { lookupEntityHintWikipedia } = await import("../entity-hint-lookup");
    const result = await lookupEntityHintWikipedia("Mill Woods, Edmonton, AB", { siteId: "s1" });

    expect(result).toEqual({
      kind: "closest",
      title: "Mill Woods",
      url: "https://en.wikipedia.org/wiki/Mill_Woods",
      searchedQuery: "Mill Woods, Edmonton, AB",
    });
    expect(checkWikipediaPageExists).toHaveBeenCalledWith("Mill Woods");
    expect(checkWikipediaPageExists).not.toHaveBeenCalledWith("Edmonton");
  });
});
