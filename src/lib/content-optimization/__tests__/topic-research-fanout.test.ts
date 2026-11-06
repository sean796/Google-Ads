import { describe, expect, it } from "vitest";
import {
  attachLocationToQfoQuery,
  attachLocationToQfoQueries,
  buildMandatoryVerificationItems,
  buildIllustrativeExampleResearchQuery,
  isEconomicVerificationClaim,
  buildProgramStatusResearchQuery,
  cityTokenFromLocation,
  ensureIllustrativeResearchQuery,
  ensureProgramStatusResearchQuery,
  filterBoilerplateResearchQueries,
  formatResearchAsOfLabel,
  isBoilerplateResearchQuery,
  isOfficialDomain,
  normalizeFactualVerificationPlan,
  normalizeFirstPartyClaims,
  normalizeIllustrativeExample,
  normalizeTopicResearchPlan,
  officialDomainsForLocation,
  pickOfficialOrganicResult,
  collectFirstPartyClaimSourceText,
  mergeFanoutIntoBrief,
  mergeVerificationPlanItems,
  TOPIC_RESEARCH_FANOUT_MAX_QUERIES,
  TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES,
  TOPIC_RESEARCH_PLAN_SYSTEM,
  TOPIC_RESEARCH_PLAN_TEMPERATURE,
  ILLUSTRATIVE_EXTRACT_SYSTEM,
} from "@/lib/content-optimization/topic-research-fanout";
import type { SeoContentBriefV1 } from "@/lib/overview-seo-content-brief";
import { resolveFanoutLocationForResearch } from "@/lib/llm-audit/resolve-site-location-label";

function emptyBrief(): SeoContentBriefV1 {
  return {
    version: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    focusKeyword: "blinds edmonton",
    pageUrl: "https://example.com/blinds",
    dataforseo: {
      seedKeyword: "blinds edmonton",
      organic: [],
      peopleAlsoAsk: [{ question: "existing paa", answers: [] }],
      peopleAlsoSearchPhrases: [],
      relatedSearches: ["existing related"],
      refinementChips: [],
      popularProducts: [],
    },
    gsc: { pageUrl: "https://example.com/blinds", queries: [] },
    semrush: {
      urlOrganicKeywords: [],
      phraseRelatedKeywords: [],
      urlOrganicUrls: [],
      phraseRelatedUrls: [],
      phraseOrganicUrls: [],
      externalSemrushUrls: [],
    },
  };
}

describe("attachLocationToQfoQuery", () => {
  it("appends the location label when the city is missing", () => {
    // Production appends only the city token, not the ", AB" province suffix.
    expect(attachLocationToQfoQuery("solar grants canada", "Edmonton, AB")).toBe(
      "solar grants canada Edmonton",
    );
    expect(cityTokenFromLocation("Edmonton, AB")).toBe("Edmonton");
  });

  it("leaves a query unchanged when it already names the city", () => {
    expect(
      attachLocationToQfoQuery("solar panel efficiency Edmonton, AB", "Edmonton, AB"),
    ).toBe("solar panel efficiency Edmonton, AB");
    expect(attachLocationToQfoQuery("Edmonton electricity rates solar payback", "Edmonton, AB")).toBe(
      "Edmonton electricity rates solar payback",
    );
  });

  it("leaves queries unchanged when the connected site has no city", () => {
    expect(attachLocationToQfoQuery("solar grants", "")).toBe("solar grants");
    expect(attachLocationToQfoQuery("solar grants", "   ")).toBe("solar grants");
    expect(attachLocationToQfoQueries(["solar grants"], "")).toEqual(["solar grants"]);
  });

  it("attaches city to every planner query", () => {
    expect(
      attachLocationToQfoQueries(
        ["solar panel efficiency", "how solar payback works", "net metering solar Edmonton, AB"],
        "Edmonton, AB",
      ),
    ).toEqual([
      "solar panel efficiency Edmonton",
      "how solar payback works Edmonton",
      "net metering solar Edmonton, AB",
    ]);
  });
});

