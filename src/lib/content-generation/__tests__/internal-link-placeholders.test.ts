import { describe, expect, it, beforeEach } from "vitest";
import {
  resolveInternalLinkPlaceholdersInHtml,
  resolveInternalLinkPlaceholdersInMarkdown,
  INTERNAL_LINK_PLACEHOLDER_RE,
  INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK,
  INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX,
  normalizeMalformedHarnessLinkPlaceholders,
} from "../internal-link-placeholders";
import type { InternalLinkQuery } from "../internal-link-intent-match";
import { setSiteCacheForTest, clearSiteCache } from "@/lib/wordpress-site-cache";

const SITE_ID = "placeholder-test-site";
const SITE_URL = "https://kwbllp.com";

const POSTS = [
  {
    id: 1,
    slug: "employment-expenses-checklist-canada",
    title: "Employment Expenses Checklist Canada",
    excerpt: "Checklist for employment expenses",
    link: "https://kwbllp.com/blog/employment-expenses-checklist-canada/",
    date_gmt: "2026-01-01",
  },
  {
    id: 2,
    slug: "alberta-productivity-grant",
    title: "Alberta Productivity Grant How To Apply",
    excerpt: "Grant program overview",
    link: "https://kwbllp.com/blog/alberta-productivity-grant/",
    date_gmt: "2026-01-02",
  },
  {
    id: 3,
    slug: "deductible-employment-expenses",
    title: "Deductible Employment Expenses Overview",
    excerpt: "employment expenses overview",
    link: "https://kwbllp.com/blog/deductible-employment-expenses/",
    date_gmt: "2026-01-03",
  },
];

function matchByQuery(map: Record<string, string>) {
  return async (queries: InternalLinkQuery[]) => {
    const out = new Map<string, string>();
    const used = new Set<string>();
    for (const q of queries) {
      const url = map[q.query];
      if (!url || used.has(url)) continue;
      used.add(url);
      out.set(q.id, url);
    }
    return out;
  };
}

function matchInOrder(urls: string[]) {
  return async (queries: InternalLinkQuery[]) => {
    const out = new Map<string, string>();
    queries.forEach((q, i) => {
      if (urls[i]) out.set(q.id, urls[i]!);
    });
    return out;
  };
}

describe("INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK", () => {
  it("routes brand terms to pages and info keywords to blogs without named brands", () => {
    expect(INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK).toContain("Brand, product, service");
    expect(INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK).toContain("Informational keywords");
    expect(INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK).toContain("If the same brand or product name appears in both");
    expect(INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK).toContain("INTERNAL LINKS PER SECTION");
    expect(INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK).toContain("up to about **5**");
    expect(INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK).not.toContain("at least 2 [[LINK:");
    expect(INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX).toContain("where a relevant internal target exists");
    expect(INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK).toContain("table cells");
    expect(INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK).toContain("[text](https://...)");
    expect(INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK).toContain(". durable window coverings");
    expect(INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK).not.toMatch(/\bEnergy Efficiency\b/);
  });
});

describe("INTERNAL_LINK_PLACEHOLDER_RE", () => {
  it("matches multiple tokens", () => {
    const text =
      "See [[LINK:employment expenses|expense rules]] and [[LINK:Alberta productivity grant|productivity grant]].";
    const matches = [...text.matchAll(INTERNAL_LINK_PLACEHOLDER_RE)];
    expect(matches).toHaveLength(2);
  });
});

describe("normalizeMalformedHarnessLinkPlaceholders", () => {
  it("rewrites {{LINK:query|anchor}} to [[LINK:query|anchor]]", () => {
    const raw = "See {{LINK:cellular shades St Albert|cellular shades}} for options.";
    expect(normalizeMalformedHarnessLinkPlaceholders(raw)).toBe(
      "See [[LINK:cellular shades St Albert|cellular shades]] for options.",
    );
  });
});

