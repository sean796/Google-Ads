import { describe, expect, it } from "vitest";
import {
  formatLinkTargetsPlanForSection,
  formatLinkTargetsPlanPrompt,
  type LinkTargetsPlan,
} from "@/lib/bulk/bulk-generation-wp-inventory";

describe("link targets plan formatting", () => {
  const plan: LinkTargetsPlan = {
    pageTargets: [
      {
        url: "https://example.com/services/tent-rental/",
        title: "Tent Rental Services",
        query: "tent rental services",
        sectionHints: ["Tent Permit Approval Timelines"],
        suggestedAnchor: "tent rental services",
      },
      {
        url: "https://example.com/contact/",
        title: "Contact",
        query: "quote request contact",
        sectionHints: ["Tent Permit Approval Timelines"],
        suggestedAnchor: "quote request",
      },
    ],
    blogTargets: [
      {
        url: "https://example.com/blog/permits/",
        title: "Permit Guide",
        query: "permit approval guide",
        sectionHints: ["Tent Permit Approval Timelines"],
        suggestedAnchor: "permit guide",
      },
    ],
  };

  it("formatLinkTargetsPlanForSection lists each assigned query for the H2", () => {
    const block = formatLinkTargetsPlanForSection(plan, "Tent Permit Approval Timelines");
    expect(block).toContain("THIS SECTION LINK ASSIGNMENTS");
    expect(block).toContain("tent rental services");
    expect(block).toContain("quote request contact");
    expect(block).toContain("permit approval guide");
    expect(block).toContain("genuinely fits");
    expect(block).not.toContain("non-negotiable");
  });

  it("formatLinkTargetsPlanPrompt includes per-section summary", () => {
    const block = formatLinkTargetsPlanPrompt(plan);
    expect(block).toContain("Per-section assigned link queries");
    expect(block).toContain("Tent Permit Approval Timelines");
    expect(block).not.toContain("2-5");
  });
});
