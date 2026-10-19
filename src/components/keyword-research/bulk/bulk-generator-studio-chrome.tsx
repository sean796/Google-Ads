import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GeneratorToolbarFrame } from "@/components/blog-generator/GeneratorToolbarFrame";
import {
  GENERATOR_SELECT,
  GENERATOR_STUDIO_BAND2_TOOLBAR_CLASS,
} from "@/components/blog-generator/generator-toolbar-theme";
import { BulkGeneratorRunActions } from "@/components/keyword-research/bulk/BulkGeneratorRunActions";
import {
  BULK_HEADER_FIELD,
  BULK_HEADER_ICON_TOOL_BTN,
  BULK_HEADER_SELECT_TRIGGER,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { BulkGeneratorStudioVariant } from "@/lib/bulk/bulk-generator-studio-rows";
import type { BlogImportFeaturedImage } from "@/lib/bulk/blog-import-parser";
import type { WordPressPostDestination } from "@/lib/bulk-auto-generate";
import { WORDPRESS_POST_DESTINATION_SHORT } from "@/lib/bulk-auto-generate";
import { cn } from "@/lib/utils";

export function bulkGeneratorDetailsPanelId(variant: BulkGeneratorStudioVariant): string {
  if (variant === "prompt") return "bulk-prompt-details-panel";
  if (variant === "blog-import") return "blog-import-details-panel";
  return "bulk-csv-details-panel";
}

type FeaturedImageMode = "off" | "ai-generated" | "google-maps";

export type BulkPromptDockToolbarProps = {
  workspaceBusy: boolean;
  isProcessing: boolean;
  featuredImagePerBlog: boolean;
  onFeaturedImagePerBlogChange: (v: boolean) => void;
  featuredImageType: "ai-generated" | "google-maps";
  onFeaturedImageTypeChange: (v: "ai-generated" | "google-maps") => void;
  postDestination: WordPressPostDestination;
  onPostDestinationChange: (v: WordPressPostDestination) => void;
  postDestinationChoices: WordPressPostDestination[];
  onCancel: () => void;
  onClear: () => void;
  scheduleMenu?: ReactNode;
};

export function BulkPromptDockToolbar({
  workspaceBusy,
  isProcessing,
  featuredImagePerBlog,
  onFeaturedImagePerBlogChange,
  featuredImageType,
  onFeaturedImageTypeChange,
  postDestination,
  onPostDestinationChange,
  postDestinationChoices,
  onCancel,
  onClear,
  scheduleMenu,
}: BulkPromptDockToolbarProps) {
  const featuredImageMode: FeaturedImageMode = featuredImagePerBlog ? featuredImageType : "off";

  const handleFeaturedImageMode = (value: FeaturedImageMode) => {
    if (value === "off") {
      onFeaturedImagePerBlogChange(false);
      return;
    }
    onFeaturedImagePerBlogChange(true);
    onFeaturedImageTypeChange(value);
  };

  return (
    <GeneratorToolbarFrame
      className={GENERATOR_STUDIO_BAND2_TOOLBAR_CLASS}
      options={
        <>
          <Select
            value={featuredImageMode}
            onValueChange={(v) => handleFeaturedImageMode(v as FeaturedImageMode)}
            disabled={workspaceBusy}
          >
            <SelectTrigger className={GENERATOR_SELECT} aria-label="Image">
              <SelectValue placeholder="Image" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem className="text-base" value="ai-generated">
                AI image
              </SelectItem>
              <SelectItem className="text-base" value="google-maps">
                Google Maps
              </SelectItem>
              <SelectItem className="text-base" value="off">
                None
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={postDestination}
            onValueChange={(v) => onPostDestinationChange(v as WordPressPostDestination)}
            disabled={workspaceBusy}
          >
            <SelectTrigger className={GENERATOR_SELECT} aria-label="Destination">
              <SelectValue placeholder="Destination" />
            </SelectTrigger>
            <SelectContent position="popper">
              {postDestinationChoices.map((choice) => (
                <SelectItem key={choice} className="text-base" value={choice}>
                  {WORDPRESS_POST_DESTINATION_SHORT[choice]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {scheduleMenu}
        </>
      }
      actions={
        <BulkGeneratorRunActions
          isProcessing={isProcessing}
          canRun={false}
          workspaceBusy={workspaceBusy}
          onRun={() => {}}
          onCancel={onCancel}
          onClear={onClear}
          hideRunButton
        />
      }
    />
  );
}

export type BulkCsvDockToolbarProps = {
  workspaceBusy: boolean;
  isProcessing: boolean;
  rowCount: number;
  postDestination: WordPressPostDestination;
  onPostDestinationChange: (v: WordPressPostDestination) => void;
  postDestinationChoices: WordPressPostDestination[];
  featuredImagePerBlog: boolean;
  onFeaturedImagePerBlogChange: (v: boolean) => void;
  featuredImageType: "ai-generated" | "google-maps";
  onFeaturedImageTypeChange: (v: "ai-generated" | "google-maps") => void;
  onApplyFeaturedImageToRows: (value: "y" | "n" | "google-maps") => void;
  canRun: boolean;
  onRun: () => void;
  onCancel: () => void;
  onClear: () => void;
  scheduleMenu?: ReactNode;
};

export function BulkCsvDockToolbar({
  workspaceBusy,
  isProcessing,
  rowCount,
  postDestination,
  onPostDestinationChange,
  postDestinationChoices,
  featuredImagePerBlog,
  onFeaturedImagePerBlogChange,
  featuredImageType,
  onFeaturedImageTypeChange,
  onApplyFeaturedImageToRows,
  canRun,
  onRun,
  onCancel,
  onClear,
  scheduleMenu,
}: BulkCsvDockToolbarProps) {
  const featuredImageMode = featuredImagePerBlog ? featuredImageType : "off";
  const handleFeaturedImageMode = (value: "off" | "ai-generated" | "google-maps") => {
    if (value === "off") {
      onFeaturedImagePerBlogChange(false);
      onApplyFeaturedImageToRows("n");
      return;
    }
    onFeaturedImagePerBlogChange(true);
    onFeaturedImageTypeChange(value);
    onApplyFeaturedImageToRows(value === "google-maps" ? "google-maps" : "y");
  };

  return (
    <GeneratorToolbarFrame
      className={GENERATOR_STUDIO_BAND2_TOOLBAR_CLASS}
      primary={
        <span
          className="inline-block min-w-[7ch] shrink-0 text-base text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          {rowCount > 0 ? `${rowCount} row${rowCount !== 1 ? "s" : ""}` : ""}
        </span>
      }
      options={
        <>
          <Select
            value={featuredImageMode}
            onValueChange={(v) => handleFeaturedImageMode(v as "off" | "ai-generated" | "google-maps")}
            disabled={workspaceBusy}
          >
            <SelectTrigger className={GENERATOR_SELECT} aria-label="Image">
              <SelectValue placeholder="Image" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem className="text-base" value="ai-generated">
                AI image
              </SelectItem>
              <SelectItem className="text-base" value="google-maps">
                Google Maps
              </SelectItem>
              <SelectItem className="text-base" value="off">
                None
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={postDestination}
            onValueChange={(v) => onPostDestinationChange(v as WordPressPostDestination)}
            disabled={workspaceBusy}
          >
            <SelectTrigger className={GENERATOR_SELECT} aria-label="Destination">
              <SelectValue placeholder="Destination" />
            </SelectTrigger>
            <SelectContent position="popper">
              {postDestinationChoices.map((choice) => (
                <SelectItem key={choice} className="text-base" value={choice}>
                  {WORDPRESS_POST_DESTINATION_SHORT[choice]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {scheduleMenu}
        </>
      }
      actions={
        <BulkGeneratorRunActions
          isProcessing={isProcessing}
          canRun={canRun}
          workspaceBusy={workspaceBusy}
          onRun={onRun}
          onCancel={onCancel}
          onClear={onClear}
        />
      }
    />
  );
}

export type BulkImportDockToolbarProps = {
  workspaceBusy: boolean;
  isProcessing: boolean;
  focusKeyword: string;
  onFocusKeywordChange: (v: string) => void;
  titleOverride: string;
  onTitleOverrideChange: (v: string) => void;
  featuredImageMode: BlogImportFeaturedImage;
  onFeaturedImageModeChange: (v: BlogImportFeaturedImage) => void;
  entity: string;
  onEntityChange: (v: string) => void;
  postDestination: WordPressPostDestination;
  onPostDestinationChange: (v: WordPressPostDestination) => void;
  postDestinationChoices: WordPressPostDestination[];
  canRun: boolean;
  onRun: () => void;
  onCancel: () => void;
  onClear: () => void;
  canDownloadBlog?: boolean;
  onDownloadBlog?: () => void;
  scheduleMenu?: ReactNode;
};

export function BulkImportDockToolbar({
  workspaceBusy,
  isProcessing,
  focusKeyword,
  onFocusKeywordChange,
  titleOverride,
  onTitleOverrideChange,
  featuredImageMode,
  onFeaturedImageModeChange,
  entity,
  onEntityChange,
  postDestination,
  onPostDestinationChange,
  postDestinationChoices,
  canRun,
  onRun,
  onCancel,
  onClear,
  canDownloadBlog,
  onDownloadBlog,
  scheduleMenu,
}: BulkImportDockToolbarProps) {
  const showEntity = featuredImageMode === "google-maps";
  const importFieldClass = cn(BULK_HEADER_FIELD, "h-8 w-full min-w-0 text-base");
  const importSelectClass = cn(BULK_HEADER_SELECT_TRIGGER, "h-8 min-w-0 flex-1 text-base");

  return (
    <div className="flex w-full min-w-0 flex-col">
      <div
        className="flex shrink-0 flex-col gap-1 border-b border-white/10 px-0.5 py-1.5"
        aria-label="Import keyword and title"
      >
        <Input
          type="text"
          placeholder="Keyword"
          value={focusKeyword}
          onChange={(e) => onFocusKeywordChange(e.target.value)}
          className={importFieldClass}
          disabled={workspaceBusy}
          autoComplete="off"
          aria-label="Focus keyword"
        />
        <Input
          type="text"
          placeholder="Title override"
          value={titleOverride}
          onChange={(e) => onTitleOverrideChange(e.target.value)}
          className={importFieldClass}
          disabled={workspaceBusy}
          autoComplete="off"
          aria-label="Title override"
        />
      </div>
      <GeneratorToolbarFrame
        className={cn(GENERATOR_STUDIO_BAND2_TOOLBAR_CLASS, "min-h-11 shrink-0 py-1")}
        options={
          <>
            <Select
              value={featuredImageMode}
              onValueChange={(v) => onFeaturedImageModeChange(v as BlogImportFeaturedImage)}
              disabled={workspaceBusy}
            >
              <SelectTrigger className={importSelectClass} aria-label="Image">
                <SelectValue placeholder="Image" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem className="text-base" value="y">
                  AI image
                </SelectItem>
                <SelectItem className="text-base" value="google-maps">
                  Google Maps
                </SelectItem>
                <SelectItem className="text-base" value="n">
                  None
                </SelectItem>
              </SelectContent>
            </Select>
            {showEntity ? (
              <Input
                type="text"
                placeholder="Entity"
                value={entity}
                onChange={(e) => onEntityChange(e.target.value)}
                className={cn(importFieldClass, "min-w-[5.5rem] flex-[1.2]")}
                disabled={workspaceBusy}
                autoComplete="off"
                aria-label="Entity for Google Maps"
              />
            ) : null}
            <Select
              value={postDestinationChoices.includes(postDestination) ? postDestination : ""}
              onValueChange={(v) => onPostDestinationChange(v as WordPressPostDestination)}
              disabled={workspaceBusy}
            >
              <SelectTrigger className={importSelectClass} aria-label="Destination">
                <SelectValue placeholder="Destination" />
              </SelectTrigger>
              <SelectContent position="popper">
                {postDestinationChoices.map((choice) => (
                  <SelectItem key={choice} className="text-base" value={choice}>
                    {WORDPRESS_POST_DESTINATION_SHORT[choice]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {scheduleMenu}
          </>
        }
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={BULK_HEADER_ICON_TOOL_BTN}
              disabled={!canDownloadBlog || !onDownloadBlog}
              onClick={onDownloadBlog}
              aria-label="Download blog"
              title="Download blog"
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden />
            </Button>
            <BulkGeneratorRunActions
              isProcessing={isProcessing}
              canRun={canRun}
              workspaceBusy={workspaceBusy}
              onRun={onRun}
              onCancel={onCancel}
              onClear={onClear}
            />
          </>
        }
      />
    </div>
  );
}