describe("resolveInternalLinkPlaceholdersInHtml", () => {
  beforeEach(() => {
    clearSiteCache(SITE_ID);
    setSiteCacheForTest(SITE_ID, SITE_URL, POSTS);
  });

  it("resolves placeholder via intent match against the sitemap catalog", async () => {
    const html =
      "<p>Review [[LINK:employment expenses checklist|employment expense rules]] before filing.</p>";
    const out = await resolveInternalLinkPlaceholdersInHtml(html, {
      siteId: SITE_ID,
      siteUrl: SITE_URL,
      wordPressPosts: POSTS,
      matchQueriesToUrls: matchByQuery({
        "employment expenses checklist": POSTS[0]!.link,
      }),
    });
    expect(out).toContain(
      '<a href="https://kwbllp.com/blog/employment-expenses-checklist-canada/">employment expense rules</a>',
    );
    expect(out).not.toContain("[[LINK:");
    expect(out).toContain("Review ");
    expect(out).toContain(" before filing.");
  });

  it("resolves malformed {{LINK:...}} tokens after normalization", async () => {
    const html =
      "<p>For example, {{LINK:Alberta productivity grant|productivity grant}} offer benefits.</p>";
    const out = await resolveInternalLinkPlaceholdersInHtml(html, {
      siteId: SITE_ID,
      siteUrl: SITE_URL,
      wordPressPosts: POSTS,
      matchQueriesToUrls: matchByQuery({
        "Alberta productivity grant": POSTS[1]!.link,
      }),
    });
    expect(out).toContain("<a href=");
    expect(out).not.toContain("{{LINK:");
    expect(out).not.toContain("[[LINK:");
  });

  it("skips the current page and uses the next catalog match", async () => {
    const html = "<p>See [[LINK:employment expenses|expense guide]].</p>";
    const out = await resolveInternalLinkPlaceholdersInHtml(html, {
      siteId: SITE_ID,
      siteUrl: SITE_URL,
      currentPageUrl: "https://kwbllp.com/blog/employment-expenses-checklist-canada/",
      wordPressPosts: POSTS,
      matchQueriesToUrls: matchByQuery({
        "employment expenses": POSTS[2]!.link,
      }),
    });
    expect(out).not.toContain("employment-expenses-checklist-canada");
    expect(out).not.toContain("[[LINK:");
    expect(out).toContain("deductible-employment-expenses");
  });

  it("leaves anchor text when a slot has no catalog match", async () => {
    const html = "<p>Topic [[LINK:nonexistent xyzzy page|related topic]] here.</p>";
    const out = await resolveInternalLinkPlaceholdersInHtml(html, {
      siteId: SITE_ID,
      siteUrl: SITE_URL,
      wordPressPosts: POSTS,
      matchQueriesToUrls: async () => new Map(),
    });
    expect(out).toContain("related topic");
    expect(out).not.toContain("[[LINK:");
  });

  it("leaves Overview hash links untouched", async () => {
    const html =
      '<div class="flo-overview"><a href="#section-one">cost factors</a></div><p>[[LINK:Alberta productivity|productivity grant]]</p>';
    const out = await resolveInternalLinkPlaceholdersInHtml(html, {
      siteId: SITE_ID,
      siteUrl: SITE_URL,
      wordPressPosts: POSTS,
      matchQueriesToUrls: matchByQuery({
        "Alberta productivity": POSTS[1]!.link,
      }),
    });
    expect(out).toContain('href="#section-one"');
    expect(out).toContain("alberta-productivity-grant");
  });

  it("matches using query plus anchor intent, not an exact title", async () => {
    const html = "<p>See [[LINK:nonexistent xyzzy page|Alberta productivity grant]] for details.</p>";
    const out = await resolveInternalLinkPlaceholdersInHtml(html, {
      siteId: SITE_ID,
      siteUrl: SITE_URL,
      wordPressPosts: POSTS,
      matchQueriesToUrls: matchByQuery({
        "nonexistent xyzzy page": POSTS[1]!.link,
      }),
    });
    expect(out).toContain(
      '<a href="https://kwbllp.com/blog/alberta-productivity-grant/">Alberta productivity grant</a>',
    );
    expect(out).not.toContain("[[LINK:");
  });

  it("gives two slots with the same query two different catalog URLs", async () => {
    const html =
      "<p>[[LINK:employment expenses|expense guide]] and [[LINK:employment expenses|expense overview]].</p>";
    const out = await resolveInternalLinkPlaceholdersInHtml(html, {
      siteId: SITE_ID,
      siteUrl: SITE_URL,
      wordPressPosts: POSTS,
      matchQueriesToUrls: matchInOrder([POSTS[0]!.link, POSTS[2]!.link]),
    });
    expect(out).toContain("employment-expenses-checklist-canada");
    expect(out).toContain("deductible-employment-expenses");
    expect(out).not.toContain("[[LINK:");
  });

  it("never resolves to a service-area URL when pages and blogs are available", async () => {
    const mixed = [
      {
        id: 10,
        slug: "charleston",
        title: "Charleston Service Area",
        excerpt: "City landing",
        link: "https://lindseyblindsetc.com/service-area/charleston/",
        date_gmt: "2026-01-01",
        collection: "sap",
        postType: "service-area" as const,
      },
      {
        id: 11,
        slug: "hunter-douglas",
        title: "Hunter Douglas",
        excerpt: "Main product page",
        link: "https://lindseyblindsetc.com/hunter-douglas/",
        date_gmt: "2026-01-01",
        collection: "pages",
        postType: "page" as const,
      },
      {
        id: 12,
        slug: "powerview-guide",
        title: "PowerView Guide",
        excerpt: "Blog post",
        link: "https://lindseyblindsetc.com/blog/powerview-guide/",
        date_gmt: "2026-01-01",
        collection: "posts",
        postType: "post" as const,
      },
    ];
    const html =
      "<p>See [[LINK:Hunter Douglas|Hunter Douglas shades]] plus [[LINK:PowerView Guide|PowerView]].</p>";
    const out = await resolveInternalLinkPlaceholdersInHtml(html, {
      siteId: SITE_ID,
      siteUrl: "https://lindseyblindsetc.com",
      wordPressPosts: mixed,
      matchQueriesToUrls: matchByQuery({
        "Hunter Douglas": "https://lindseyblindsetc.com/hunter-douglas/",
        "PowerView Guide": "https://lindseyblindsetc.com/blog/powerview-guide/",
      }),
    });
    expect(out).not.toContain("/service-area/");
    expect(out).toContain('href="https://lindseyblindsetc.com/hunter-douglas/"');
    expect(out).toContain('href="https://lindseyblindsetc.com/blog/powerview-guide/"');
  });

  it("resolves an exact service-area page title inside a blockquote", async () => {
    const mixed = [
      {
        id: 10,
        slug: "park-shore",
        title: "Park Shore Window Treatments",
        excerpt: "City landing",
        link: "https://lindseyblindsetc.com/service-area/park-shore/",
        date_gmt: "2026-01-01",
        collection: "sap",
        postType: "service-area" as const,
      },
      {
        id: 11,
        slug: "hunter-douglas",
        title: "Hunter Douglas",
        excerpt: "Main product page",
        link: "https://lindseyblindsetc.com/hunter-douglas/",
        date_gmt: "2026-01-01",
        collection: "pages",
        postType: "page" as const,
      },
    ];
    const html =
      "<blockquote><p>Eleanor is redecorating her [[LINK:Park Shore Window Treatments|Park Shore]] condo.</p></blockquote>";
    const out = await resolveInternalLinkPlaceholdersInHtml(html, {
      siteUrl: "https://lindseyblindsetc.com",
      wordPressPosts: mixed,
      matchQueriesToUrls: async () => new Map(),
    });
    expect(out).toContain('href="https://lindseyblindsetc.com/service-area/park-shore/"');
    expect(out).toContain(">Park Shore<");
    expect(out).not.toContain("[[LINK:");
  });

  it("maps Hunter Douglas and Energy Efficiency to page-sitemap URLs", async () => {
    const pages = [
      {
        id: 21,
        slug: "hunter-douglas",
        title: "Hunter Douglas",
        excerpt: "",
        link: "https://lindseyblindsetc.com/hunter-douglas/",
        date_gmt: "2026-09-01",
        collection: "pages",
      },
      {
        id: 22,
        slug: "energy-efficiency",
        title: "Energy Efficiency",
        excerpt: "",
        link: "https://lindseyblindsetc.com/technology/energy-efficiency/",
        date_gmt: "2026-09-01",
        collection: "pages",
      },
    ];
    const html =
      "<p>Compare [[LINK:Hunter Douglas|Hunter Douglas]] with Alta and review [[LINK:Energy Efficiency|energy efficiency]] options.</p>";
    const out = await resolveInternalLinkPlaceholdersInHtml(html, {
      siteUrl: "https://lindseyblindsetc.com",
      wordPressPosts: pages,
      matchQueriesToUrls: matchByQuery({
        "Hunter Douglas": "https://lindseyblindsetc.com/hunter-douglas/",
        "Energy Efficiency": "https://lindseyblindsetc.com/technology/energy-efficiency/",
      }),
    });
    expect(out).toContain('href="https://lindseyblindsetc.com/hunter-douglas/"');
    expect(out).toContain('href="https://lindseyblindsetc.com/technology/energy-efficiency/"');
    expect(out).not.toContain("[[LINK:");
  });

  it("ignores service-area cache hits when the provided list is empty", async () => {
    clearSiteCache(SITE_ID);
    setSiteCacheForTest(SITE_ID, "https://lindseyblindsetc.com", [
      {
        id: 10,
        slug: "charleston",
        title: "Charleston Service Area",
        excerpt: "City landing",
        link: "https://lindseyblindsetc.com/service-area/charleston/",
        date_gmt: "2026-01-01",
        postType: "service-area",
      },
      {
        id: 11,
        slug: "hunter-douglas",
        title: "Hunter Douglas",
        excerpt: "Main product page",
        link: "https://lindseyblindsetc.com/hunter-douglas/",
        date_gmt: "2026-01-01",
        postType: "page",
      },
    ]);
    const html = "<p>See [[LINK:Hunter Douglas|Hunter Douglas shades]] here.</p>";
    const out = await resolveInternalLinkPlaceholdersInHtml(html, {
      siteId: SITE_ID,
      siteUrl: "https://lindseyblindsetc.com",
      matchQueriesToUrls: matchByQuery({
        "Hunter Douglas": "https://lindseyblindsetc.com/hunter-douglas/",
      }),
    });
    expect(out).not.toContain("/service-area/");
    expect(out).toContain('href="https://lindseyblindsetc.com/hunter-douglas/"');
    expect(out).not.toContain("[[LINK:");
  });

  it("uses link targets plan deterministically without catalog re-match", async () => {
    const html =
      '<p>We install [[LINK:PowerView Automation product service|PowerView Automation]] for clients.</p>';
    const out = await resolveInternalLinkPlaceholdersInHtml(html, {
      siteId: SITE_ID,
      siteUrl: "https://blindmagic.com",
      linkTargetsPlan: {
        pageTargets: [
          {
            url: "https://blindmagic.com/operating-systems/powerview-automation/",
            title: "PowerView Automation",
            query: "PowerView Automation product service",
            suggestedAnchor: "PowerView Automation",
            sectionHints: [],
          },
        ],
        blogTargets: [],
      },
    });
    expect(out).toContain('href="https://blindmagic.com/operating-systems/powerview-automation/"');
    expect(out).not.toContain("softtouch");
  });
});

describe("resolveInternalLinkPlaceholdersInMarkdown", () => {
  beforeEach(() => {
    clearSiteCache(SITE_ID);
    setSiteCacheForTest(SITE_ID, SITE_URL, POSTS);
  });

  it("resolves to markdown link syntax", async () => {
    const md = "Read [[LINK:Alberta productivity grant|productivity grant guide]] for details.";
    const out = await resolveInternalLinkPlaceholdersInMarkdown(md, {
      siteId: SITE_ID,
      siteUrl: SITE_URL,
      wordPressPosts: POSTS,
      matchQueriesToUrls: matchByQuery({
        "Alberta productivity grant": POSTS[1]!.link,
      }),
    });
    expect(out).toContain(
      "[productivity grant guide](https://kwbllp.com/blog/alberta-productivity-grant/)",
    );
    expect(out).not.toContain("[[LINK:");
  });
});
