import { useMemo, useState } from "react";

import { buildGridRedirectCsvRedirectRows } from "@/lib/sitemap-optimizer/build-grid-pulse-redirect-redirects";
import { gridMemberSourceUrl } from "@/lib/sitemap-optimizer/grid-member-url";
import type { SitemapOptimizerRunResult } from "@/lib/sitemap-optimizer/types";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";

type Props = {
  result: SitemapOptimizerRunResult;
};

function truncateCell(text: string, max = 52): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function SitemapOptimizerGridRedirectCsvGrid({ result }: Props) {
  const [groupFilter, setGroupFilter] = useState<number | "all">("all");

  const rows = useMemo(() => buildGridRedirectCsvRedirectRows(result), [result]);

  const uploadRowByUrl = useMemo(
    () =>
      new Map(
        result.rows.map((r) => [gridMemberSourceUrl(r).toLowerCase(), r.uploadRowIndex ?? 0]),
      ),
    [result.rows],
  );

  const filtered = useMemo(() => {
    if (groupFilter === "all") return rows;
    return rows.filter((r) => r.mergeGroupId === groupFilter);
  }, [rows, groupFilter]);

  const groupIds = useMemo(() => {
    const ids = new Set(rows.map((r) => r.mergeGroupId));
    return [...ids].sort((a, b) => a - b);
  }, [rows]);

  if (!rows.length) {
    return (
      <p className="text-base text-muted-foreground">No redirect rows. Run analyze first.</p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          pressed={groupFilter === "all"}
          type="button"
          onClick={() => setGroupFilter("all")}
        >
          All ({rows.length})
        </Button>
        {groupIds.length <= 12
          ? groupIds.map((id) => (
              <Button
                pressed={groupFilter === id}
                key={id}
                type="button"
                onClick={() => setGroupFilter(id)}
              >
                Family {id}
              </Button>
            ))
          : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/60">
        <Table className="w-full min-w-[1100px] table-fixed text-base">
          <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[72px] px-2 text-right">Family ID</TableHead>
              <TableHead className="w-[56px] px-2 text-right">Row</TableHead>
              <TableHead className="w-[18%] px-2">Tag</TableHead>
              <TableHead className="w-[28%] px-2">Old URL</TableHead>
              <TableHead className="w-[28%] px-2">New URL</TableHead>
              <TableHead className="w-[12%] px-2">RM source</TableHead>
              <TableHead className="w-[12%] px-2">RM dest</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => {
              const uploadRow = uploadRowByUrl.get(row.sourceUrl.toLowerCase()) ?? "";
              const key = `${row.mergeGroupId}-${row.source}`;
              return (
                <TableRow key={key} className="hover:bg-muted/30">
                  <TableCell className="px-2 py-1.5 text-right font-semibold tabular-nums">
                    {row.mergeGroupId}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {uploadRow || "—"}
                  </TableCell>
                  <TableCell className="px-2 py-1.5" title={row.tagLabel || row.topicTag}>
                    <span className="block break-words">{row.tagLabel || row.topicTag || "—"}</span>
                  </TableCell>
                  <TableCell className="px-2 py-1.5" title={row.sourceUrl}>
                    <a
                      href={row.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block break-words text-foreground underline-offset-2 hover:underline"
                    >
                      {truncateCell(row.sourceUrl)}
                    </a>
                  </TableCell>
                  <TableCell className="px-2 py-1.5" title={row.destinationUrl}>
                    <a
                      href={row.destinationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block break-words font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {truncateCell(row.destinationUrl)}
                    </a>
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-muted-foreground" title={row.source}>
                    <span className="block break-words">{truncateCell(row.source, 28)}</span>
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-muted-foreground" title={row.destination}>
                    <span className="block break-words">{truncateCell(row.destination, 28)}</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
