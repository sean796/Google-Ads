import { Download, Sparkles, Square, Trash2 } from "lucide-react";
import { Button, Field, FilterRow, FilterRowDivider } from "@/ui";
import { ContentCreatorToolbarCsvMenu } from "@/components/social/content-creator/ContentCreatorToolbarCsvMenu";
import { OverviewContentSortControls } from "@/components/overview/overview-tab/OverviewContentSortControls";
import {
  clampContentPostCount,
  CONTENT_POST_COUNT_MAX,
  CONTENT_POST_COUNT_MIN,
  type ContentCreatorGenerateConfig,
} from "@/lib/social/content-creator-types";
import type { ContentCreatorWorkspaceController } from "@/hooks/social/use-content-creator-workspace";

export type ContentCreatorGenerateToolbarProps = {
  ctrl: ContentCreatorWorkspaceController;
  disabled?: boolean;
};

export function ContentCreatorGenerateToolbar({ ctrl, disabled = false }: ContentCreatorGenerateToolbarProps) {
  const {
    generateConfig,
    setGenerateConfig,
    handleGenerateRows,
    handleCancelGenerate,
    handleImportCsv,
    handleClearAllRows,
    handleExportCsv,
    canExportCsv,
    isGenerating,
    sortColumn,
    setSortColumn,
    sortDir,
    setSortDir,
    displayRows,
  } = ctrl;
  const configToolbarDisabled = disabled || isGenerating;

  const patchConfig = (patch: Partial<ContentCreatorGenerateConfig>) => {
    setGenerateConfig((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
      <Field
        type="number"
        size="count"
        placeholder="Posts"
        aria-label="Posts to generate"
        min={CONTENT_POST_COUNT_MIN}
        max={CONTENT_POST_COUNT_MAX}
        value={generateConfig.postCount}
        disabled={configToolbarDisabled}
        onChange={(e) =>
          patchConfig({
            postCount: clampContentPostCount(Number(e.target.value) || CONTENT_POST_COUNT_MIN),
          })
        }
      />

      <FilterRowDivider />

      <ContentCreatorToolbarCsvMenu disabled={configToolbarDisabled} onImportCsv={handleImportCsv} />

      <FilterRow align="end">
        <OverviewContentSortControls
          sortColumn={sortColumn}
          sortDir={sortDir}
          setSortColumn={setSortColumn}
          setSortDir={setSortDir}
          disabled={disabled || displayRows.length === 0}
          titleSortLabel="Keyword"
          showDateSort={false}
        />
        <FilterRowDivider />
        <Button
          variant="tool"
          size="icon"
          icon={Trash2}
          disabled={configToolbarDisabled}
          aria-label="Clear all posts"
          title="Clear all posts"
          onClick={handleClearAllRows}
        />
        <Button
          variant="tool"
          size="icon"
          icon={Download}
          disabled={disabled || !canExportCsv}
          aria-label="Export calendar CSV"
          title="Export calendar CSV"
          onClick={handleExportCsv}
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
          onClick={() => void handleGenerateRows()}
        >
          Generate
        </Button>
      </FilterRow>
    </div>
  );
}
