import { Fragment, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { contentSheetPrimaryUrl } from "@/lib/sitemap-optimizer/content-sheet-source-url";
import type { SitemapOptimizerContentSheetRow } from "@/lib/sitemap-optimizer/types";
import { cn } from "@/lib/utils";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";

type SheetFilter = "all" | "merge" | "standalone" | "high" | "by_cluster";

type Props = {
  sheet: SitemapOptimizerContentSheetRow[];
  runMode?: "wordpress" | "grid_csv";
  /** When true, hide keep/refresh filters — sheet is already replacement-only. */
  replacementsOnly?: boolean;
};

function contentSheetLegacySummary(row: SitemapOptimizerContentSheetRow): string {
  const legacy = row.legacySourceUrl?.trim();
  const count = row.mergeSourceCount ?? 1;
  if (count > 1) {
    const first =
      row.whatToKeepFromEach?.[0]?.url?.trim() ||
      legacy ||
      contentSheetPrimaryUrl(row);
    return `${count} legacy URLs → ${first}`;
  }
  return legacy || row.sourceUrl.trim();
}

function truncateCell(text: string, max = 48): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function SitemapOptimizerContentSheetGrid({
  sheet,
  runMode,
  replacementsOnly = false,
}: Props) {
  const isGrid = runMode === "grid_csv";
  const [filter, setFilter] = useState<SheetFilter>(
    replacementsOnly ? "merge" : isGrid ? "by_cluster" : "merge",
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const sorted = [...sheet].sort((a, b) => {
      if (isGrid) {
        const ga = a.mergeGroupNumber ?? 0;
        const gb = b.mergeGroupNumber ?? 0;
        if (ga !== gb) return ga - gb;
        return (a.uploadRowIndex ?? 0) - (b.uploadRowIndex ?? 0);
      }
      const ca = a.mergeClusterId ?? "";
      const cb = b.mergeClusterId ?? "";
      if (ca !== cb) return ca.localeCompare(cb);
      return (a.uploadRowIndex ?? 0) - (b.uploadRowIndex ?? 0);
    });
    return sorted.filter((row) => {
      if (filter === "merge") return row.action === "merge" || row.action === "new_blog";
      if (filter === "standalone")
        return row.isSingletonCluster === true || (row.action !== "merge" && row.action !== "new_blog");
      if (filter === "by_cluster") return Boolean(row.mergeClusterId);
      if (filter === "high") return row.priority === "high";
      return true;
    });
  }, [sheet, filter, isGrid]);

  const toggleExpand = (postId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  if (!sheet.length) {
    return (
      <p className="text-base text-muted-foreground">No URLs in content sheet. Run analyze first.</p>
    );
  }

  const filterBtn = (id: SheetFilter, label: string) => (
    <Button
      pressed={filter === id}
      key={id}
      type="button"
      onClick={() => setFilter(id)}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {!replacementsOnly ? (
        <div className="flex flex-wrap gap-2">
          {filterBtn("all", `All (${sheet.length})`)}
          {isGrid ? (
            <>
              {filterBtn("by_cluster", "By cluster")}
              {filterBtn("standalone", "Singleton blogs")}
            </>
          ) : (
            filterBtn("merge", "Replacements")
          )}
          {!isGrid ? filterBtn("standalone", "Standalone") : null}
          {filterBtn("high", "High priority")}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/60">
        <Table className="w-full min-w-[1280px] table-fixed text-base">
          <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8 px-1" />
              {isGrid ? (
                <>
                  <TableHead className="w-[56px] px-2 text-right">Group</TableHead>
                  <TableHead className="w-[56px] px-2 text-right">Row</TableHead>
                </>
              ) : null}
              <TableHead className={isGrid ? "w-[32%] px-2" : "w-[28%] px-2"}>
                {isGrid ? "URL" : replacementsOnly ? "Destination URL" : "Source URL"}
              </TableHead>
              {replacementsOnly ? (
                <TableHead className="w-[18%] px-2">Legacy URLs</TableHead>
              ) : null}
              <TableHead className="w-[18%] px-2">Proposed title</TableHead>
              <TableHead className="w-[10%] px-2">Keyword</TableHead>
              <TableHead className="w-[12%] px-2">Proposed meta</TableHead>
              <TableHead className="w-[14%] px-2">Modifier</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => {
              const isOpen = expanded.has(row.postId);
              const hasDetail =
                Boolean(row.rationale?.trim()) ||
                Boolean(row.modifier?.trim()) ||
                Boolean(row.combinedOutline?.length) ||
                Boolean(row.whatToKeepFromEach?.length) ||
                (row.mergeSourceCount ?? 0) > 1;
              return (
                <Fragment key={row.postId}>
                  <TableRow className="hover:bg-muted/30">
                    <TableCell className="px-1 py-1.5">
                      {hasDetail ? (
                        <Button
                          variant="quiet"
                          aria-expanded={isOpen}
                          onClick={() => toggleExpand(row.postId)}
                        >
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition-transform",
                              isOpen && "rotate-180",
                            )}
                          />
                        </Button>
                      ) : null}
                    </TableCell>
                    {isGrid ? (
                      <>
                        <TableCell className="px-2 py-1.5 text-right tabular-nums font-semibold text-foreground">
                          {row.mergeGroupNumber ?? "—"}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {row.uploadRowIndex ?? "—"}
                        </TableCell>
                      </>
                    ) : null}
                    <TableCell
                      className="px-2 py-1.5"
                      title={contentSheetPrimaryUrl(row)}
                    >
                      <a
                        href={contentSheetPrimaryUrl(row)}
                        target="_blank"
                        rel="noreferrer"
                        className="block break-words font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {truncateCell(contentSheetPrimaryUrl(row), 56)}
                      </a>
                    </TableCell>
                    {replacementsOnly ? (
                      <TableCell
                        className="px-2 py-1.5 text-muted-foreground"
                        title={contentSheetLegacySummary(row)}
                      >
                        <span className="block break-words">
                          {truncateCell(contentSheetLegacySummary(row), 48)}
                        </span>
                      </TableCell>
                    ) : null}
                    <TableCell className="px-2 py-1.5" title={row.proposedTitle}>
                      <span className="block break-words font-medium text-foreground">
                        {truncateCell(row.proposedTitle, 48)}
                      </span>
                    </TableCell>
                    <TableCell className="px-2 py-1.5" title={row.proposedPrimaryKeyword}>
                      <span className="block break-words">{truncateCell(row.proposedPrimaryKeyword, 28)}</span>
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-muted-foreground" title={row.proposedMeta}>
                      <span className="block break-words">{truncateCell(row.proposedMeta, 40)}</span>
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-muted-foreground" title={row.modifier}>
                      <span className="block break-words">{truncateCell(row.modifier ?? "", 40)}</span>
                    </TableCell>
                  </TableRow>
                  {isOpen && hasDetail ? (
                    <TableRow className="bg-muted/20 hover:bg-muted/25">
                      <TableCell
                        colSpan={isGrid ? 8 : replacementsOnly ? 7 : 6}
                        className="px-3 py-2 text-base text-muted-foreground"
                      >
                        {row.rationale ? <p className="mb-2">{row.rationale}</p> : null}
                        {row.combinedOutline?.length ? (
                          <div className="mb-2">
                            <p className="font-medium text-foreground">New article H2s</p>
                            <ul className="mt-1 list-inside list-disc">
                              {row.combinedOutline.map((h) => (
                                <li key={h}>{h}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {row.whatToKeepFromEach?.length ? (
                          <div>
                            <p className="font-medium text-foreground">From legacy posts</p>
                            <ul className="mt-1 space-y-2">
                              {row.whatToKeepFromEach.map((keep) => (
                                <li key={keep.url || keep.title}>
                                  <span className="text-foreground">
                                    {keep.title?.trim() || keep.url}
                                  </span>
                                  {keep.bullets.length ? (
                                    <ul className="mt-0.5 list-inside list-disc pl-2">
                                      {keep.bullets.map((b) => (
                                        <li key={b}>{b}</li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-base text-muted-foreground">
        Showing {filtered.length} of {sheet.length} rows
      </p>
    </div>
  );
}
