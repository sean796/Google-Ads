import { describe, expect, it } from "vitest";
import type { GscTop10CsvRow } from "@/lib/vertical-benchmark/vertical-benchmark-types";
import {
  clampBenchmarkBlogCount,
  keywordFromPeerGscUrl,
  pickBestPeerGscPages,
  uniquePeerKeywordKey,
} from "@/lib/vertical-benchmark/vertical-benchmark-peer-gsc";

function row(partial: Partial<GscTop10CsvRow> & Pick<GscTop10CsvRow, "site_id" | "url" | "clicks">): GscTop10CsvRow {
  return {
    site_name: partial.site_id,
    site_url: `https://${partial.site_id}.com`,
    client_tag: "Blind",
    content_kind: "post",
    rank: 1,
    impressions: partial.impressions ?? 100,
    position: 3,
    gsc_start_date: "2026-01-01",
    gsc_end_date: "2026-03-31",
    ...partial,
  };
}

describe("clampBenchmarkBlogCount", () => {
  it("clamps to 0–50", () => {
    expect(clampBenchmarkBlogCount(10)).toBe(10);
    expect(clampBenchmarkBlogCount(0)).toBe(0);
    expect(clampBenchmarkBlogCount(-5)).toBe(0);
    expect(clampBenchmarkBlogCount(99)).toBe(50);
  });
});

describe("pickBestPeerGscPages", () => {
  it("returns exactly N best peer URLs and skips the target site", () => {
    const pages = pickBestPeerGscPages({
      targetSiteId: "lindsey",
      count: 10,
      rows: [
        row({ site_id: "lindsey", url: "https://lindsey.com/own", clicks: 999 }),
        row({ site_id: "advance", url: "https://advance.com/a", clicks: 80 }),
        row({ site_id: "magic", url: "https://magic.com/b", clicks: 200 }),
        row({ site_id: "west", url: "https://west.com/c", clicks: 150 }),
        row({ site_id: "magic", url: "https://magic.com/b/", clicks: 40 }),
        ...Array.from({ length: 12 }, (_, i) =>
          row({ site_id: "dm", url: `https://dm.com/p-${i}`, clicks: 10 - i }),
        ),
      ],
    });
    expect(pages).toHaveLength(10);
    expect(pages[0]?.url).toBe("https://magic.com/b");
    expect(pages[1]?.url).toBe("https://west.com/c");
    expect(pages[2]?.url).toBe("https://advance.com/a");
    expect(pages.every((p) => !p.url.includes("lindsey.com"))).toBe(true);
  });

  it("does not pick a second URL with the same keyword", () => {
    const pages = pickBestPeerGscPages({
      targetSiteId: "lindsey",
      count: 3,
      rows: [
        row({ site_id: "magic", url: "https://magic.com/how-to-safely-remove-blinds", clicks: 200 }),
        row({ site_id: "west", url: "https://west.com/safely-remove-blinds-diy-steps", clicks: 150 }),
        row({ site_id: "advance", url: "https://advance.com/diy-blind-removal", clicks: 120 }),
        row({ site_id: "dm", url: "https://dm.com/roman-shades", clicks: 80 }),
        row({ site_id: "dm", url: "https://dm.com/cellular-vs-roman", clicks: 70 }),
      ],
    });
    expect(pages).toHaveLength(3);
    expect(pages.map((p) => keywordFromPeerGscUrl(p.url))).toEqual([
      "how to safely remove blinds",
      "roman shades",
      "cellular vs roman",
    ]);
  });

  it("skips Bali URLs and still picks distinct keywords", () => {
    const pages = pickBestPeerGscPages({
      targetSiteId: "lindsey",
      count: 4,
      rows: [
        row({
          site_id: "magic",
          url: "https://magic.com/diy-tutorial-how-to-safely-remove-bali-blinds-from-their-brackets",
          clicks: 400,
        }),
        row({ site_id: "west", url: "https://west.com/dyi-safely-remove-bali-blinds", clicks: 350 }),
        row({ site_id: "advance", url: "https://advance.com/blinds-repairs", clicks: 200 }),
        row({ site_id: "dm", url: "https://dm.com/simple-steps-to-repair-your-blinds-at-home", clicks: 180 }),
        row({ site_id: "dm", url: "https://dm.com/roman-shades", clicks: 90 }),
        row({ site_id: "dm", url: "https://dm.com/cellular-shades-vs-roman-shades", clicks: 80 }),
      ],
    });
    expect(pages.map((p) => p.url)).toEqual([
      "https://advance.com/blinds-repairs",
      "https://dm.com/simple-steps-to-repair-your-blinds-at-home",
      "https://dm.com/roman-shades",
      "https://dm.com/cellular-shades-vs-roman-shades",
    ]);
    expect(pages.every((p) => !/bali/i.test(p.url))).toBe(true);
  });
});

describe("keywordFromPeerGscUrl", () => {
  it("uses the last path segment as the pulled keyword", () => {
    expect(keywordFromPeerGscUrl("https://magic.com/alta-vs-hunter-douglas/")).toBe(
      "alta vs hunter douglas",
    );
  });
});

describe("uniquePeerKeywordKey", () => {
  it("treats the same keyword once after word order and filler", () => {
    const a = uniquePeerKeywordKey("how to safely remove blinds");
    const b = uniquePeerKeywordKey("safely remove blinds diy steps");
    expect(a).toBe(b);
    expect(a).toBe("blind remove");
  });

  it("does not collapse different keywords into one topic type", () => {
    expect(uniquePeerKeywordKey("blinds repairs")).not.toBe(
      uniquePeerKeywordKey("simple steps to repair your blinds at home"),
    );
    expect(uniquePeerKeywordKey("cellular shades vs roman shades")).not.toBe(
      uniquePeerKeywordKey("cellular vs roman"),
    );
  });
});
