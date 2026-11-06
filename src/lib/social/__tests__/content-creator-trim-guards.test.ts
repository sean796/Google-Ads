import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { applyManualContentCalendarTools } from "@/lib/social/content-creator-manual-tools";
import {
  cellString,
  contentRowHasGenerateInput,
  createIdleContentCalendarRow,
  normalizeContentCalendarRow,
  type ContentCalendarRow,
} from "@/lib/social/content-creator-types";

const SOCIAL_SRC_ROOT = join(process.cwd(), "src/lib/social");

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...collectTsFiles(full));
      continue;
    }
    if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("content creator cellString guards", () => {
  it("contentRowHasGenerateInput does not throw on numeric row cells", () => {
    const row = {
      ...createIdleContentCalendarRow(),
      keyword: 123 as unknown as string,
      landingPageUrl: 456 as unknown as string,
    } satisfies ContentCalendarRow;
    expect(contentRowHasGenerateInput(row)).toBe(true);
  });

  it("normalizeContentCalendarRow coerces numeric cells to strings", () => {
    const row = normalizeContentCalendarRow({
      ...createIdleContentCalendarRow(),
      keyword: 123 as unknown as string,
      landingPageUrl: "https://example.com" as unknown as string,
    });
    expect(row.keyword).toBe("123");
    expect(contentRowHasGenerateInput(row)).toBe(true);
  });

  it("applyManualContentCalendarTools does not throw on numeric row fields", () => {
    expect(() =>
      applyManualContentCalendarTools(
        [
          {
            ...createIdleContentCalendarRow(),
            date: 45123 as unknown as string,
            landingPageUrl: "https://example.com/page" as unknown as string,
          },
        ],
        {
          landingPages: [
            {
              url: "https://example.com/other",
              title: "Other",
              excerpt: "",
              metaDescription: "",
              keyword: "",
            },
          ],
          landingPageSource: "pages",
        },
      ),
    ).not.toThrow();
  });

  it("cellString never calls trim", () => {
    expect(cellString("  hello  ")).toBe("  hello  ");
    expect(cellString(123)).toBe("123");
    expect(cellString(null)).toBe("");
  });

  it("syncContentCalendarRowsToCount slices excess rows when post count drops", async () => {
    const { syncContentCalendarRowsToCount } = await import("@/lib/social/sync-content-calendar-rows");
    const rows = syncContentCalendarRowsToCount(
      [
        { ...createIdleContentCalendarRow(), landingPageUrl: "https://example.com/a" },
        { ...createIdleContentCalendarRow(), landingPageUrl: "https://example.com/b" },
        { ...createIdleContentCalendarRow(), landingPageUrl: "https://example.com/c" },
      ],
      1,
    );
    expect(rows).toHaveLength(1);
  });

  it("src/lib/social has no .trim( calls outside __tests__ and social-creator Meta fork", () => {
    const offenders: string[] = [];
    for (const file of collectTsFiles(SOCIAL_SRC_ROOT)) {
      const rel = file.replace(process.cwd(), "").replace(/\\/g, "/");
      if (/social-creator|run-social-creator|export-social-creator|sync-social-creator/.test(rel)) {
        continue;
      }
      const text = readFileSync(file, "utf8");
      if (text.includes(".trim(")) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