describe("TOPIC_RESEARCH_PLAN_SYSTEM", () => {
  it("asks for 3-5 topic questions and forbids off-topic rebate slots", () => {
    expect(TOPIC_RESEARCH_PLAN_SYSTEM).toContain("3 to 5");
    expect(TOPIC_RESEARCH_PLAN_SYSTEM).toContain("natural question");
    expect(TOPIC_RESEARCH_PLAN_SYSTEM).toContain('"{seed keyword} {city}"');
    expect(TOPIC_RESEARCH_PLAN_SYSTEM).toContain("THIS Keyword and Title");
    expect(TOPIC_RESEARCH_PLAN_SYSTEM).toContain("topic-research question");
    expect(TOPIC_RESEARCH_PLAN_SYSTEM).toContain("different industry than Keyword");
    expect(TOPIC_RESEARCH_PLAN_SYSTEM).toContain("no mandatory program-status question");
    expect(TOPIC_RESEARCH_PLAN_SYSTEM).toContain("unless Keyword or Title is already about those");
    expect(TOPIC_RESEARCH_PLAN_SYSTEM).toContain("Where-to-shop questions");
    expect(TOPIC_RESEARCH_PLAN_SYSTEM).toContain("Research the topic, not the store");
    expect(TOPIC_RESEARCH_PLAN_SYSTEM).not.toContain("Include exactly one question that verifies current rebate");
    expect(TOPIC_RESEARCH_PLAN_SYSTEM).not.toMatch(/CEIP|Greener Homes|0\.30|kWh|Tax Class/i);
  });

  it("uses non-zero temperature for varied planner output", () => {
    expect(TOPIC_RESEARCH_PLAN_TEMPERATURE).toBeGreaterThan(0);
  });
});

describe("illustrative research query helpers", () => {
  it("formats research as-of month and year", () => {
    expect(formatResearchAsOfLabel(new Date("2026-08-15T12:00:00.000Z"))).toBe("August 2026");
  });

  it("builds illustrative query from connected location, not a hardcoded city", () => {
    const query = buildIllustrativeExampleResearchQuery({
      topic: "solar panel efficiency",
      location: "Calgary, AB",
      asOfLabel: "August 2026",
    });
    expect(query).toContain("Calgary, AB");
    expect(query).toContain("August 2026");
    expect(query).toContain("real-world example");
    expect(query).not.toContain("Edmonton");
    expect(query).not.toContain("homeowner");
  });

  it("normalizeIllustrativeExample uses a partial extract instead of dropping it", () => {
    const ex = normalizeIllustrativeExample(
      {
        leadIn: "Hypothetical scenario:",
        personaName: "Elena",
        householdProfile: "Old Naples homeowner concerned about humidity",
      },
      "September 2026",
    );
    expect(ex?.leadIn).toBe("Hypothetical scenario:");
    expect(ex?.quoteBody).toContain("Elena");
    expect(ex?.quoteBody).toContain("humidity");
  });

  it("normalizeIllustrativeExample returns structured brief field", () => {
    const ex = normalizeIllustrativeExample(
      {
        leadIn: "Hypothetical scenario:",
        personaName: "Morgan",
        householdProfile: "single parent with school-age kids",
        situationHook: "nursery blackout for early bedtimes",
        scenarioQuestion: "How does a single parent in St. Albert blackout a street-facing nursery?",
        scenarioNarrative:
          "Morgan lives in Lacombe Park with school-age kids and a nursery that faces the street. They need early bedtimes without sacrificing daytime light in the rest of the home.",
        recommendationTitle: "Blackout cellular shades with top-down bottom-up",
        recommendationParagraph:
          "Advance Blinds would quote cordless blackout cellulars with a top-down bottom-up rail so Morgan can darken the nursery at night while keeping privacy and filtered light during the day.",
      },
      "August 2026",
      "Choosing High-Efficiency Panels",
    );
    expect(ex?.leadIn).toBe("Hypothetical scenario:");
    expect(ex?.quoteBody).toContain("Morgan");
    expect(ex?.personaName).toBe("Morgan");
    expect(ex?.scenarioNarrative).toContain("Morgan");
    expect(ex?.recommendationParagraph).toContain("Advance Blinds");
    expect(ex?.asOf).toBe("August 2026");
    expect(ex?.illustrativeH2Title).toBe("Choosing High-Efficiency Panels");
  });

  it("prepends illustrative query when planner batch lacks one", () => {
    const { queries, illustrativeExampleQuery } = ensureIllustrativeResearchQuery(
      [
        "How do Calgary homeowners compare panel brands before install?",
        "What payback should I expect on a 10 kW system in Calgary, AB?",
      ],
      {
        keyword: "solar panel efficiency",
        title: "Solar Panel Efficiency Guide",
        location: "Calgary, AB",
        asOfLabel: "August 2026",
      },
    );
    expect(queries.length).toBeLessThanOrEqual(TOPIC_RESEARCH_FANOUT_MAX_QUERIES);
    expect(queries[0]).toBe(illustrativeExampleQuery);
    expect(illustrativeExampleQuery).toContain("real-world example");
  });

  it("extract system requires Answer/Keyword topic and omits window-covering few-shots", () => {
    expect(ILLUSTRATIVE_EXTRACT_SYSTEM).toContain("ARTICLE ANSWER");
    expect(ILLUSTRATIVE_EXTRACT_SYSTEM).toContain("different industry");
    expect(ILLUSTRATIVE_EXTRACT_SYSTEM).toContain("SITE-FIRST");
    expect(ILLUSTRATIVE_EXTRACT_SYSTEM).toContain("would recommend");
    expect(ILLUSTRATIVE_EXTRACT_SYSTEM).toContain("significant long-term savings");
    expect(ILLUSTRATIVE_EXTRACT_SYSTEM).toContain("may / can / when");
    expect(ILLUSTRATIVE_EXTRACT_SYSTEM).toContain("Hunter Douglas, Alta, Duette");
    expect(ILLUSTRATIVE_EXTRACT_SYSTEM).not.toMatch(/blinds|shades|glare|nursery/i);
  });

  it("dedupes when planner already returned an illustrative query", () => {
    const existing =
      "What is a realistic real-world example of solar for a homeowner in Calgary, AB as of August 2026?";
    const { queries, illustrativeExampleQuery } = ensureIllustrativeResearchQuery([existing], {
      keyword: "solar",
      location: "Calgary, AB",
      asOfLabel: "August 2026",
    });
    expect(queries).toHaveLength(1);
    expect(illustrativeExampleQuery).toBe(existing);
  });
});

