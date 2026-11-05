import { ArrowUpDown } from "lucide-react";
import { BULK_HEADER_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { cn } from "@/lib/utils";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/ui";

export type OverviewContentSortControlsProps = {
  sortColumn: "title" | "date" | null;
  sortDir: "asc" | "desc";
  setSortColumn: Dispatch<SetStateAction<"title" | "date" | null>>;
  setSortDir: Dispatch<SetStateAction<"asc" | "desc">>;
  disabled?: boolean;
  showSortLabel?: boolean;
  titleSortLabel?: string;
  showDateSort?: boolean;
};

export function OverviewContentSortControls({
  sortColumn,
  sortDir,
  setSortColumn,
  setSortDir,
  disabled = false,
  showSortLabel = true,
  titleSortLabel = "Title",
  showDateSort = true,
}: OverviewContentSortControlsProps) {
  return (
    <div
      className="flex shrink-0 flex-nowrap items-center gap-1.5"
      role="group"
      aria-label="Sort rows"
    >
      {showSortLabel ? (
        <span className="text-base font-medium uppercase tracking-wide text-muted-foreground">Sort</span>
      ) : null}
      <Button
        variant="quiet"
        type="button"
        disabled={disabled}
        onClick={() => {
          if (sortColumn !== "title") {
            setSortColumn("title");
            setSortDir("asc");
          } else {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          }
        }}
      >
        {titleSortLabel}{" "}
        <span className="inline-flex text-foreground" aria-hidden>
          {sortColumn === "title" ? (
            sortDir === "asc" ? (
              "\u2191"
            ) : (
              "\u2193"
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 opacity-60" strokeWidth={2.25} />
          )}
        </span>
      </Button>
      {showDateSort ? (
      <Button
        variant="quiet"
        type="button"
        disabled={disabled}
        onClick={() => {
          if (sortColumn !== "date") {
            setSortColumn("date");
            setSortDir("asc");
          } else {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          }
        }}
      >
        Date{" "}
        <span className="inline-flex text-foreground" aria-hidden>
          {sortColumn === "date" ? (
            sortDir === "asc" ? (
              "\u2191"
            ) : (
              "\u2193"
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 opacity-60" strokeWidth={2.25} />
          )}
        </span>
      </Button>
      ) : null}
    </div>
  );
}
