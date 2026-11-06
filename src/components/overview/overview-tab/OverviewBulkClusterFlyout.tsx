import React from "react";


import { BULK_HEADER_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { cn } from "@/lib/utils";
import type {
  OverviewBulkActionCluster,
  OverviewBulkClusterItem,
} from "@/lib/overview/overview-bulk-action-clusters";
import { groupOverviewClusterItemsIntoColumns } from "@/lib/overview/overview-bulk-action-clusters";
import { Button, CheckField, Popover, PopoverContent, PopoverTrigger, Checkbox } from "@/ui";

/** Per-column neutral greys — edge-to-edge, 0% saturation. */
const MEGA_MENU_COLUMN_GREYS = [
  "bg-[hsl(0,0%,8%)]",
  "bg-[hsl(0,0%,13%)]",
  "bg-[hsl(0,0%,18%)]",
] as const;

function ClusterFlyoutItem({
  item,
  onClose,
}: {
  item: OverviewBulkClusterItem;
  onClose: () => void;
}) {
  if (item.kind === "checkbox") {
    return (
      <label
        className={cn(
          "flex min-h-9 cursor-pointer items-center gap-2 rounded-none px-2 py-1.5 text-base",
          item.disabled ? "cursor-not-allowed opacity-50" : "hover:bg-black hover:text-white",
        )}
      >
        <CheckField checked={item.checked} disabled={item.disabled} onCheckedChange={(v) => item.onCheckedChange(v)} aria-label={item.label} />
        <span className="min-w-0 flex-1">{item.label}</span>
      </label>
    );
  }

  if (item.kind !== "action") {
    return null;
  }

  return (
    <Button
      variant="quiet"
      type="button"
      disabled={item.disabled}
      onClick={() => {
        if (item.disabled) return;
        item.onSelect();
        if (item.closeOnSelect !== false) onClose();
      }}
    >
      <span className="min-w-0 flex-1 break-words text-left">{item.label}</span>
      {item.trailing ? (
        <span className="shrink-0 tabular-nums text-semantic-analysis-foreground">{item.trailing}</span>
      ) : null}
    </Button>
  );
}

export function OverviewBulkClusterFlyout({
  cluster,
  workspaceBusy,
}: {
  cluster: OverviewBulkActionCluster;
  workspaceBusy: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const columns = React.useMemo(
    () => groupOverviewClusterItemsIntoColumns(cluster.items),
    [cluster.items],
  );

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex shrink-0">
      <Button
        variant="quiet"
        disabled={workspaceBusy}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {cluster.label}
      </Button>
      {open ? (
        <div
          className="absolute top-full left-0 z-50 mt-1.5 w-auto max-w-[min(calc(100vw-2rem),42rem)] overflow-hidden rounded-none border-0 bg-transparent p-0 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex flex-row items-stretch"
            role="menu"
            aria-label={cluster.label}
          >
            {columns.map((column, columnIndex) => (
              <div
                key={column.id}
                className={cn(
                  "flex min-w-[9.5rem] flex-1 flex-col self-stretch pb-1.5",
                  MEGA_MENU_COLUMN_GREYS[columnIndex % MEGA_MENU_COLUMN_GREYS.length],
                )}
                role="group"
                aria-label={column.label}
              >
                {column.label ? (
                  <div
                    className="mb-1 w-full bg-black px-2.5 py-1.5 text-base font-medium text-white"
                    role="presentation"
                  >
                    {column.label}
                  </div>
                ) : null}
                <ul className="flex flex-col">
                  {column.items.map((item) => (
                    <li key={item.id} role="none">
                      <ClusterFlyoutItem item={item} onClose={() => setOpen(false)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