describe("program status research query helpers", () => {
  it("builds program status query from connected location", () => {
    const query = buildProgramStatusResearchQuery({
      topic: "solar power",
      location: "Calgary, AB",
      asOfLabel: "August 2026",
    });
    expect(query).toContain("Calgary, AB");
    expect(query).toContain("August 2026");
    expect(query).toContain("still open");
    expect(query).not.toContain("Edmonton");
  });

  it("inserts program status as second query after illustrative within cap", () => {
    const planner = [
      "How do Calgary homeowners compare panel brands before install?",
      "What payback should I expect on a 10 kW system in Calgary, AB?",
      "Which Alberta incentives apply to solar in Calgary?",
      "How long does solar install take in Calgary winters?",
    ];
    const { queries: withIll, illustrativeExampleQuery } = ensureIllustrativeResearchQuery(
      planner,
      {
        keyword: "solar power",
        title: "Solar Power Guide",
        location: "Calgary, AB",
        asOfLabel: "August 2026",
      },
    );
    const { queries: final, programStatusQuery } = ensureProgramStatusResearchQuery(withIll, {
      keyword: "solar power",
      title: "Solar Power Guide",
      location: "Calgary, AB",
      asOfLabel: "August 2026",
    });
    expect(final.length).toBeLessThanOrEqual(TOPIC_RESEARCH_FANOUT_MAX_QUERIES);
    expect(final[0]).toBe(illustrativeExampleQuery);
    expect(final[1]).toBe(programStatusQuery);
  });

  it("dedupes when planner already returned a program status query", () => {
    const existing =
      "Are solar rebates in Calgary, AB still open to new applications as of August 2026?";
    const { queries, programStatusQuery } = ensureProgramStatusResearchQuery([existing], {
      keyword: "solar",
      location: "Calgary, AB",
      asOfLabel: "August 2026",
    });
    expect(queries).toHaveLength(1);
    expect(programStatusQuery).toBe(existing);
  });
});

