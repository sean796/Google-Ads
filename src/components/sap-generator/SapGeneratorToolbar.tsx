import { useRef } from "react";
import { Trash2, Upload, Wand2 } from "lucide-react";
import { Button, Field, Pill, SelectField, FileInput } from "@/ui";
import { GeneratorToolbarFrame } from "@/components/blog-generator/GeneratorToolbarFrame";
import {
  entityTypeShortLabel,
  entityTypesForLevel,
  type EntityGeographicLevel,
} from "@/lib/entity-geographic-level";
import { normalizeEntityCountInputChange } from "@/lib/local-analysis/entity-ad-group-budget";

const ENTITY_TYPE_NONE = "__none__";

export type SapGeneratorToolbarProps = {
  workspaceBusy: boolean;
  csvParsing: boolean;
  uploadLabel: string;
  entityTotalCountInput: string;
  onEntityTotalCountInputChange: (v: string) => void;
  suggestFocusKeyword: string;
  onSuggestFocusKeywordChange: (v: string) => void;
  suggestFocusLocation: string;
  onSuggestFocusLocationChange: (v: string) => void;
  runLoading: boolean;
  onPickFile: (file: File | null) => void;
  onRunClusters: () => void;
  onClear: () => void;
  entityGeographicLevel: EntityGeographicLevel;
  entityTypeFocus: string[];
  onEntityTypeFocusChange: (focus: string[]) => void;
  hasSapRowsForCsv: boolean;
  onDownloadTargetsCsv: () => void;
  showTempUrl?: boolean;
  tempSeedUrl?: string;
  onTempSeedUrlChange?: (v: string) => void;
  showBlindMagicKeywords?: boolean;
  useBlindMagicKeywords?: boolean;
  onUseBlindMagicKeywordsChange?: (v: boolean) => void;
  onApplyRemainingEntityCount: () => void;
};

export function SapGeneratorToolbar({
  workspaceBusy,
  csvParsing,
  uploadLabel,
  entityTotalCountInput,
  onEntityTotalCountInputChange,
  suggestFocusKeyword,
  onSuggestFocusKeywordChange,
  suggestFocusLocation,
  onSuggestFocusLocationChange,
  runLoading,
  onPickFile,
  onRunClusters,
  onClear,
  entityGeographicLevel,
  entityTypeFocus,
  onEntityTypeFocusChange,
  hasSapRowsForCsv,
  onDownloadTargetsCsv,
  showTempUrl = false,
  tempSeedUrl = "",
  onTempSeedUrlChange,
  showBlindMagicKeywords = false,
  useBlindMagicKeywords = false,
  onUseBlindMagicKeywordsChange,
  onApplyRemainingEntityCount,
}: SapGeneratorToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const fieldsDisabled = workspaceBusy || runLoading;
  const focusSelectValue =
    entityTypeFocus.find((t) => entityTypesForLevel(entityGeographicLevel).includes(t)) ?? "";
  const gridUploaded = uploadLabel.trim().length > 0;

  return (
    <GeneratorToolbarFrame
      primary={
        <>
          <FileInput
            ref={fileRef}
            accept=".csv,text/csv"
            onChange={(e) => {
              onPickFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          {showTempUrl && onTempSeedUrlChange ? (
            <Field
              type="url"
              size="url"
              placeholder="https://example.com"
              aria-label="Website URL"
              value={tempSeedUrl}
              onChange={(e) => onTempSeedUrlChange(e.target.value)}
              disabled={workspaceBusy}
            />
          ) : null}
          <Button
            variant={gridUploaded ? "ready" : "tool"}
            icon={Upload}
            disabled={workspaceBusy || csvParsing}
            onClick={() => fileRef.current?.click()}
            aria-label={gridUploaded ? `Grid CSV: ${uploadLabel}` : "Upload grid CSV"}
            title={uploadLabel.trim() || "Upload grid CSV"}
          >
            Grid
          </Button>
          <Field
            size="keyword"
            placeholder="Keyword"
            value={suggestFocusKeyword}
            onChange={(e) => onSuggestFocusKeywordChange(e.target.value)}
            disabled={fieldsDisabled}
            autoComplete="off"
          />
          <Field
            size="keyword"
            placeholder="Location"
            value={suggestFocusLocation}
            onChange={(e) => onSuggestFocusLocationChange(e.target.value)}
            disabled={fieldsDisabled}
            autoComplete="off"
          />
          <Button
            variant="tool"
            size="icon"
            icon={Wand2}
            disabled={fieldsDisabled}
            aria-label="Apply remaining entity count for this period"
            title="Sets entity count to period target minus published this period (manual, no AI)."
            onClick={onApplyRemainingEntityCount}
          />
          <Field
            size="short"
            type="text"
            inputMode="numeric"
            placeholder=""
            aria-label="Entity count"
            title="Entity count"
            value={entityTotalCountInput}
            onChange={(e) =>
              onEntityTotalCountInputChange(normalizeEntityCountInputChange(e.target.value))
            }
            disabled={fieldsDisabled}
            autoComplete="off"
            maxLength={3}
          />
        </>
      }
      options={
        <>
          {showBlindMagicKeywords && onUseBlindMagicKeywordsChange ? (
            <Pill
              label="Blind Magic"
              square
              active={useBlindMagicKeywords}
              disabled={workspaceBusy}
              onClick={() => onUseBlindMagicKeywordsChange(!useBlindMagicKeywords)}
            />
          ) : null}
          <SelectField
            placeholder="Entity type"
            width="sm"
            value={focusSelectValue}
            onValueChange={(v) => onEntityTypeFocusChange(v === ENTITY_TYPE_NONE ? [] : [v])}
            disabled={fieldsDisabled}
            options={[
              { value: ENTITY_TYPE_NONE, label: "None" },
              ...entityTypesForLevel(entityGeographicLevel).map((label) => ({
                value: label,
                label: entityTypeShortLabel(entityGeographicLevel, label),
              })),
            ]}
          />
        </>
      }
      actions={
        <>
          <Button
            variant="run"
            icon={Wand2}
            disabled={fieldsDisabled}
            aria-busy={runLoading}
            aria-label="Run clusters"
            title="Run clusters"
            onClick={() => void onRunClusters()}
          >
            Clusters
          </Button>
          <Button
            variant="tool"
            disabled={!hasSapRowsForCsv || workspaceBusy}
            aria-label="Download bulk CSV"
            title="Download bulk CSV (bulk-auto-generate-template columns)"
            onClick={onDownloadTargetsCsv}
          >
            Bulk CSV
          </Button>
          <Button
            variant="danger"
            size="icon"
            icon={Trash2}
            disabled={workspaceBusy}
            aria-label="Clear"
            title="Clear"
            onClick={onClear}
          />
        </>
      }
    />
  );
}
