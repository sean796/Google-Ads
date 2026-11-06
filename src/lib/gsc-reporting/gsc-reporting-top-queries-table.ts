import { parseQueriesMomCsv } from "@/lib/gsc-reporting/gsc-reporting-compare-signals";
import { formatCanadianNumber, parseCanadianNumber, splitCsvLine } from "@/lib/gsc-reporting/gsc-number-format";
import { gscCompareTablePeriodFootnote } from "@/lib/gsc-reporting/gsc-reporting-table-labels";
import { GSC_QUERIES_PERIOD_FILENAME } from "@/lib/gsc-reporting/gsc-reporting-monthly-totals";
import { sortByClicksDesc } from "@/lib/gsc-reporting/gsc-reporting-table-sort";

export const GSC_QUERIES_MOM_FILENAME = "Queries-MoM.csv";
export const GSC_TOP_QUERIES_TABLE_MARKER = "### Top search queries";

const TOP_QUERY_ROW_LIMIT = 10;

function escapePipeCell(s: string): string {
  return s.replace(/\|/g, "\\|");
}

function pctDelta(primary: number, compare: number): string {
  if (!Number.isFinite(primary) || !Number.isFinite(compare) || compare === 0) return "—";
  const pct = ((primary - compare) / compare) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

type QueryMomRow = {
  query: string;
  clk: number;
  clkCompare: number;
  imp: number;
  impCompare: number;
  pos: number;
  posCompare: number;
};

function queryRowsFromMomCsv(csvText: string): QueryMomRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  const headerIdx = lines.findIndex((l) => l.trimStart().startsWith("Query,"));
  if (headerIdx < 0) return [];

  const header = splitCsvLine(lines[headerIdx]!);
  const col = (re: RegExp, after = -1): number => {
    for (let i = 0; i < header.length; i++) {
      if (i <= after) continue;
      if (re.test(header[i]?.trim() ?? "")) return i;
    }
    return -1;
  };

  const queryIdx = header.findIndex((h) => h.trim() === "Query");
  const clkA = col(/^Clicks \(/);
  const clkB = col(/^Clicks \(/, clkA);
  const impA = col(/^Impressions \(/);
  const impB = col(/^Impressions \(/, impA);
  const posA = col(/^Position \(/);
  const posB = col(/^Position \(/, posA);
  if (queryIdx < 0 || clkA < 0 || impA < 0) return [];

  const num = (parts: string[], idx: number): number => {
    if (idx < 0) return 0;
    const n = parseCanadianNumber(parts[idx]?.trim() ?? "");
    return Number.isFinite(n) ? n : 0;
  };

  const out: QueryMomRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]!);
    const query = parts[queryIdx]?.trim();
    if (!query) continue;
    out.push({
      query,
      clk: num(parts, clkA),
      clkCompare: num(parts, clkB),
      imp: num(parts, impA),
      impCompare: num(parts, impB),
      pos: num(parts, posA),
      posCompare: num(parts, posB),
    });
  }
  return out;
}

export function buildGscTopQueriesMarkdownTable(csvContent: string, compareLabel: string): string {
  const rows = sortByClicksDesc(queryRowsFromMomCsv(csvContent), (r) => r.clk, (r) => r.imp).slice(
    0,
    TOP_QUERY_ROW_LIMIT,
  );
  if (rows.length === 0) {
    const parsed = parseQueriesMomCsv(csvContent);
    const compareMap = new Map(parsed.compareQueries.map((r) => [r.query.trim(), r]));
    const merged = parsed.primaryQueries
      .map((p) => {
        const c = compareMap.get(p.query.trim());
        return {
          query: p.query.trim(),
          clk: p.clicks,
          clkCompare: c?.clicks ?? 0,
          imp: p.impressions,
          impCompare: c?.impressions ?? 0,
          pos: p.position,
          posCompare: c?.position ?? 0,
        };
      })
      .sort((a, b) => b.clk - a.clk || b.imp - a.imp)
      .slice(0, TOP_QUERY_ROW_LIMIT);
    if (merged.length === 0) return "";
    return renderTopQueriesTable(merged, compareLabel);
  }
  return renderTopQueriesTable(rows, compareLabel);
}

function renderTopQueriesTable(rows: QueryMomRow[], compareLabel: string): string {
  const line = (cells: string[]) => `| ${cells.map((c) => escapePipeCell(c)).join(" | ")} |`;
  const body = rows.map((r) =>
    line([
      r.query,
      formatCanadianNumber(r.clk, 0),
      pctDelta(r.clk, r.clkCompare),
      formatCanadianNumber(r.imp, 0),
      pctDelta(r.imp, r.impCompare),
      r.pos > 0 ? formatCanadianNumber(r.pos, 1) : "—",
      pctDelta(r.pos, r.posCompare),
    ]),
  );
  const footnote = gscCompareTablePeriodFootnote(compareLabel);
  return [
    GSC_TOP_QUERIES_TABLE_MARKER,
    "",
    line(["Query", "Clk", "Clk Δ%", "Imp", "Imp Δ%", "Pos", "Pos Δ%"]),
    line(["---", "---:", "---:", "---:", "---:", "---:", "---:"]),
    ...body,
    "",
    footnote,
  ].join("\n");
}

function queryRowsFromPeriodCsv(csvText: string): Omit<QueryMomRow, "clkCompare" | "impCompare" | "posCompare">[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  const headerIdx = lines.findIndex((l) => l.trimStart().startsWith("Query,"));
  if (headerIdx < 0) return [];
  const out: Omit<QueryMomRow, "clkCompare" | "impCompare" | "posCompare">[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]!);
    const query = parts[0]?.trim();
    if (!query) continue;
    const clk = parseCanadianNumber(parts[1]?.trim() ?? "");
    const imp = parseCanadianNumber(parts[2]?.trim() ?? "");
    const pos = parseCanadianNumber(parts[4]?.trim() ?? "");
    out.push({
      query,
      clk: Number.isFinite(clk) ? clk : 0,
      imp: Number.isFinite(imp) ? imp : 0,
      pos: Number.isFinite(pos) ? pos : 0,
    });
  }
  return out;
}

function renderTopQueriesPeriodTable(
  rows: Omit<QueryMomRow, "clkCompare" | "impCompare" | "posCompare">[],
  _periodLabel: string,
): string {
  const line = (cells: string[]) => `| ${cells.map((c) => escapePipeCell(c)).join(" | ")} |`;
  const body = rows.map((r) =>
    line([
      r.query,
      formatCanadianNumber(r.clk, 0),
      formatCanadianNumber(r.imp, 0),
      r.pos > 0 ? formatCanadianNumber(r.pos, 1) : "—",
    ]),
  );
  return [
    GSC_TOP_QUERIES_TABLE_MARKER,
    "",
    line(["Query", "Clk", "Imp", "Pos"]),
    line(["---", "---:", "---:", "---:"]),
    ...body,
  ].join("\n");
}

export function buildGscTopQueriesPeriodMarkdownTable(csvContent: string, periodLabel: string): string {
  const rows = sortByClicksDesc(queryRowsFromPeriodCsv(csvContent), (r) => r.clk, (r) => r.imp).slice(
    0,
    TOP_QUERY_ROW_LIMIT,
  );
  if (rows.length === 0) return "";
  return renderTopQueriesPeriodTable(rows, periodLabel);
}

export function topQueriesTableFromBundledFiles(
  files: { name: string; content: string }[],
  compareLabel: string,
  options?: { periodProgress?: boolean },
): string {
  if (options?.periodProgress) {
    const periodFile = files.find((f) => f.name.trim() === GSC_QUERIES_PERIOD_FILENAME);
    if (!periodFile?.content.trim()) return "";
    return buildGscTopQueriesPeriodMarkdownTable(periodFile.content, compareLabel);
  }
  const file = files.find((f) => f.name.trim().toLowerCase() === GSC_QUERIES_MOM_FILENAME.toLowerCase());
  if (!file?.content.trim()) return "";
  return buildGscTopQueriesMarkdownTable(file.content, compareLabel);
}