describe("isBoilerplateResearchQuery", () => {
  const base = {
    keyword: "solar panel efficiency",
    companyName: "Ridgeline Solar",
    location: "Edmonton, AB",
  };

  it("flags keyword+city template strings", () => {
    expect(isBoilerplateResearchQuery("solar panel efficiency Edmonton", base)).toBe(true);
    expect(isBoilerplateResearchQuery("solar panel efficiency Edmonton financing", base)).toBe(
      true,
    );
    expect(isBoilerplateResearchQuery("Ridgeline Solar Edmonton financing", base)).toBe(true);
  });

  it("keeps natural buyer questions", () => {
    expect(
      isBoilerplateResearchQuery(
        "How long do solar panels stay efficient in Edmonton winters?",
        base,
      ),
    ).toBe(false);
    expect(
      isBoilerplateResearchQuery(
        "What payback should I expect on a 10 kW system in Edmonton, AB?",
        base,
      ),
    ).toBe(false);
  });

  it("filters boilerplate queries out of a planner batch", () => {
    expect(
      filterBoilerplateResearchQueries(
        [
          "solar panel efficiency Edmonton",
          "How do Edmonton homeowners compare panel brands before install?",
        ],
        base,
      ),
    ).toEqual(["How do Edmonton homeowners compare panel brands before install?"]);
  });
});

describe("normalizeTopicResearchPlan", () => {
  it("throws on empty queries", () => {
    expect(() => normalizeTopicResearchPlan({ researchQueries: [], namedPrograms: [] })).toThrow(
      /no research queries/i,
    );
  });

  it("caps queries at the fan-out max and keeps exact program names", () => {
    const plan = normalizeTopicResearchPlan({
      researchQueries: ["a", "b", "c", "d", "e", "f"],
      namedPrograms: ["I See IP", "I See IP", ""],
    });
    expect(plan.researchQueries).toHaveLength(TOPIC_RESEARCH_FANOUT_MAX_QUERIES);
    expect(plan.namedPrograms).toEqual(["I See IP"]);
  });

  it("throws on invalid JSON shape", () => {
    expect(() => normalizeTopicResearchPlan(null)).toThrow(/invalid JSON/i);
  });
});

describe("normalizeFirstPartyClaims", () => {
  it("keeps sourced claims and drops empty rows", () => {
    const claims = normalizeFirstPartyClaims({
      claims: [
        { text: "We have years of experience installing blinds.", source: "chatgpt" },
        { text: "", source: "swot" },
        { text: "Named program I See IP.", source: "chatgpt" },
      ],
    });
    expect(claims).toHaveLength(2);
    expect(claims[0].source).toBe("chatgpt");
  });

  it("throws when claims array is missing", () => {
    expect(() => normalizeFirstPartyClaims({})).toThrow(/claims array/i);
  });
});

describe("collectFirstPartyClaimSourceText", () => {
  it("returns empty when all sources are empty", () => {
    expect(collectFirstPartyClaimSourceText({ chatGptTexts: ["", "  "], swotText: " " })).toBe("");
  });

  it("pins claims to the connected site", () => {
    const text = collectFirstPartyClaimSourceText({
      chatGptTexts: ["Ridgeline Roofing HQ is 1710 E 32nd St, Joplin, MO."],
      siteUrl: "https://ridgelinesolar.ca/",
      location: "Edmonton, AB",
    });
    expect(text).toContain("CONNECTED_SITE:");
    expect(text).toContain("https://ridgelinesolar.ca/");
    expect(text).toContain("Edmonton, AB");
  });
});

describe("extractFirstPartyClaims", () => {
  it("returns no claims when sources are empty", async () => {
    const { extractFirstPartyClaims } = await import("@/lib/content-optimization/topic-research-fanout");
    await expect(extractFirstPartyClaims({ chatGptTexts: [] })).resolves.toEqual([]);
  });
});

describe("mergeFanoutIntoBrief", () => {
  it("stores fan-out and merges new PAA without duplicating", () => {
    const merged = mergeFanoutIntoBrief(
      emptyBrief(),
      {
        queries: ["i see ip edmonton"],
        namedPrograms: ["I See IP"],
        serpByQuery: [
          {
            query: "i see ip edmonton",
            organicTop: [{ title: "Official I See IP", domain: "alberta.ca" }],
            organicTitles: ["Official I See IP"],
            paa: ["existing paa", "What is I See IP?"],
          },
        ],
        chatGptByQuery: [{ query: "I See IP", responseText: "Official program details." }],
      },
      [{ text: "We offer I See IP.", source: "chatgpt" }],
    );
    expect(merged.queryFanout?.namedPrograms).toEqual(["I See IP"]);
    expect(merged.firstPartyClaims?.[0].text).toContain("I See IP");
    expect(merged.dataforseo.peopleAlsoAsk.map((p) => p.question)).toEqual([
      "existing paa",
      "What is I See IP?",
    ]);
    expect(merged.dataforseo.relatedSearches).toContain("Official I See IP");
  });
});

