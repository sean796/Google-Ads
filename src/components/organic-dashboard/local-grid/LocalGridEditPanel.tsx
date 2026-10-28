import { useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  Phone,
  Play,
  Save,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import type { WordPressSite } from "@/components/integrations/types";
import {
  LOCAL_GRID_SCAN_SIZES,
  LOCAL_GRID_SHAPES,
  LOCAL_GRID_STEP_DISTANCES,
  type LocalGridBusinessIdentity,
  type LocalGridDistanceMeasure,
  type LocalGridScanSize,
  type LocalGridShape,
} from "@/lib/local-grid-studio/local-grid-types";
import { cn } from "@/lib/utils";

export type LocalGridEditPanelProps = {
  site: WordPressSite;
  activeBusiness: LocalGridBusinessIdentity;
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  scanSize: LocalGridScanSize;
  onScanSizeChange: (size: LocalGridScanSize) => void;
  shape: LocalGridShape;
  onShapeChange: (shape: LocalGridShape) => void;
  distance: number;
  onDistanceChange: (distance: number) => void;
  distanceMeasure: LocalGridDistanceMeasure;
  onDistanceMeasureChange: (measure: LocalGridDistanceMeasure) => void;
  plannedPinCount: number;
  scanning: boolean;
  onRunScan: () => void;
  onSave: () => void;
  onClose: () => void;
  onCenterOnBusiness?: () => void;
  resolvingBusiness?: boolean;
};

const GRID_SIZE_LABELS: Record<LocalGridScanSize, { label: string; pins: number }> = {
  "1x1": { label: "1 Pin | 1x1", pins: 1 },
  "3x3": { label: "9 Pins | 3x3", pins: 9 },
  "5x5": { label: "25 Pins | 5x5", pins: 25 },
  "7x7": { label: "49 Pins | 7x7", pins: 49 },
  "9x9": { label: "81 Pins | 9x9", pins: 81 },
  "11x11": { label: "121 Pins | 11x11", pins: 121 },
  "13x13": { label: "133 Pins | Ø13", pins: 133 },
  "15x15": { label: "177 Pins | Ø15", pins: 177 },
};

export function LocalGridEditPanel({
  site,
  activeBusiness,
  keyword,
  onKeywordChange,
  scanSize,
  onScanSizeChange,
  shape,
  onShapeChange,
  distance,
  onDistanceChange,
  distanceMeasure,
  onDistanceMeasureChange,
  plannedPinCount,
  scanning,
  onRunScan,
  onSave,
  onClose,
  onCenterOnBusiness,
  resolvingBusiness = false,
}: LocalGridEditPanelProps) {
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  const [newKeywordInput, setNewKeywordInput] = useState("");
  const [keywordList, setKeywordList] = useState<string[]>(() => {
    const k = keyword.trim();
    return k ? [k] : [];
  });

  const businessName =
    activeBusiness.business?.trim() || site.napInfo?.name || site.name || "Target Business";
  const address =
    activeBusiness.address?.trim() || site.napInfo?.address?.trim() || "";
  const phone = activeBusiness.phone?.trim() || site.napInfo?.phone?.trim() || "";
  const cid = activeBusiness.cid?.trim() || activeBusiness.placeId?.trim() || null;
  const primaryCategory = activeBusiness.primaryCategory?.trim() || "";

  const handleAddKeyword = () => {
    const trimmed = newKeywordInput.trim();
    if (!trimmed) return;
    if (!keywordList.includes(trimmed)) {
      const next = [...keywordList, trimmed];
      setKeywordList(next);
      onKeywordChange(trimmed);
    }
    setNewKeywordInput("");
  };

  const handleRemoveKeyword = (kwToRemove: string) => {
    const next = keywordList.filter((k) => k !== kwToRemove);
    setKeywordList(next);
    if (next.length > 0) {
      onKeywordChange(next[0]!);
    } else {
      onKeywordChange("");
    }
  };

  const handleSelectKeyword = (kw: string) => {
    onKeywordChange(kw);
  };

  return (
    <div
      className="pointer-events-auto absolute left-4 top-4 z-30 flex w-[370px] max-w-[calc(100vw-2rem)] flex-col gap-2.5"
      role="region"
      aria-label="Edit Scan Details"
    >
      {/* Target Business Card */}
      <div className="rounded-none border border-zinc-800 bg-zinc-950/95 p-3 text-zinc-100 shadow-2xl backdrop-blur">
        <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-1.5 text-base font-semibold text-zinc-100">
            <MapPin className="h-4 w-4 text-primary" aria-hidden />
            <span>Target Business</span>
          </div>
          <span className="rounded-none border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            Local Pack
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-base font-bold text-zinc-100">{businessName}</span>
            {cid ? (
              <span className="shrink-0 text-xs font-mono text-zinc-200 tabular-nums">
                CID: {cid.slice(-6)}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 text-base text-zinc-100">
            <Phone className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{phone || (resolvingBusiness ? "Loading…" : "—")}</span>
          </div>

          <div className="flex items-start gap-1.5 text-base text-zinc-100">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" aria-hidden />
            <span className="line-clamp-2 leading-tight">
              {address || (resolvingBusiness ? "Loading…" : "—")}
            </span>
          </div>

          {primaryCategory ? (
            <div className="flex items-center gap-1.5 border-t border-zinc-800 pt-1.5 mt-1.5 text-base text-zinc-100">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span className="truncate">{primaryCategory}</span>
            </div>
          ) : null}

          {onCenterOnBusiness ? (
            <button
              type="button"
              onClick={onCenterOnBusiness}
              disabled={resolvingBusiness}
              className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-none border border-zinc-700 bg-zinc-900 text-base font-medium text-zinc-100 hover:bg-zinc-800 disabled:opacity-40"
            >
              <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
              Snap grid to business
            </button>
          ) : null}
        </div>
      </div>

      {/* Settings Card */}
      <div className="rounded-none border border-zinc-800 bg-zinc-950/95 p-3 text-zinc-100 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-1.5 text-base font-semibold text-zinc-100">
            <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden />
            <span>Settings</span>
          </div>
          <button
            type="button"
            onClick={() => setSettingsCollapsed((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100"
          >
            <span>{settingsCollapsed ? "Show" : "Hide"}</span>
            {settingsCollapsed ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </div>

        {!settingsCollapsed && (
          <div className="mt-2.5 space-y-3">
            {/* Keywords Section */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-200">
                  Keywords ({keywordList.length})
                </span>
                <span className="text-xs text-primary font-medium flex items-center gap-1">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Auto Generate
                </span>
              </div>

              {/* Keyword Chips */}
              <div className="flex flex-wrap gap-1.5 rounded-none border border-zinc-800 bg-zinc-900/60 p-2 min-h-[3rem]">
                {keywordList.map((kw) => {
                  const isSelected = kw === keyword;
                  return (
                    <span
                      key={kw}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-none border px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer",
                        isSelected
                          ? "border-primary bg-primary/20 text-primary font-semibold"
                          : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600",
                      )}
                      onClick={() => handleSelectKeyword(kw)}
                    >
                      <Check className="h-3 w-3 text-primary shrink-0" aria-hidden />
                      <span className="max-w-[170px] truncate">{kw}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveKeyword(kw);
                        }}
                        className="text-zinc-400 hover:text-red-400"
                        aria-label={`Remove ${kw}`}
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    </span>
                  );
                })}

                <div className="flex w-full items-center gap-1 mt-1 pt-1 border-t border-zinc-800/80">
                  <input
                    type="text"
                    value={newKeywordInput}
                    placeholder="Add search keyword..."
                    onChange={(e) => setNewKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                    className="h-7 flex-1 rounded-none border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    disabled={!newKeywordInput.trim()}
                    className="h-7 rounded-none bg-zinc-800 px-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Map Grid Section */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-200">Map Grid</span>
                <div className="flex items-center rounded-none border border-zinc-800 bg-zinc-900 p-0.5">
                  <button
                    type="button"
                    onClick={() => onDistanceMeasureChange("kilometer")}
                    className={cn(
                      "px-2 py-0.5 text-xs font-medium rounded-none transition-colors",
                      distanceMeasure === "kilometer"
                        ? "bg-primary text-black font-semibold"
                        : "text-zinc-400 hover:text-zinc-200",
                    )}
                  >
                    km
                  </button>
                  <button
                    type="button"
                    onClick={() => onDistanceMeasureChange("mile")}
                    className={cn(
                      "px-2 py-0.5 text-xs font-medium rounded-none transition-colors",
                      distanceMeasure === "mile"
                        ? "bg-primary text-black font-semibold"
                        : "text-zinc-400 hover:text-zinc-200",
                    )}
                  >
                    mi
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {/* Shape Selector */}
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-0.5">Shape</label>
                  <select
                    value={shape}
                    onChange={(e) => onShapeChange(e.target.value as LocalGridShape)}
                    className="h-8 w-full rounded-none border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {LOCAL_GRID_SHAPES.map((s) => (
                      <option key={s} value={s} className="bg-zinc-900 text-zinc-100 capitalize">
                        {s === "circle" ? "Circle" : "Square"}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Size / Pin Count */}
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-0.5">Pins</label>
                  <select
                    value={scanSize}
                    onChange={(e) => onScanSizeChange(e.target.value as LocalGridScanSize)}
                    className="h-8 w-full rounded-none border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
                  >
                    {LOCAL_GRID_SCAN_SIZES.map((sz) => (
                      <option key={sz} value={sz} className="bg-zinc-900 text-zinc-100">
                        {GRID_SIZE_LABELS[sz]?.label ?? sz}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Step Distance */}
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-0.5">Distance</label>
                  <select
                    value={String(distance)}
                    onChange={(e) => onDistanceChange(parseFloat(e.target.value))}
                    className="h-8 w-full rounded-none border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
                  >
                    {LOCAL_GRID_STEP_DISTANCES.map((d) => (
                      <option key={d} value={String(d)} className="bg-zinc-900 text-zinc-100">
                        {d} {distanceMeasure === "mile" ? "mi" : "km"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-2 text-base text-zinc-300">
                Footprint: <strong className="text-zinc-100">{plannedPinCount} Pins</strong>{" "}
                on a mile/km grid. Drag the center <strong className="text-zinc-100">X</strong> only,
                or use Snap grid to business.
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center gap-2 border-t border-zinc-800 pt-2.5">
              <button
                type="button"
                onClick={onSave}
                className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-none bg-primary px-3 text-xs font-semibold text-black shadow-none hover:bg-[#92cf00]"
              >
                <Save className="h-3.5 w-3.5" aria-hidden />
                <span>Save</span>
              </button>

              <button
                type="button"
                disabled={scanning || !keyword.trim()}
                onClick={onRunScan}
                className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-none bg-primary px-3 text-xs font-semibold text-black shadow-none hover:bg-[#92cf00] disabled:opacity-40"
              >
                {scanning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-black" aria-hidden />
                )}
                <span>{scanning ? "Running…" : "Run Now"}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-none border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white"
                title="Close Edit Screen"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
