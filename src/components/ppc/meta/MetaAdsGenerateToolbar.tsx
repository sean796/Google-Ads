import { Sparkles, Square, Trash2 } from "lucide-react";
import { Button, Field, FilterRow, FilterRowDivider, SelectField } from "@/ui";
import { MetaAdsToolbarExportMenu } from "@/components/ppc/meta/MetaAdsToolbarExportMenu";
import { MetaAdsToolbarKeywordsMenu } from "@/components/ppc/meta/MetaAdsToolbarKeywordsMenu";
import {
  clampMetaAdCount,
  META_AD_COUNT_MAX,
  META_AD_COUNT_MIN,
  type MetaAdPlacement,
  type MetaGenerateConfig,
} from "@/lib/ppc/meta-ads-types";
import { metaAdPlacementLabel } from "@/lib/ppc/meta-ads-field-limits";
import type { PpcMetaWorkspaceController } from "@/hooks/ppc/use-ppc-meta-workspace";

export type MetaAdsGenerateToolbarProps = {
  ctrl: PpcMetaWorkspaceController;
  disabled?: boolean;
};

const PLACEMENT_OPTIONS: MetaAdPlacement[] = ["feed_1x1", "feed_4x5", "story_9x16"];

const IMAGE_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;

export function MetaAdsGenerateToolbar({ ctrl, disabled = false }: MetaAdsGenerateToolbarProps) {
  const {
    generateConfig,
    setGenerateConfig,
    handleGenerateAds,
    handleCancelGenerate,
    handleImportKeywords,
    handleClearAllAds,
    handleExportMetaAdsCsv,
    canExportMetaAdsCsv,
    handleExportMetaAdsCreativeZip,
    canExportMetaAdsCreativeZip,
    isGenerating,
  } = ctrl;
  const configToolbarDisabled = disabled || isGenerating;

  const patchConfig = (patch: Partial<MetaGenerateConfig>) => {
    setGenerateConfig((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
      <Field
        type="number"
        size="count"
        placeholder="Ads"
        aria-label="Ads to generate"
        min={META_AD_COUNT_MIN}
        max={META_AD_COUNT_MAX}
        value={generateConfig.adCount}
        disabled={configToolbarDisabled}
        onChange={(e) =>
          patchConfig({
            adCount: clampMetaAdCount(Number(e.target.value) || META_AD_COUNT_MIN),
          })
        }
      />
      <SelectField
        placeholder="Format"
        width="sm"
        value={generateConfig.placement}
        disabled={configToolbarDisabled}
        options={PLACEMENT_OPTIONS.map((placement) => ({
          value: placement,
          label: metaAdPlacementLabel(placement),
        }))}
        onValueChange={(placement) => patchConfig({ placement: placement as MetaAdPlacement })}
      />
      <SelectField
        placeholder="Image"
        width="xs"
        value={generateConfig.includeImage === false ? "off" : "on"}
        disabled={configToolbarDisabled}
        options={IMAGE_OPTIONS}
        onValueChange={(next) => patchConfig({ includeImage: next === "on" })}
      />

      <FilterRowDivider />

      <MetaAdsToolbarKeywordsMenu
        disabled={configToolbarDisabled}
        onImportKeywords={handleImportKeywords}
      />

      <FilterRow align="end">
        <Button
          variant="tool"
          size="icon"
          icon={Trash2}
          disabled={configToolbarDisabled}
          aria-label="Clear all ads"
          title="Clear all ads"
          onClick={handleClearAllAds}
        />
        <MetaAdsToolbarExportMenu
          disabled={disabled}
          canExportCsv={canExportMetaAdsCsv}
          canExportZip={canExportMetaAdsCreativeZip}
          onExportCsv={handleExportMetaAdsCsv}
          onExportZip={handleExportMetaAdsCreativeZip}
        />
        <Button
          variant="danger"
          size="icon"
          icon={Square}
          reserved={!isGenerating}
          aria-label="Cancel"
          title="Cancel"
          onClick={handleCancelGenerate}
        />
        <Button
          variant="run"
          icon={Sparkles}
          disabled={configToolbarDisabled}
          onClick={() => void handleGenerateAds()}
        >
          Generate
        </Button>
      </FilterRow>
    </div>
  );
}
