

import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { patchRowForNewFocusKeyword } from "@/components/overview/overview-meta-row-patches";
import { normalizeFocusKeywordPhrase } from "@/lib/pulse-redirect-redirect-csv";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_URL_COPIED_TO_CLIPBOARD } from "@/lib/notify-messages";
import { Wand2, RefreshCw, Upload as UploadIcon, FileDown, Copy, CheckCircle2, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { overviewRowUrlPathLabel } from "@/lib/overview/overview-tab-display";
import { DASHBOARD_LIST_CHECKBOX_CLASS } from "@/components/shared/workspace-checkbox-styles";
import { MetaFieldEndRail } from "@/components/overview/MetaOptimizerRowParts";
import { zoneTop } from "@/components/overview/meta-optimizer-row-constants";
import { Button, Field, Checkbox } from "@/ui";
import { downloadOverviewRedirectCsv, overviewRedirectCsvFilename } from "@/lib/overview/overview-redirect-row";
import type { MetaRowDetailsCtx } from "@/components/overview/use-meta-row-details-state";

export function MetaRowTopZone({ s }: { s: MetaRowDetailsCtx }) {
  const {
    row,
    index,
    site,
    sitemapSource,
    updateRow,
    handleAiUrlRow,
    handleScrapeRow,
    handleUpdateWordPressForRow,
    handleAiKeywordRow,
    placeholder,
    accordionBody,
    isSelected,
    onToggleSelect,
    onCollapse,
    shellOnly,
    suggestedFullUrl,
    keywordUrlAlreadyOptimized,
    titleReadOnly,
    redirectRow,
  } = s;
  return (
    <div className={zoneTop} role="region" aria-label="Page URL, focus keyword, and research">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div
            className={cn(
              "flex min-w-0 items-center gap-1",
              accordionBody && onCollapse && "cursor-pointer",
            )}
            onClick={(e) => {
              if (!accordionBody || !onCollapse) return;
              if ((e.target as HTMLElement).closest("a, button, [role='checkbox']")) return;
              onCollapse();
            }}
            onKeyDown={(e) => {
              if (!accordionBody || !onCollapse) return;
              if ((e.target as HTMLElement).closest("[role='checkbox']")) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onCollapse();
              }
            }}
            role={accordionBody && onCollapse ? "button" : undefined}
            tabIndex={accordionBody && onCollapse ? 0 : undefined}
            aria-label={accordionBody && onCollapse ? "Collapse row" : undefined}
          >
            {onToggleSelect && !shellOnly ? (
              <Checkbox
                checked={isSelected}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleSelect(e.shiftKey);
                }}
                aria-label="Select row"
                className={DASHBOARD_LIST_CHECKBOX_CLASS}
              />
            ) : null}
            {keywordUrlAlreadyOptimized && !shellOnly ? (
              <span className="shrink-0" title="URL matches keyword" aria-label="URL matches keyword">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary/90" aria-hidden />
              </span>
            ) : null}
            {shellOnly ? (
              <Field
                readOnly
                value=""
                tabIndex={-1}
                placeholder="Page URL"
                aria-label="Page URL"
              />
            ) : (
              <span className="min-w-0 flex-1 overflow-hidden">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block max-w-full break-words text-base leading-tight text-foreground hover:text-semantic-analysis-foreground hover:underline"
                  title={row.url}
                  onClick={(e) => e.stopPropagation()}
                >
                  {overviewRowUrlPathLabel(row.url, { source: sitemapSource })}
                </a>
              </span>
            )}
            <Button
              type="button"
              disabled={shellOnly}
              onClick={() => void handleAiUrlRow(index)}
              title={
                keywordUrlAlreadyOptimized
                  ? "Last URL segment matches focus keyword slug - click to clear suggested path"
                  : "Suggested path from focus keyword"
              }
            >
              {row.status === "ai-url" ? (
                null
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          {row.aiSuggestedPath ? (
            <div className="space-y-0.5 text-base text-muted-foreground">
              <p>
                <span className="text-semantic-analysis-foreground/90">{row.aiSuggestedPath}</span>
              </p>
              {suggestedFullUrl ? <p className="break-all text-base text-muted-foreground">{suggestedFullUrl}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <Button
            size="icon" icon={Copy} aria-label="Copy URL"
            type="button"
            disabled={shellOnly}
            onClick={() => {
              if (shellOnly) return;
              navigator.clipboard.writeText(row.url);
              notify.success(NOTIFY_URL_COPIED_TO_CLIPBOARD);
            }}
            title="Copy URL"
          ></Button>
          <Button
            type="button"
            disabled={shellOnly || row.status === "uploading"}
            onClick={() => void handleScrapeRow(index)}
          >
            {row.status === "scraping" ? (
              null
            ) : (
              <RefreshCw className="mr-1 h-3 w-3 shrink-0 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
            )}
            Scrape
          </Button>
          <Button
            type="button"
            disabled={shellOnly || !redirectRow}
            title="Download NEO Pulse redirect redirect CSV for this URL change"
            onClick={() => {
              if (!redirectRow) return;
              downloadOverviewRedirectCsv([redirectRow], overviewRedirectCsvFilename(row));
            }}
          >
            <FileDown className="mr-1 h-3 w-3 shrink-0 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
            Redirect
          </Button>
          <Button
            type="button"
            disabled={shellOnly || !site || row.status === "uploading"}
            onClick={() => void handleUpdateWordPressForRow(row, { rowIndex: index })}
          >
            {row.status === "uploading" ? (
              null
            ) : (
              <UploadIcon className="mr-1 h-3 w-3 shrink-0 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
            )}
            Update WP
          </Button>
          {accordionBody && onCollapse ? (
            <Button
              size="icon" icon={ChevronUp}
              type="button"
              onClick={() => onCollapse()}
              title="Collapse row"
              aria-label="Collapse row"
            ></Button>
          ) : null}
        </div>
      </div>

      <div className="flex w-full min-w-0 items-center gap-1.5 pt-2">
        <label htmlFor={`meta-focus-kw-${index}`} className="sr-only">
          Focus keyword
        </label>
        <div className="relative min-w-0 flex-1">
          <Field
            id={`meta-focus-kw-${index}`}
            value={row.focusKeyword || ""}
            onChange={(e) => updateRow(index, { focusKeyword: e.target.value })}
            onBlur={(e) => {
              const kw = normalizeFocusKeywordPhrase(e.target.value);
              if (!kw) return;
              const patched = patchRowForNewFocusKeyword(row, kw);
              const patch: Partial<OverviewRow> = {};
              if (patched.focusKeyword !== row.focusKeyword) {
                patch.focusKeyword = patched.focusKeyword;
              }
              if (!titleReadOnly) {
                if (patched.title !== row.title) patch.title = patched.title;
                if (patched.aiTitle !== row.aiTitle) patch.aiTitle = patched.aiTitle;
              }
              if (patched.metaDescription !== row.metaDescription) {
                patch.metaDescription = patched.metaDescription;
              }
              if (patched.aiMeta !== row.aiMeta) patch.aiMeta = patched.aiMeta;
              if (Object.keys(patch).length > 0) updateRow(index, patch);
            }}
            placeholder="Focus keyword (auto-filled by Research)"
            readOnly={shellOnly}
          />
          {!shellOnly ? (
            <MetaFieldEndRail align="center">
              <Button
                variant="quiet"
                type="button"
                title="AI focus keyword"
                onClick={() => void handleAiKeywordRow(index)}
              >
                {row.status === "ai-focus-kw" ? (
                  null
                ) : (
                  <Wand2 className="h-4 w-4 shrink-0 text-primary" />
                )}
              </Button>
            </MetaFieldEndRail>
          ) : null}
        </div>
      </div>
      </div>
  );
}
