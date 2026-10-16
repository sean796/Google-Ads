import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  countEligibleHeadingSections,
  countInternalLinksInHtmlContent,
  applyLinkTargetsPlanToHtml,
  applyLinkTargetsPlanToHtmlDeterministic,
  insertOneInternalLinkIntoHtml,
  type WordPressPost,
} from "../ensure-links-per-section";
import type { LinkTargetsPlan } from "@/lib/bulk/bulk-generation-wp-inventory";

vi.mock("@/lib/content-generation/ai-weave-section-internal-link", () => ({
  aiWeaveInternalLinkInSectionHtml: vi.fn(),
}));

import { aiWeaveInternalLinkInSectionHtml } from "../ai-weave-section-internal-link";

const SITE_URL = "https://example.com";

function post(
  id: number,
  slug: string,
  title: string,
  collection?: string,
): WordPressPost {
  return {
    id,
    slug,
    title,
    excerpt: "",
    link: `${SITE_URL}/${slug}/`,
    date_gmt: "2026-01-01T00:00:00",
    collection,
    postType: collection === "pages" ? "page" : "post",
  };
}

const INVENTORY: WordPressPost[] = [
  post(1, "blinds-installation", "Blinds Installation Guide", "posts"),
  post(2, "motorized-blinds", "Motorized Blinds Overview", "pages"),
  post(3, "window-shades", "Window Shades Options", "pages"),
  post(4, "custom-drapes", "Custom Drapes Service", "pages"),
  post(5, "shutter-repair", "Shutter Repair Tips", "posts"),
  post(6, "energy-efficient-blinds", "Energy Efficient Blinds", "posts"),
  post(7, "commercial-blinds", "Commercial Blinds Solutions", "pages"),
  post(8, "home-consultation", "Home Consultation Booking", "pages"),
  post(9, "solera-soft-shades", "Solera Soft Shades", "pages"),
  post(10, "roman-shade", "Roman Shade", "posts"),
];

function planForSections(
  entries: Array<{ section: string; slug: string; title: string; bucket?: "pages" | "posts" }>,
): LinkTargetsPlan {
  const pageTargets: LinkTargetsPlan["pageTargets"] = [];
  const blogTargets: LinkTargetsPlan["blogTargets"] = [];
  for (const entry of entries) {
    const target = {
      url: `${SITE_URL}/${entry.slug}/`,
      title: entry.title,
      query: entry.title,
      sectionHints: [entry.section],
      suggestedAnchor: entry.title,
    };
    if (entry.bucket === "posts") blogTargets.push(target);
    else pageTargets.push(target);
  }
  return { pageTargets, blogTargets };
}

function weaveMock(section: string, posts: Array<{ title: string; link: string }>): string {
  const pick = posts[0];
  if (!pick?.link) return section;
  if (section.includes(pick.link)) return section;
  return section.replace(
    /<\/p>/i,
    ` <a href="${pick.link}">${pick.title}</a></p>`,
  );
}

beforeEach(() => {
  vi.mocked(aiWeaveInternalLinkInSectionHtml).mockReset();
  vi.mocked(aiWeaveInternalLinkInSectionHtml).mockImplementation(async (section, posts) =>
    weaveMock(section, posts),
  );
});

describe("countEligibleHeadingSections", () => {
  it("counts body H2 and H3 headings but skips Overview and FAQ", () => {
    const html = [
      '<div class="flo-overview"><h2 id="overview">Overview</h2><p>Lead.</p></div>',
      '<h2 id="services">Our Services</h2><p>Body one.</p>',
      "<h3>Installation</h3><p>Body two.</p>",
      '<h2 id="benefits">Benefits</h2><p>Body three.</p>',
      '<div class="flo-faq"><h2 id="faq">FAQ</h2><table><thead><tr><th>Question</th><th>Answer</th></tr></thead></table></div>',
    ].join("");
    expect(countEligibleHeadingSections(html)).toBe(3);
  });
});

