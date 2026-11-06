/** Lossy cap so executive-facing sections stay scannable when the model ignores row limits. */
export const REPORTING_MAX_TABLE_DATA_ROWS = 6;

function isPipeRow(line: string): boolean {
  return line.trimStart().startsWith("|");
}

function isPipeSeparatorRow(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  return /^[\s|:-]+$/.test(t);
}

export function stripMarkdownHeadingsH3ThroughH6(md: string): string {
  return md
    .split("\n")
    .filter((line) => !/^\s{0,3}#{3,6}(\s|$)/.test(line))
    .join("\n");
}

export function stripEmptyPipeTables(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (isPipeRow(line) && i + 1 < lines.length && isPipeSeparatorRow(lines[i + 1]!)) {
      const header = line;
      const sep = lines[i + 1]!;
      let j = i + 2;
      const dataRows: string[] = [];
      while (j < lines.length && isPipeRow(lines[j]!) && !isPipeSeparatorRow(lines[j]!)) {
        dataRows.push(lines[j]!);
        j++;
      }
      if (dataRows.length === 0) {
        i = j;
        continue;
      }
      out.push(header, sep, ...dataRows);
      i = j;
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

/** Pipe tables: plain text cells only (no ** leaking in Word/Docs). */
export function stripInlineMarkdownFromPipeTables(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      if (!line.trimStart().startsWith("|")) return line;
      return line.replace(/\*\*/g, "");
    })
    .join("\n");
}

export function capPipeTableDataRows(md: string, maxDataRows: number): string {
  if (maxDataRows < 1) return md;
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (isPipeRow(line) && i + 1 < lines.length && isPipeSeparatorRow(lines[i + 1]!)) {
      const header = line;
      const sep = lines[i + 1]!;
      const dataRows: string[] = [];
      let j = i + 2;
      while (j < lines.length && isPipeRow(lines[j]!) && !isPipeSeparatorRow(lines[j]!)) {
        dataRows.push(lines[j]!);
        j++;
      }
      const capped = dataRows.slice(0, maxDataRows);
      out.push(header, sep, ...capped);
      i = j;
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}
