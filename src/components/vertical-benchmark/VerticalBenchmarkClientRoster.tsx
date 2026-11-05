import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { WordPressSite } from "@/components/integrations/types";
import type { ClientTagSortDir } from "@/hooks/vertical-benchmark/use-vertical-benchmark-controller";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

type Props = {
  sites: WordPressSite[];
  selectedSiteIds: Set<string>;
  clientTagLabelBySiteId: Record<string, string>;
  tagSortDir: ClientTagSortDir;
  onToggleTagSort: () => void;
  onToggleSite: (siteId: string, checked: boolean) => void;
  onSelectAllChange: (selectAll: boolean) => void;
  className?: string;
};

export function VerticalBenchmarkClientRoster({
  sites,
  selectedSiteIds,
  clientTagLabelBySiteId,
  tagSortDir,
  onToggleTagSort,
  onToggleSite,
  onSelectAllChange,
  className,
}: Props) {
  if (!sites.length) {
    return (
      <p className={cn("text-base text-muted-foreground px-1 py-4", className)}>
        No clients with a Benchmark category tag. Set the tag under Integrations → property → Site Settings.
      </p>
    );
  }

  const allSelected = sites.every((s) => selectedSiteIds.has(s.id));
  const someSelected = sites.some((s) => selectedSiteIds.has(s.id));
  const selectAllChecked: boolean | "indeterminate" =
    allSelected ? true : someSelected ? "indeterminate" : false;

  return (
    <div
      className={cn(
        "min-h-0 overflow-auto",
        className,
      )}
    >
      <Table>
        <TableHeader className="[&_tr]:border-0">
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className="border-0 bg-ui-field text-base w-[11rem]">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectAllChecked}
                  onCheckedChange={(v) => onSelectAllChange(v === true)}
                  aria-label="Select all clients"
                  title="Select all"
                />
                <Button
                  variant="quiet"
                  type="button"
                  onClick={onToggleTagSort}
                >
                  Category
                  {tagSortDir === "asc" ? (
                    <ArrowUp className="h-4 w-4 ml-1 inline" />
                  ) : (
                    <ArrowDown className="h-4 w-4 ml-1 inline" />
                  )}
                </Button>
              </div>
            </TableHead>
            <TableHead className="border-0 bg-ui-field text-base">Client</TableHead>
            <TableHead className="border-0 bg-ui-field text-base">Site URL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr]:border-0">
          {sites.map((site, index) => (
            <TableRow
              key={site.id}
              className={cn(
                "border-0",
                index % 2 === 0 ? "bg-black" : "bg-black",
                "hover:bg-ui-field",
              )}
            >
              <TableCell className="text-base text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedSiteIds.has(site.id)}
                    onCheckedChange={(v) => onToggleSite(site.id, v === true)}
                    aria-label={`Select ${site.name}`}
                  />
                  <span>{clientTagLabelBySiteId[site.id] ?? "—"}</span>
                </div>
              </TableCell>
              <TableCell className="text-base font-medium">{site.name}</TableCell>
              <TableCell className="text-base text-muted-foreground max-w-[24rem] break-words" title={site.siteUrl}>
                {site.siteUrl}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