describe("applyLinkTargetsPlanToHtml", () => {
  it("weaves planned links per eligible section in one pass", async () => {
    const html = [
      "<h2>Service Area</h2><p>We cover the region with blinds installation support.</p>",
      "<h2>Product Range</h2><p>Many window shades options available.</p>",
    ].join("");

    const plan = planForSections([
      { section: "Service Area", slug: "blinds-installation", title: "Blinds Installation Guide", bucket: "posts" },
      { section: "Service Area", slug: "motorized-blinds", title: "Motorized Blinds Overview" },
      { section: "Product Range", slug: "window-shades", title: "Window Shades Options" },
      { section: "Product Range", slug: "custom-drapes", title: "Custom Drapes Service" },
    ]);

    const out = await applyLinkTargetsPlanToHtml({
      htmlContent: html,
      linkTargetsPlan: plan,
      wordPressPosts: INVENTORY,
      siteUrl: SITE_URL,
      apiKey: "test-key",
    });

    expect(out).toContain(`${SITE_URL}/blinds-installation/`);
    expect(out).toContain(`${SITE_URL}/window-shades/`);
    expect(countInternalLinksInHtmlContent(out, INVENTORY, SITE_URL)).toBeGreaterThanOrEqual(2);
    expect(aiWeaveInternalLinkInSectionHtml).toHaveBeenCalled();
  });

  it("does not inject internal links into Overview or FAQ blocks", async () => {
    const html = [
      '<div class="flo-overview"><h2 id="overview">Overview</h2><p>Intro only.</p></div>',
      "<h2>Body Topic</h2><p>Needs a blinds installation link woven naturally.</p>",
      '<div class="flo-faq"><h2 id="faq">FAQ</h2><p>Questions below.</p><table><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody><tr><td>Q</td><td>A</td></tr></tbody></table></div>',
    ].join("");

    const out = await applyLinkTargetsPlanToHtml({
      htmlContent: html,
      linkTargetsPlan: planForSections([
        { section: "Body Topic", slug: "blinds-installation", title: "Blinds Installation Guide", bucket: "posts" },
        { section: "Body Topic", slug: "motorized-blinds", title: "Motorized Blinds Overview" },
      ]),
      wordPressPosts: INVENTORY,
      siteUrl: SITE_URL,
      apiKey: "test-key",
    });

    const overviewBlock = out.match(/<div class="flo-overview">[\s\S]*?<\/div>/i)?.[0] ?? "";
    const faqBlock = out.match(/<div class="flo-faq">[\s\S]*$/i)?.[0] ?? "";
    expect(countInternalLinksInHtmlContent(overviewBlock, INVENTORY, SITE_URL)).toBe(0);
    expect(countInternalLinksInHtmlContent(faqBlock, INVENTORY, SITE_URL)).toBe(0);
    expect(countInternalLinksInHtmlContent(out, INVENTORY, SITE_URL)).toBeGreaterThanOrEqual(1);
  });

  it("uses Solera page from plan, not roman shade blog", async () => {
    const html =
      "<h2>Choosing Solera Soft Shades</h2><p>Solera Soft Shades offer layered light control for Alberta homes.</p>";

    const out = await applyLinkTargetsPlanToHtml({
      htmlContent: html,
      linkTargetsPlan: planForSections([
        { section: "Choosing Solera Soft Shades", slug: "solera-soft-shades", title: "Solera Soft Shades" },
        { section: "Choosing Solera Soft Shades", slug: "motorized-blinds", title: "Motorized Blinds Overview" },
      ]),
      wordPressPosts: INVENTORY,
      siteUrl: SITE_URL,
      apiKey: "test-key",
    });

    expect(out).toContain(`${SITE_URL}/solera-soft-shades/`);
    expect(out).not.toContain(`${SITE_URL}/roman-shade/`);
  });

  it("returns html unchanged when plan has no targets for a section", async () => {
    const html = "<h2>Unplanned Section</h2><p>Body copy.</p>";
    const out = await applyLinkTargetsPlanToHtml({
      htmlContent: html,
      linkTargetsPlan: planForSections([
        { section: "Other Section", slug: "window-shades", title: "Window Shades Options" },
      ]),
      wordPressPosts: INVENTORY,
      siteUrl: SITE_URL,
      apiKey: "test-key",
    });
    expect(out).toBe(html);
  });

  it("returns html unchanged when api key is missing", async () => {
    const html = "<h2>Body Topic</h2><p>Body copy.</p>";
    const out = await applyLinkTargetsPlanToHtml({
      htmlContent: html,
      linkTargetsPlan: planForSections([
        { section: "Body Topic", slug: "blinds-installation", title: "Blinds Installation Guide", bucket: "posts" },
      ]),
      wordPressPosts: INVENTORY,
      siteUrl: SITE_URL,
      apiKey: "",
    });
    expect(out).toBe(html);
  });
});