describe("factual verification helpers", () => {
  it("caps verification plan at TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES", () => {
    expect(TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES).toBe(18);
    const plan = normalizeFactualVerificationPlan({
      verifications: Array.from({ length: 20 }, (_, i) => ({
        claimLabel: `claim-${i}`,
        verificationQuery: `q${i}`,
        preferDomains: ["canada.ca"],
      })),
    });
    expect(plan).toHaveLength(18);
  });

  it("mergeVerificationPlanItems prioritizes page plan over mandatory over planner", () => {
    const merged = mergeVerificationPlanItems(
      [{ claimLabel: "Page excerpt cost band", verificationQuery: "page-q", preferDomains: [] }],
      [{ claimLabel: "Mandatory rebate status", verificationQuery: "mand-q", preferDomains: [] }],
      [{ claimLabel: "Planner generic", verificationQuery: "plan-q", preferDomains: [] }],
    );
    expect(merged[0]?.claimLabel).toBe("Page excerpt cost band");
    expect(merged[1]?.claimLabel).toBe("Mandatory rebate status");
    expect(merged[2]?.claimLabel).toBe("Planner generic");
  });

  it("buildMandatoryVerificationItems includes install/payback/rate/permit templates for Alberta solar", () => {
    const items = buildMandatoryVerificationItems({
      keyword: "solar panel efficiency",
      location: "Edmonton, AB",
      researchAsOf: "August 2026",
      pageExcerpt:
        "Alberta homeowners benefit from 2,300 hours of sunshine, CAD $15,000–$30,000 installs, 5–10 year payback, 3–4% property value increase, 800 kWh/month, 12.5¢/kWh, 1.2 m roofline, and Edmonton permit requirements.",
    });
    expect(items.some((i) => /rebate|incentive/i.test(i.claimLabel))).toBe(true);
    expect(items.some((i) => /Solar Club|export rate/i.test(i.claimLabel))).toBe(true);
    expect(items.some((i) => /install cost band/i.test(i.claimLabel))).toBe(true);
    expect(items.some((i) => /payback/i.test(i.claimLabel))).toBe(true);
    expect(items.some((i) => /electricity rate/i.test(i.claimLabel))).toBe(true);
    expect(items.some((i) => /property-value|resale/i.test(i.claimLabel))).toBe(true);
    expect(items.some((i) => /kwh|usage/i.test(i.claimLabel))).toBe(true);
    expect(items.some((i) => /roofline|setback/i.test(i.claimLabel))).toBe(true);
    expect(items.some((i) => /Edmonton solar permit/i.test(i.claimLabel))).toBe(true);
  });

  it("isEconomicVerificationClaim identifies cost/payback/rate but not rebate status", () => {
    expect(isEconomicVerificationClaim("Residential solar install cost band")).toBe(true);
    expect(isEconomicVerificationClaim("Solar payback period horizon")).toBe(true);
    expect(isEconomicVerificationClaim("Provincial solar rebate program status")).toBe(false);
  });

  it("includes Alberta official domains for Edmonton AB", () => {
    const domains = officialDomainsForLocation("Edmonton, AB");
    expect(domains).toContain("canada.ca");
    expect(domains).toContain("alberta.ca");
  });

  it("pickOfficialOrganicResult prefers gov domains", () => {
    const picked = pickOfficialOrganicResult(
      [
        { domain: "installer-blog.com", url: "https://installer-blog.com/solar", title: "Blog" },
        {
          domain: "www.alberta.ca",
          url: "https://www.alberta.ca/solar-rebate",
          title: "Alberta Solar",
        },
      ],
      ["alberta.ca"],
      "Edmonton, AB",
    );
    expect(picked?.domain).toContain("alberta.ca");
  });

  it("isOfficialDomain matches canada.ca and provincial suffixes", () => {
    expect(isOfficialDomain("www.canada.ca", [], "Edmonton, AB")).toBe(true);
    expect(isOfficialDomain("efficiencyalberta.ca", [], "Edmonton, AB")).toBe(true);
    expect(isOfficialDomain("random-installer.com", [], "Edmonton, AB")).toBe(false);
  });
});
