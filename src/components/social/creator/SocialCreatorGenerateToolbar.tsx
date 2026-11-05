import { useState } from "react";
import { Sparkles, Square, Trash2 } from "lucide-react";
import { Button, Field, FilterRow, FilterRowDivider, Pill, SelectField } from "@/ui";
import { SocialCreatorToolbarExportMenu } from "@/components/social/creator/SocialCreatorToolbarExportMenu";
import { SocialCreatorToolbarKeywordsMenu } from "@/components/social/creator/SocialCreatorToolbarKeywordsMenu";
import { SocialCreatorWorkspaceDefaultsDialog } from "@/components/social/creator/SocialCreatorWorkspaceDefaultsDialog";
import { OverviewContentSortControls } from "@/components/overview/overview-tab/OverviewContentSortControls";
import {
  clampSocialPostCount,
  SOCIAL_POST_COUNT_MAX,
  SOCIAL_POST_COUNT_MIN,
  type MetaAdPlacement,
  type SocialGenerateConfig,
} from "@/lib/social/social-creator-types";
import { metaAdPlacementLabel } from "@/lib/social/social-creator-field-limits";
import type { SocialCreatorWorkspaceController } from "@/hooks/social/use-social-creator-workspace";

export type SocialCreatorGenerateToolbarProps = {
  ctrl: SocialCreatorWorkspaceController;
  disabled?: boolean;
};

const PLACEMENT_OPTIONS: MetaAdPlacement[] = ["feed_1x1", "feed_4x5", "story_9x16"];

const IMAGE_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;

export function SocialCreatorGenerateToolbar({ ctrl, disabled = false }: SocialCreatorGenerateToolbarProps) {
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const {
    generateConfig,
    setGenerateConfig,
    setWorkspaceVisualDefaults,
    handleGeneratePosts,
    handleCancelGenerate,
    handleImportKeywords,
    handleClearAllPosts,
    handleExportSocialCreatorCsv,
    canExportSocialCreatorCsv,
    handleExportSocialCreatorZip,
    canExportSocialCreatorZip,
    isGenerating,
    sortColumn,
    setSortColumn,
    sortDir,
    setSortDir,
    displayPosts,
  } = ctrl;
  const configToolbarDisabled = disabled || isGenerating;

  const patchConfig = (patch: Partial<SocialGenerateConfig>) => {
    setGenerateConfig((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
      <Field
        type="number"
        size="count"
        placeholder="Posts"
        aria-label="Posts to generate"
        min={SOCIAL_POST_COUNT_MIN}
        max={SOCIAL_POST_COUNT_MAX}
        value={generateConfig.postCount}
        disabled={configToolbarDisabled}
        onChange={(e) =>
          patchConfig({
            postCount: clampSocialPostCount(Number(e.target.value) || SOCIAL_POST_COUNT_MIN),
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

      <Pill
        label="Defaults"
        active={defaultsOpen}
        square
        disabled={configToolbarDisabled}
        onClick={() => setDefaultsOpen(true)}
      />
      <SocialCreatorWorkspaceDefaultsDialog
        open={defaultsOpen}
        onOpenChange={setDefaultsOpen}
        generateConfig={generateConfig}
        disabled={configToolbarDisabled}
        onSave={setWorkspaceVisualDefaults}
      />

      <SocialCreatorToolbarKeywordsMenu
        disabled={configToolbarDisabled}
        onImportKeywords={handleImportKeywords}
      />

      <FilterRow align="end">
        <OverviewContentSortControls
          sortColumn={sortColumn}
          sortDir={sortDir}
          setSortColumn={setSortColumn}
          setSortDir={setSortDir}
          disabled={disabled || displayPosts.length === 0}
          titleSortLabel="Keyword"
        />
        <FilterRowDivider />
        <Button
          variant="tool"
          size="icon"
          icon={Trash2}
          disabled={configToolbarDisabled}
          aria-label="Clear all posts"
          title="Clear all posts"
          onClick={handleClearAllPosts}
        />
        <SocialCreatorToolbarExportMenu
          disabled={disabled}
          canExportCsv={canExportSocialCreatorCsv}
          canExportZip={canExportSocialCreatorZip}
          onExportCsv={handleExportSocialCreatorCsv}
          onExportZip={handleExportSocialCreatorZip}
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
          onClick={() => void handleGeneratePosts()}
        >
          Generate
        </Button>
      </FilterRow>
    </div>
  );
}
