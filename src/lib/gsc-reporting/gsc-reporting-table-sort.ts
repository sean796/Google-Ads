/** Sort helpers for GSC reporting markdown tables. */

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

/** Chronological key for labels like "July 2026" or "Jul 2026". */
export function monthLabelSortKey(label: string): number {
  const t = label.trim().replace(/\*\*/g, "");
  if (!t || /^period total/i.test(t)) return Number.MAX_SAFE_INTEGER;
  const iso = t.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (iso) return parseInt(iso[1]!, 10) * 12 + (parseInt(iso[2]!, 10) - 1);
  const named = t.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (named) {
    const mi = MONTH_NAME_TO_INDEX[named[1]!.toLowerCase()];
    if (mi != null) return parseInt(named[2]!, 10) * 12 + mi;
  }
  const parsed = Date.parse(t);
  if (Number.isFinite(parsed)) return parsed;
  return 0;
}

export function sortByMonthLabel<T>(rows: T[], label: (row: T) => string): T[] {
  return [...rows].sort(
    (a, b) => monthLabelSortKey(label(a)) - monthLabelSortKey(label(b)) || label(a).localeCompare(label(b)),
  );
}

export function sortByClicksDesc<T>(
  rows: T[],
  clicks: (row: T) => number,
  tieImpressions?: (row: T) => number,
): T[] {
  return [...rows].sort((a, b) => {
    const dc = clicks(b) - clicks(a);
    if (dc !== 0) return dc;
    if (tieImpressions) return tieImpressions(b) - tieImpressions(a);
    return 0;
  });
}

function parsePipeCells(line: string): string[] {
  const t = line.trim();
  if (!t.startsWith("|")) return [];
  return t
    .slice(1, t.endsWith("|") ? -1 : undefined)
    .split("|")
    .map((c) => c.trim());
}

function isPipeSeparatorRow(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  return /^[\s|:-]+$/.test(t);
}

function parseNumericCell(cell: string): number {
  const s = cell.replace(/,/g, "").replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Re-order data rows in pipe tables: Month tables by calendar month; others by Clk descending. */
export function sortGscReportMarkdownPipeTables(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (
      line.trimStart().startsWith("|") &&
      i + 1 < lines.length &&
      isPipeSeparatorRow(lines[i + 1]!)
    ) {
      const headerCells = parsePipeCells(line);
      const sep = lines[i + 1]!;
      let j = i + 2;
      const dataRows: string[] = [];
      while (j < lines.length && lines[j]!.trimStart().startsWith("|") && !isPipeSeparatorRow(lines[j]!)) {
        dataRows.push(lines[j]!);
        j++;
      }

      const firstHeader = headerCells[0]?.toLowerCase() ?? "";
      const clkIdx = headerCells.findIndex((h) => /^clk\b/i.test(h.trim()));
      const monthTable = firstHeader === "month";
      const wideCompare =
        dataRows.length > 0 &&
        /^(current|prior|δ%|delta)/i.test(parsePipeCells(dataRows[0]!)[0]?.replace(/\*/g, "") ?? "");

      let sortedRows = dataRows;
      if (!wideCompare && dataRows.length > 1) {
        if (monthTable) {
          sortedRows = [...dataRows].sort((a, b) => {
            const la = parsePipeCells(a)[0] ?? "";
            const lb = parsePipeCells(b)[0] ?? "";
            return monthLabelSortKey(la) - monthLabelSortKey(lb) || la.localeCompare(lb);
          });
        } else if (clkIdx >= 0) {
          sortedRows = [...dataRows].sort((a, b) => {
            const ca = parsePipeCells(a)[clkIdx] ?? "";
            const cb = parsePipeCells(b)[clkIdx] ?? "";
            return parseNumericCell(cb) - parseNumericCell(ca);
          });
        }
      }

      out.push(line, sep, ...sortedRows);
      i = j;
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}
