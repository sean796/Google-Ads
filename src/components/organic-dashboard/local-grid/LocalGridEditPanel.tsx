import { useState } from "react";
import {
  Building2,
  MapPin,
  Phone,
  Play,
  Save,
  SlidersHorizontal,
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
import { ActionButton, Button, Field, Pill, SelectField } from "@/ui";

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

const TOGGLE_STATES = ["Hide", "Show"] as const;
const RUN_STATES = ["Run Now", "Running"] as const;
const SHAPE_OPTIONS = LOCAL_GRID_SHAPES.map((s) => ({ value: s, label: s === "circle" ? "Circle" : "Square" }));
const PIN_OPTIONS = LOCAL_GRID_SCAN_SIZES.map((sz) => ({ value: sz, label: GRID_SIZE_LABELS[sz]?.label ?? sz }));

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

  const distanceOptions = LOCAL_GRID_STEP_DISTANCES.map((d) => ({
    value: String(d),
    label: `${d} ${distanceMeasure === "mile" ? "mi" : "km"}`,
  }));

  return (
    <div
      className="pointer-events-auto absolute left-4 top-4 z-30 flex w-[370px] max-w-[calc(100vw-2rem)] flex-col gap-2.5"
      role="region"
      aria-label="Edit Scan Details"
    >
      <div className="flex flex-col gap-2 bg-black p-3 text-foreground shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-base font-semibold">
            <MapPin className="h-4 w-4 text-primary" aria-hidden />
            <span>Target Business</span>
          </div>
          <span className="bg-ui-field px-2 py-0.5 text-base font-semibold text-primary">Local Pack</span>
        </div>

        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 break-words text-base font-bold">{businessName}</span>
          {cid ? (
            <span className="shrink-0 font-mono text-base tabular-nums">CID: {cid.slice(-6)}</span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 text-base">
          <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 break-words">{phone || (resolvingBusiness ? "Loading" : "-")}</span>
        </div>

        <div className="flex items-start gap-1.5 text-base">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 break-words leading-tight">
            {address || (resolvingBusiness ? "Loading" : "-")}
          </span>
        </div>

        {primaryCategory ? (
          <div className="flex items-center gap-1.5 text-base">
            <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 break-words">{primaryCategory}</span>
          </div>
        ) : null}

        {onCenterOnBusiness ? (
          <Button icon={MapPin} disabled={resolvingBusiness} onClick={onCenterOnBusiness}>
            Snap grid to business
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5 bg-black p-3 text-foreground shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-base font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden />
            <span>Settings</span>
          </div>
          <ActionButton
            variant="tool"
            states={TOGGLE_STATES}
            state={settingsCollapsed ? "Show" : "Hide"}
            onClick={() => setSettingsCollapsed((prev) => !prev)}
          />
        </div>

        {!settingsCollapsed && (
          <>
            <p className="text-base font-semibold">Keywords ({keywordList.length})</p>
            <div className="flex min-h-[3rem] flex-wrap items-center gap-1.5 bg-ui-field p-2">
              {keywordList.map((kw) => (
                <span key={kw} className="inline-flex items-center gap-0.5">
                  <Pill square label={kw} active={kw === keyword} onClick={() => handleSelectKeyword(kw)} />
                  <Button
                    size="icon"
                    icon={X}
                    aria-label={`Remove ${kw}`}
                    onClick={() => handleRemoveKeyword(kw)}
                  />
                </span>
              ))}
              <div className="flex w-full items-center gap-1">
                <Field
                  type="text"
                  value={newKeywordInput}
                  placeholder="Add search keyword"
                  onChange={(e) => setNewKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddKeyword();
                    }
                  }}
                />
                <Button disabled={!newKeywordInput.trim()} onClick={handleAddKeyword}>
                  Add
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-base font-semibold">Map Grid</span>
              <div className="flex items-center gap-1">
                <Pill square label="km" active={distanceMeasure === "kilometer"} onClick={() => onDistanceMeasureChange("kilometer")} />
                <Pill square label="mi" active={distanceMeasure === "mile"} onClick={() => onDistanceMeasureChange("mile")} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <SelectField
                placeholder="Shape"
                width="full"
                value={shape}
                options={SHAPE_OPTIONS}
                onValueChange={(v) => onShapeChange(v as LocalGridShape)}
              />
              <SelectField
                placeholder="Pins"
                width="full"
                value={scanSize}
                options={PIN_OPTIONS}
                onValueChange={(v) => onScanSizeChange(v as LocalGridScanSize)}
              />
              <SelectField
                placeholder="Distance"
                width="full"
                value={String(distance)}
                options={distanceOptions}
                onValueChange={(v) => onDistanceChange(parseFloat(v))}
              />
            </div>

            <p className="text-base text-muted-foreground">
              Footprint: <strong className="text-foreground">{plannedPinCount} Pins</strong> on a mile/km grid. Drag
              the center <strong className="text-foreground">X</strong> only, or use Snap grid to business.
            </p>

            <div className="flex items-center gap-2">
              <Button variant="run" icon={Save} onClick={onSave}>
                Save
              </Button>
              <ActionButton
                icon={Play}
                states={RUN_STATES}
                state={scanning ? "Running" : "Run Now"}
                disabled={scanning || !keyword.trim()}
                onClick={onRunScan}
              />
              <Button onClick={onClose}>Close</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}