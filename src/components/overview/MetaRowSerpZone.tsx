

import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { resolveMcpToolUrl } from "@/lib/mcp-tools";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { Wand2, RefreshCw, Search, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { overviewTitlePrimarySegment } from "@/lib/overview/overview-tab-display";
import { MetaAccordionStripeRow, MetaFieldEndRail } from "@/components/overview/MetaOptimizerRowParts";
import { META_FIELD_COUNT, META_FIELD_END_RAIL, META_FIELD_END_RAIL_CELL, zoneSerp } from "@/components/overview/meta-optimizer-row-constants";
import { Button, Field, TextareaField, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui";
import type { MetaRowDetailsCtx } from "@/components/overview/use-meta-row-details-state";

export function MetaRowSerpZone({ s }: { s: MetaRowDetailsCtx }) {
  const {
    row,
    index,
    opt,
    metaOptimizerPipelineBusy,
    expandedResearchBriefUrl,
    setExpandedResearchBriefUrl,
    updateRow,
    handleDataForSeoResearch,
    handleOptimizeAllSerpRow,
    handleAiAllMetaRow,
    handleAiTitleRow,
    handleAiMetaRow,
    handleSetDateToday,
    commitRowDateModifier,
    placeholder,
    shellOnly,
    briefJsonCharCount,
    titleReadOnly,
  } = s;
  return (
    <>
      <div className={zoneSerp} role="region" aria-label="SERP">
        <div className="flex w-full min-w-0">
          <div className="relative min-w-0 flex-1">
            <Field
              id={`meta-opt-title-${index}`}
              value={overviewTitlePrimarySegment(row.title)}
              readOnly={shellOnly || titleReadOnly}
              onChange={(e) => {
                if (titleReadOnly) return;
                updateRow(index, { title: overviewTitlePrimarySegment(e.target.value) });
              }}
              placeholder="Page title"
              aria-label={titleReadOnly ? "Page title (read-only)" : "Page title"}
            />
            <MetaFieldEndRail align="center">
              <span
                className={cn(
                  META_FIELD_COUNT,
                  META_FIELD_END_RAIL_CELL,
                  "min-w-[2.25rem] tabular-nums",
                  titleReadOnly && "text-muted-foreground",
                )}
                title="Characters"
                aria-hidden
              >
                {overviewTitlePrimarySegment(row.title).length}
              </span>
              {!titleReadOnly && !shellOnly ? (
                <Button
                  variant="quiet"
                  type="button"
                  title="AI title"
                  onClick={() => void handleAiTitleRow(index)}
                >
                  {row.status === "ai-title" ? (
                    null
                  ) : (
                    <Wand2 className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </Button>
              ) : null}
            </MetaFieldEndRail>
          </div>
        </div>

        <div className="flex w-full min-w-0">
          <div className="relative min-w-0 flex-1">
            <TextareaField
              id={`meta-opt-meta-${index}`}
              value={row.metaDescription ?? ""}
              onChange={(e) => updateRow(index, { metaDescription: e.target.value })}
              rows={3}
              placeholder="Meta description"
              aria-label="Meta description"
              readOnly={shellOnly}
            />
            <MetaFieldEndRail align="top">
              <span
                className={cn(META_FIELD_COUNT, META_FIELD_END_RAIL_CELL, "min-w-[2.25rem] tabular-nums")}
                title="Characters"
                aria-hidden
              >
                {(row.metaDescription ?? "").length}
              </span>
              <Button
                variant="quiet"
                type="button"
                title="AI meta description"
                disabled={shellOnly}
                onClick={() => void handleAiMetaRow(index)}
              >
                {row.status === "ai-meta" ? (
                  null
                ) : (
                  <Wand2 className="h-4 w-4 shrink-0 text-primary" />
                )}
              </Button>
            </MetaFieldEndRail>
          </div>
        </div>

        <div className="flex w-full min-w-0">
          <div className="relative min-w-0 flex-1">
            <Field
              value={row.dateModifier || ""}
              onChange={(e) => updateRow(index, { dateModifier: e.target.value })}
              onBlur={() => commitRowDateModifier(index)}
              placeholder="YYYY-MM-DD"
              aria-label="Date modifier"
              readOnly={shellOnly}
            />
            <MetaFieldEndRail align="center" className="right-1">
              <Button
                size="icon" icon={RefreshCw} aria-label="Today"
                variant="quiet"
                type="button"
                disabled={shellOnly}
                onClick={() => handleSetDateToday(index)}
                title="Today"
              ></Button>
            </MetaFieldEndRail>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <Button
          type="button"
          disabled={shellOnly || metaOptimizerPipelineBusy}
          onClick={() => void handleDataForSeoResearch(index)}
          title="Research SERP + GSC"
        >
          {row.status === "research-faq" ? (
            null
          ) : (
            <Search className="h-4 w-4 shrink-0" />
          )}
          <span>Research</span>
        </Button>
        <Button
          variant="run"
          type="button"
          disabled={shellOnly || metaOptimizerPipelineBusy}
          title={
            titleReadOnly
              ? "Research if needed, then AI meta → FAQs (title unchanged on pages)"
              : "Research if needed, then AI title → meta → FAQs"
          }
          onClick={() => void handleOptimizeAllSerpRow(index)}
        >
          {metaOptimizerPipelineBusy ? (
            null
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5 shrink-0" />
          )}
          Optimize all (SERP)
        </Button>
        <Button
          type="button"
          disabled={shellOnly || metaOptimizerPipelineBusy}
          title={
            titleReadOnly
              ? "AI meta and FAQs only (page title unchanged)"
              : "AI title, meta, FAQs (no AI URL)"
          }
          onClick={() => void handleAiAllMetaRow(index)}
        >
          {metaOptimizerPipelineBusy ? (
            null
          ) : (
            <Wand2 className="mr-1.5 h-3.5 w-3.5 shrink-0" />
          )}
          AI All Meta
        </Button>
      </div>

      <MetaAccordionStripeRow stripeIndex={0}>
      <Collapsible
        open={expandedResearchBriefUrl === row.url}
        onOpenChange={(open) => setExpandedResearchBriefUrl(open ? row.url : null)}
      >
        <CollapsibleTrigger asChild>
          <Button variant="quiet">
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 transition-transform",
                expandedResearchBriefUrl === row.url && "rotate-180",
              )}
            />
            <span className="min-w-0 flex-1 break-words text-left text-white">Brief JSON</span>
            <div className={cn(META_FIELD_END_RAIL, "pointer-events-none shrink-0")} aria-hidden>
              <span
                className={cn(META_FIELD_COUNT, META_FIELD_END_RAIL_CELL, "min-w-[2.25rem] tabular-nums font-semibold")}
                title="Characters in brief JSON"
              >
                {briefJsonCharCount.toLocaleString()}
              </span>
            </div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1.5">
          <div className="relative min-w-0">
            <TextareaField
              value={row.seoResearch || ""}
              onChange={(e) => updateRow(index, { seoResearch: e.target.value })}
              placeholder='{"version": 1, …}'
              aria-label="SEO research brief JSON"
            />
            <MetaFieldEndRail align="top" className="right-0.5 top-2">
              <span
                className={cn(META_FIELD_COUNT, META_FIELD_END_RAIL_CELL, "min-w-[2.5rem] tabular-nums font-semibold")}
                title="Characters in brief JSON"
                aria-hidden
              >
                {briefJsonCharCount.toLocaleString()}
              </span>
            </MetaFieldEndRail>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-wrap items-center gap-2 pb-1.5">
        {row.briefFileName && BACKEND_API_BASE ? (
          <Button
            type="button"
            title={`Download ${row.briefFileName}`}
            onClick={async () => {
              try {
                const filename = row.briefFileName as string;
                const res = await fetch(
                  `${BACKEND_API_BASE}/api/overview/seo-brief/${encodeURIComponent(filename)}`,
                  { headers: neoPulseApiHeaders() },
                );
                if (!res.ok) {
                  const text = await res.text();
                  notify.error(text || "Failed to download SEO brief.");
                  return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (err: unknown) {
                notifyHeaderError("Brief download failed", err);
              }
            }}
          >
            Brief file
          </Button>
        ) : null}
        {row.researchFileName ? (
          <Button
            type="button"
            title={`Download SERP JSON: ${row.researchFileName}`}
            onClick={async () => {
              try {
                const filename = row.researchFileName as string;
                const res = await fetch(
                  resolveMcpToolUrl(
                    `DataForSEO_serp_dump_download/${encodeURIComponent(filename)}`,
                  ),
                );
                if (!res.ok) {
                  const text = await res.text();
                  notify.error(text || "Failed to download SERP JSON.");
                  return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (err: unknown) {
                notifyHeaderError("SERP JSON download failed", err);
              }
            }}
          >
            DFS
          </Button>
        ) : null}
        {row.gscQuickWinsCsvFilename && BACKEND_API_BASE ? (
          <Button
            type="button"
            title={`Download GSC CSV: ${row.gscQuickWinsCsvFilename}`}
            onClick={async () => {
              try {
                const filename = row.gscQuickWinsCsvFilename as string;
                const res = await fetch(
                  `${BACKEND_API_BASE}/api/gsc/quick-wins-csv/${encodeURIComponent(filename)}`,
                );
                if (!res.ok) {
                  const text = await res.text();
                  notify.error(text || "Failed to download GSC CSV.");
                  return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (err: unknown) {
                notifyHeaderError("GSC CSV download failed", err);
              }
            }}
          >
            GSC
          </Button>
        ) : null}
        {row.semrushJsonFilename && BACKEND_API_BASE ? (
          <Button
            type="button"
            title={`Download Semrush JSON: ${row.semrushJsonFilename}`}
            onClick={async () => {
              try {
                const filename = row.semrushJsonFilename as string;
                const res = await fetch(
                  `${BACKEND_API_BASE}/api/semrush/overview-json/${encodeURIComponent(filename)}`,
                );
                if (!res.ok) {
                  const text = await res.text();
                  notify.error(text || "Failed to download Semrush JSON.");
                  return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (err: unknown) {
                notifyHeaderError("Semrush JSON download failed", err);
              }
            }}
          >
            SEMRUSH
          </Button>
        ) : null}
      </div>
      </MetaAccordionStripeRow>
    </>
  );
}
