import { RefreshCw } from "lucide-react";
import {
  Ga4ReportingDateRangePopover,
} from "@/components/research/reporting/Ga4ReportingDateRangePopover";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";
import {
  LEFT_DOCK_DEFAULT_WIDTH,
  type OrganicReportingStudioLeftDockProps,
} from "@/components/organic-dashboard/organic-reporting-studio-shell-helpers";

export function OrganicReportingStudioLeftDock(props: OrganicReportingStudioLeftDockProps) {
  const {
    dockWidth,
    busy,
    onRefresh,
    dateHarness,
    onDateHarnessApply,
    todayYmdMax,
    dateRangePopoverOpen,
    onDateRangePopoverOpenChange,
    outlineItems,
    readyCount,
    activeAnchorId,
    scrollToSection,
    isResizing,
    onResizePointerDown,
    onResizePointerMove,
    onResizePointerUp,
    finishResize,
  } = props;

  return (
        <aside
          aria-label="Reporting studio navigator"
          style={{ width: `${dockWidth}px` }}
          className="relative flex h-full shrink-0 flex-col border-r border-white/10 bg-black font-sans text-base text-white"
        >
          {/* Top Mode Row */}
          <div className="flex h-11 shrink-0 items-center justify-between gap-2 bg-ui-field px-3">
            <span className="inline-flex h-8 items-center bg-primary px-3 text-base font-semibold text-black">
              Performance
            </span>

            <Button
              size="icon" icon={RefreshCw}
              variant="quiet"
              type="button"
              disabled={busy}
              title="Refresh report metrics and AI overview"
              aria-label="Refresh report"
              onClick={onRefresh}
            ></Button>
          </div>

          {/* Date Range Filter Row */}
          <div className="flex flex-col gap-1.5 border-b border-white/10 bg-black p-2.5">
            <Ga4ReportingDateRangePopover
              busy={busy}
              value={dateHarness}
              onApply={onDateHarnessApply}
              todayYmdMax={todayYmdMax}
              open={dateRangePopoverOpen}
              onOpenChange={onDateRangePopoverOpenChange}
            />
            <div className="flex items-center justify-between px-1 text-base text-muted-foreground">
              <span className="tabular-nums">{outlineItems.length} report sections</span>
              <span className="tabular-nums text-primary">
                {readyCount}/{outlineItems.length} ready
              </span>
            </div>
          </div>

          {/* Scrollable Report Sections List */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {outlineItems.length === 0 ? (
              <div className="min-h-48" aria-hidden />
            ) : (
              <ul className="divide-y divide-white/5" aria-label="Report sections">
                {outlineItems.map((item) => {
                  const isActive = activeAnchorId === item.anchorId;
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "group flex items-start gap-2.5 px-3.5 py-3 transition-colors",
                        isActive
                          ? "border-l-2 border-primary bg-ui-field"
                          : "bg-black hover:bg-black",
                      )}
                    >
                      <Button
                        variant="quiet"
                        onClick={() => scrollToSection(item.anchorId)}
                      >
                        <span
                          className={cn(
                            "text-base font-medium leading-snug",
                            isActive ? "text-primary" : "text-white group-hover:text-primary/90",
                          )}
                        >
                          {item.title}
                        </span>
                        <span className="w-full break-words text-base text-muted-foreground">
                          {item.subtitle}
                        </span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Right-edge click & drag resize handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize reporting dock"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
            onDoubleClick={() => finishResize(LEFT_DOCK_DEFAULT_WIDTH)}
            className={cn(
              "absolute inset-y-0 -right-1 z-20 w-2 cursor-ew-resize touch-none transition-colors hover:bg-primary/40",
              isResizing && "bg-primary/60",
            )}
          />
        </aside>

  );
}
