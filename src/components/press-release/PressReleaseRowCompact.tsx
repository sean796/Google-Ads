import { ChevronDown } from "lucide-react";
import { BulkGeneratorRunActions } from "@/components/keyword-research/bulk/BulkGeneratorRunActions";
import { BULK_HEADER_FIELD } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_SHELL_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import {
  PressReleaseDetailsPanel,
  type PressReleaseDetailsPanelProps,
} from "@/components/press-release/PressReleaseDetailsPanel";
import { DETAILS_DRAWER_PANEL, DETAILS_DRAWER_SHELL } from "@/components/integrations/wordpress/bulk-details-drawer-styles";
import { cn } from "@/lib/utils";
import { Button, Field } from "@/ui";

const PR_ENTRY_ROW_GRID_CLASS =
  "grid w-full min-w-0 min-h-[3rem] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-center gap-x-2 sm:min-h-[3.25rem] sm:gap-x-3";

export type PressReleaseRowCompactProps =
  | {
      placeholder: true;
      stripeIndex?: number;
    }
  | {
      placeholder?: false;
      stripeIndex?: number;
      keyword: string;
      onKeywordChange: (value: string) => void;
      title: string;
      onTitleChange: (value: string) => void;
      workspaceBusy: boolean;
      isProcessing: boolean;
      canRun: boolean;
      canOpenDetails: boolean;
      detailsOpen: boolean;
      onToggleDetails: () => void;
      onRun: () => void;
      onClear: () => void;
      detailsProps: PressReleaseDetailsPanelProps;
      detailsPanelId?: string;
    };

export function PressReleaseRowCompact(props: PressReleaseRowCompactProps) {
  if (props.placeholder) {
    const stripeIndex = props.stripeIndex ?? 0;
    return (
      <div
        className={cn(contentOptimizerRowStripeClass(stripeIndex), PR_ENTRY_ROW_GRID_CLASS)}
        aria-hidden
      />
    );
  }

  const {
    keyword,
    onKeywordChange,
    title,
    onTitleChange,
    workspaceBusy,
    isProcessing,
    canRun,
    canOpenDetails,
    detailsOpen,
    onToggleDetails,
    onRun,
    onClear,
    detailsProps,
    stripeIndex = 0,
    detailsPanelId = "press-release-row-details",
  } = props;

  return (
    <div className={cn(CONTENT_OPTIMIZER_MULTI_SITE_ROW_SHELL_CLASS, "relative")}>
      <div className={cn(contentOptimizerRowStripeClass(stripeIndex), PR_ENTRY_ROW_GRID_CLASS)}>
        <Field
          type="text"
          placeholder="Keyword"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          disabled={workspaceBusy}
          autoComplete="off"
          aria-label="Keyword"
        />
        <Field
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          disabled={workspaceBusy}
          autoComplete="off"
          aria-label="Title override"
        />
        <Button
          variant="quiet"
          onClick={onToggleDetails}
          aria-expanded={detailsOpen}
          aria-controls={detailsPanelId}
          disabled={!canOpenDetails}
        >
          Details
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", detailsOpen && "rotate-180")}
            aria-hidden
          />
        </Button>
        <BulkGeneratorRunActions
          isProcessing={isProcessing}
          canRun={canRun}
          workspaceBusy={workspaceBusy}
          onRun={onRun}
          onCancel={() => {}}
          onClear={onClear}
          runLabel="Generate"
          className="flex shrink-0 flex-nowrap items-center gap-2"
        />
      </div>

      {detailsOpen && canOpenDetails ? (
        <div id={detailsPanelId} className={cn(DETAILS_DRAWER_SHELL, DETAILS_DRAWER_PANEL)}>
          <PressReleaseDetailsPanel {...detailsProps} />
        </div>
      ) : null}
    </div>
  );
}
