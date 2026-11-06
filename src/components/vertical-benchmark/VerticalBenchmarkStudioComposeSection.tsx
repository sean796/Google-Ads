import {
  Download,
  Wand2,
} from "lucide-react";
import { VendorButton as Button, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui";




import { MY_SITES_FIELD } from "@/components/hosting/my-sites/my-sites-theme";
import { DASHBOARD_LIST_CHECKBOX_CLASS } from "@/components/shared/workspace-checkbox-styles";
import type { WordPressSite } from "@/components/integrations/types";
import type { ContentTypeFilter } from "@/hooks/vertical-benchmark/use-vertical-benchmark-controller";
import type { BenchmarkGridCsvContext } from "@/lib/vertical-benchmark/vertical-benchmark-grid-entity";
import { cn } from "@/lib/utils";

export type VerticalBenchmarkStudioComposeProps = {
  contentTypeFilter: ContentTypeFilter;
  onContentTypeFilterChange: (value: ContentTypeFilter) => void;
  tagFilter: string;
  onTagFilterChange: (value: string) => void;
  tagFilterOptions: string[];
  rosterSites: WordPressSite[];
  selectedSiteIds: Set<string>;
  clientTagLabelBySiteId: Record<string, string>;
  onToggleSite: (siteId: string, checked: boolean) => void;
  onSelectAllChange: (selectAll: boolean) => void;
  blogCount: number;
  onBlogCountChange: (value: number) => void;
  gridCsvContext: BenchmarkGridCsvContext | null;
  gridCsvFileName: string | null;
  gridCsvParsing: boolean;
  onGridCsvFile: (file: File | null) => void | Promise<void>;
  onClearGridCsv: () => void;
  generating: boolean;
  workspaceBusy: boolean;
  hasGeneratedChecklist: boolean;
  canDownloadCsv: boolean;
  onGenerateIdeas: () => void;
  onApprove: () => void;
  onDownloadCsv: () => void;
};

export function VerticalBenchmarkStudioComposeSection({
  contentTypeFilter,
  onContentTypeFilterChange,
  tagFilter,
  onTagFilterChange,
  tagFilterOptions,
  rosterSites,
  selectedSiteIds,
  clientTagLabelBySiteId,
  onToggleSite,
  onSelectAllChange,
  blogCount,
  onBlogCountChange,
  gridCsvContext,
  gridCsvFileName,
  gridCsvParsing,
  onGridCsvFile,
  onClearGridCsv,
  generating,
  workspaceBusy,
  hasGeneratedChecklist,
  canDownloadCsv,
  onGenerateIdeas,
  onApprove,
  onDownloadCsv,
}: VerticalBenchmarkStudioComposeProps) {
  const allSelected =
    rosterSites.length > 0 && rosterSites.every((s) => selectedSiteIds.has(s.id));
  const someSelected =
    rosterSites.some((s) => selectedSiteIds.has(s.id)) && !allSelected;

  return (
    <section className="flex flex-col gap-3">
      {/* Slot 2: Primary Surface (Peer Client Roster) */}
      <div className="flex h-[60vh] min-h-[11rem] w-full flex-col overflow-hidden bg-ui-field">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/10 bg-zinc-950/60 px-3 text-base">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={(v) => onSelectAllChange(v === true)}
              disabled={workspaceBusy || rosterSites.length === 0}
              aria-label="Select all peer clients"
              className={DASHBOARD_LIST_CHECKBOX_CLASS}
            />
            <span className="font-medium text-white">
              Peer clients ({selectedSiteIds.size}/{rosterSites.length})
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-white/5">
          {rosterSites.length === 0 ? (
            <div className="flex h-28 items-center justify-center px-4 text-center text-base text-muted-foreground">
              No clients in this category. Select a category below or set a Benchmark category tag in Site Settings.
            </div>
          ) : (
            rosterSites.map((site) => {
              const checked = selectedSiteIds.has(site.id);
              return (
                <label
                  key={site.id}
                  className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-base hover:bg-zinc-800/60"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => onToggleSite(site.id, v === true)}
                      disabled={workspaceBusy}
                      aria-label={`Select ${site.name}`}
                      className={DASHBOARD_LIST_CHECKBOX_CLASS}
                    />
                    <span className="truncate font-medium text-white">{site.name}</span>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>

      {/* Slot 3: Secondary Parameters Grid */}
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={
              tagFilterOptions.includes(tagFilter)
                ? tagFilter
                : (tagFilterOptions[0] ?? "__unset__")
            }
            onValueChange={(v) => {
              if (v !== "__unset__") onTagFilterChange(v);
            }}
            disabled={workspaceBusy}
          >
            <SelectTrigger
              aria-label="Filter by category tag"
              className={cn(MY_SITES_FIELD, "h-8 bg-ui-field px-2 text-base text-white")}
            >
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="rounded-none border border-white/10 bg-zinc-900 text-base text-white">
              {tagFilterOptions.length === 0 ? (
                <SelectItem value="__unset__" className="text-base">
                  Category
                </SelectItem>
              ) : (
                tagFilterOptions.map((label) => (
                  <SelectItem key={label} value={label} className="text-base">
                    {label}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <Select
            value={contentTypeFilter || "post"}
            onValueChange={(v) => onContentTypeFilterChange(v as ContentTypeFilter)}
            disabled={workspaceBusy}
          >
            <SelectTrigger
              aria-label="Content type"
              className={cn(MY_SITES_FIELD, "h-8 bg-ui-field px-2 text-base text-white")}
            >
              <SelectValue placeholder="Content type" />
            </SelectTrigger>
            <SelectContent className="rounded-none border border-white/10 bg-zinc-900 text-base text-white">
              <SelectItem value="post" className="text-base">
                Posts
              </SelectItem>
              <SelectItem value="entity" className="text-base">
                Entity URLs
              </SelectItem>
              <SelectItem value="both" className="text-base">
                Both
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
          <div className="flex h-8 items-center justify-between gap-2 rounded-none bg-ui-field px-2 text-base text-muted-foreground">
            <span className="truncate">Articles in batch:</span>
          </div>
          <Input
            type="number"
            min={0}
            max={50}
            step={1}
            value={blogCount || ""}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              onBlogCountChange(Number.isNaN(n) ? 0 : n);
            }}
            disabled={workspaceBusy}
            aria-label="Number of blogs"
            title="Number of blogs"
            className={cn(MY_SITES_FIELD, "h-8 bg-ui-field text-center text-base tabular-nums")}
          />
        </div>
      </div>

      {/* Slot 4: Action Footer */}
      <div className="flex flex-wrap items-center justify-start gap-2">


        {hasGeneratedChecklist ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={workspaceBusy}
            onClick={onGenerateIdeas}
            className="h-8 rounded-none border border-white/10 bg-ui-field px-2 text-base text-white hover:bg-zinc-800"
          >
            <Wand2 className="mr-1.5 h-4 w-4 text-primary" aria-hidden />
            Re-curate
          </Button>
        ) : null}

        {canDownloadCsv ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={workspaceBusy}
            onClick={onDownloadCsv}
            title="Download curated bulk CSV"
            className="h-8 rounded-none border border-white/10 bg-ui-field px-2 text-base text-white hover:bg-zinc-800"
          >
            <Download className="mr-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
            Download CSV
          </Button>
        ) : null}
      </div>
    </section>
  );
}
