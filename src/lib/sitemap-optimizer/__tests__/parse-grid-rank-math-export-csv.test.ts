import { describe, expect, it } from "vitest";
import {
  isGridRedirectCsvExportCsv,
  parseGridRedirectCsvExportCsv,
} from "@/lib/sitemap-optimizer/parse-grid-redirect-export-csv";

describe("parseGridRedirectCsvExportCsv", () => {
  it("detects grid export headers", () => {
    expect(
      isGridRedirectCsvExportCsv([
        "group",
        "upload_row",
        "topic_tag",
        "geo_tag",
        "tag_label",
        "old_url",
        "new_url",
        "id",
        "source",
      ]),
    ).toBe(true);
    expect(isGridRedirectCsvExportCsv(["source", "destination"])).toBe(false);
  });

  it("parses one row per old_url/new_url pair", () => {
    const csv = [
      "group,upload_row,topic_tag,geo_tag,tag_label,old_url,new_url,id,source,matching,destination,type,category,status,ignore",
      '1,10,tax,,Canadian Business,https://www.example.com/old-a/,https://www.example.com/blog/canadian-business/,1,blog/old-a/,exact,blog/canadian-business/,301,,active,',
      '2,11,tax,,Charitable,https://www.example.com/old-b/,https://www.example.com/blog/charitable/,2,blog/old-b/,exact,blog/charitable/,301,,active,',
    ].join("\n");
    const parsed = parseGridRedirectCsvExportCsv(csv);
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.redirectFromUrl).toContain("old-a");
    expect(parsed.rows[0]?.page).toContain("canadian-business");
    expect(parsed.rows[0]?.gridTagLabel).toBe("Canadian Business");
    expect(parsed.rows[0]?.csvUploadRow).toBe(10);
  });
});
