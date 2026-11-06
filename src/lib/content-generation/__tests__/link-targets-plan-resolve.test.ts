import { describe, expect, it } from "vitest";
import {
  buildLinkTargetsQueryUrlMap,
  matchInternalLinkQueriesFromPlan,
} from "@/lib/content-generation/link-targets-plan-resolve";
import type { LinkTargetsPlan } from "@/lib/bulk/bulk-generation-wp-inventory";

const PLAN: LinkTargetsPlan = {
  pageTargets: [
    {
      url: "https://blindmagic.com/operating-systems/powerview-automation/",
      title: "PowerView Automation",
      query: "PowerView Automation product service",
      sectionHints: [],
      suggestedAnchor: "PowerView Automation",
    },
    {
      url: "https://blindmagic.com/operating-systems/softtouch-motorization/",
      title: "SoftTouch Motorization",
      query: "SoftTouch Motorization product service",
      sectionHints: [],
      suggestedAnchor: "SoftTouch Motorization",
    },
  ],
  blogTargets: [],
};

describe("matchInternalLinkQueriesFromPlan", () => {
  it("maps exact plan queries to predetermined URLs without catalog re-match", () => {
    const out = matchInternalLinkQueriesFromPlan(
      [
        { id: "1", query: "PowerView Automation product service", anchor: "PowerView Automation" },
        { id: "2", query: "SoftTouch Motorization product service", anchor: "SoftTouch Motorization" },
      ],
      PLAN,
    );
    expect(out.get("1")).toBe("https://blindmagic.com/operating-systems/powerview-automation/");
    expect(out.get("2")).toBe("https://blindmagic.com/operating-systems/softtouch-motorization/");
  });

  it("does not resolve paraphrased queries", () => {
    const out = matchInternalLinkQueriesFromPlan(
      [{ id: "1", query: "PowerView motorization", anchor: "PowerView" }],
      PLAN,
    );
    expect(out.size).toBe(0);
  });

  it("buildLinkTargetsQueryUrlMap is case-insensitive on query", () => {
    const map = buildLinkTargetsQueryUrlMap(PLAN);
    expect(map.get("powerview automation product service")).toBe(
      "https://blindmagic.com/operating-systems/powerview-automation/",
    );
  });
});