describe("applyLinkTargetsPlanToHtmlDeterministic", () => {
  it("weaves planned internal links in context and never appends Related reading or See tails", () => {
    const html =
      "<h2>Gear and Logistics</h2><p>Preparing for corporate event hosting retreats involves thoughtful logistics.</p><p>Teams also book custom adventure packages for outdoor retreats.</p>";

    const out = applyLinkTargetsPlanToHtmlDeterministic({
      htmlContent: html,
      linkTargetsPlan: planForSections([
        { section: "Gear and Logistics", slug: "event-hosting", title: "Event Hosting", bucket: "pages" },
        { section: "Gear and Logistics", slug: "custom-adventure", title: "Custom Adventure Packages", bucket: "pages" },
      ]),
      wordPressPosts: [
        ...INVENTORY,
        post(11, "event-hosting", "Event Hosting", "pages"),
        post(12, "custom-adventure", "Custom Adventure Packages", "pages"),
      ],
      siteUrl: SITE_URL,
    });

    const posts = [
      ...INVENTORY,
      post(11, "event-hosting", "Event Hosting", "pages"),
      post(12, "custom-adventure", "Custom Adventure Packages", "pages"),
    ];
    expect(countInternalLinksInHtmlContent(out, posts, SITE_URL)).toBe(2);
    expect(out).toContain('<a href="https://example.com/event-hosting/">event hosting</a>');
    expect(out).toContain('<a href="https://example.com/custom-adventure/">custom adventure packages</a>');
    expect(out).not.toMatch(/Related reading:/i);
    expect(out).not.toMatch(/See <a href=/i);
  });

  it("leaves section unchanged when planned links cannot be woven in context", () => {
    const html =
      "<h2>Gear and Logistics</h2><p>Preparing for corporate glamping retreats involves thoughtful logistics.</p>";

    const out = applyLinkTargetsPlanToHtmlDeterministic({
      htmlContent: html,
      linkTargetsPlan: planForSections([
        { section: "Gear and Logistics", slug: "event-hosting", title: "Event Hosting", bucket: "pages" },
      ]),
      wordPressPosts: [
        ...INVENTORY,
        post(11, "event-hosting", "Event Hosting", "pages"),
      ],
      siteUrl: SITE_URL,
    });

    expect(out).toBe(html);
    expect(out).not.toMatch(/Related reading:/i);
    expect(out).not.toMatch(/See <a href=/i);
  });
});

describe("insertOneInternalLinkIntoHtml", () => {
  it("weaves internal links in place instead of appending at paragraph end", () => {
    const html = "<h2>Services</h2><p>Ask about custom drapes for your living room.</p>";
    const out = insertOneInternalLinkIntoHtml(html, {
      title: "Custom Drapes Service",
      link: `${SITE_URL}/custom-drapes/`,
    });
    expect(out).toContain('<a href="https://example.com/custom-drapes/">custom drapes</a>');
    expect(out).not.toMatch(/living room\. <a href=/);
  });

  it("does not append a keyword link when the section has no matching title words", () => {
    const html = "<h2>A Local Homeowner Example</h2><p>Eleanor compares two shade brands for a home office.</p>";
    const out = insertOneInternalLinkIntoHtml(html, {
      title: "Hunter Douglas",
      link: `${SITE_URL}/hunter-douglas/`,
    });
    expect(out).toBe(html);
    expect(out).not.toMatch(/<\/p>.*<a href=/);
  });
});
