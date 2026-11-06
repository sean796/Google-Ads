import { ListFilter } from "lucide-react";
import { Button, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/ui";
import { cn } from "@/lib/utils";
import {
  UNTIERED_FILTER_KEY,
  tierBadgeClass,
} from "@/components/research/competitor/competitor-site-grid-helpers";

export function CompetitorTierFilterMenu({
  tierFilterOptions,
  selectedTierKeys,
  toggleTierFilterKey,
  hasUntieredRows,
  selectAllTierFilters,
  tierFilterActive,
}: {
  tierFilterOptions: Array<{ key: string; label: string; tier: string }>;
  selectedTierKeys: Set<string>;
  toggleTierFilterKey: (key: string, checked: boolean) => void;
  hasUntieredRows: boolean;
  selectAllTierFilters: () => void;
  tierFilterActive: boolean;
}) {
  return (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon" icon={ListFilter}
                              pressed={Boolean(tierFilterActive)}
                              variant="quiet"
                              title="Filter rows by tier"
                              aria-label="Filter rows by tier"
                            ></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="max-w-[min(22rem,calc(100vw-2rem))]">
                            <DropdownMenuLabel className="text-base font-semibold leading-normal">Show tiers</DropdownMenuLabel>
                            {tierFilterOptions.map((o) => (
                              <DropdownMenuCheckboxItem
                                key={o.key}
                                checked={selectedTierKeys.has(o.key)}
                                onCheckedChange={(v) => toggleTierFilterKey(o.key, v === true)}
                                onSelect={(e) => e.preventDefault()}
                                className="text-base leading-normal"
                              >
                                <span
                                  className={cn(
                                    "mr-2 inline-block min-h-[1rem] rounded border px-1.5 py-0.5 text-base font-medium leading-normal",
                                    tierBadgeClass(o.tier),
                                  )}
                                >
                                  {o.label}
                                </span>
                              </DropdownMenuCheckboxItem>
                            ))}
                            {hasUntieredRows ? (
                              <DropdownMenuCheckboxItem
                                checked={selectedTierKeys.has(UNTIERED_FILTER_KEY)}
                                onCheckedChange={(v) => toggleTierFilterKey(UNTIERED_FILTER_KEY, v === true)}
                                onSelect={(e) => e.preventDefault()}
                                className="text-base leading-normal"
                              >
                                No tier (-)
                              </DropdownMenuCheckboxItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-base leading-normal" onSelect={() => selectAllTierFilters()}>
                              Show all tiers
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
  );
}
