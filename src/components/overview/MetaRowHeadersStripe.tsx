

import { Wand2, ChevronDown, Heading2, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { OverviewSectionProseEditor } from "@/components/overview/OverviewSectionProseEditor";
import { patchElementorSectionKeyword } from "@/lib/elementor-page-content/elementor-section-focus-keyword";
import { ElementorSectionLinks, MetaAccordionHeaderRow, MetaAccordionStripeRow, MetaEditableListTextarea } from "@/components/overview/MetaOptimizerRowParts";
import { isVisualElementorSection, META_INPUT_SURFACE } from "@/components/overview/meta-optimizer-row-constants";
import { Button, Field, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui";
import type { MetaRowDetailsCtx } from "@/components/overview/use-meta-row-details-state";

export function MetaRowHeadersStripe({ s }: { s: MetaRowDetailsCtx }) {
  const {
    row,
    index,
    site,
    updateRow,
    handleAiHeadersRow,
    handleAiLinksRow,
    placeholder,
    shellOnly,
    isElementorRow,
    elementorHeaders,
    headerList,
    commitElementorSectionField,
    headersOpen,
    setHeadersOpen,
    headersPlanOpen,
    setHeadersPlanOpen,
    elementorLinkCount,
  } = s;
  return (
      <MetaAccordionStripeRow stripeIndex={1}>
      <Collapsible open={headersOpen} onOpenChange={setHeadersOpen}>
        <MetaAccordionHeaderRow
          open={headersOpen}
          icon={<Heading2 className="h-4 w-4 shrink-0" aria-hidden />}
          label={isElementorRow ? "Sections" : "Headers"}
          count={headerList.length.toLocaleString()}
          countTitle={
            isElementorRow
              ? `Elementor sections · ${elementorLinkCount.toLocaleString()} internal links`
              : "H2 count"
          }
          action={
            isElementorRow ? (
              <div className="flex shrink-0 items-center">
                <Button
                  variant="quiet"
                  type="button"
                  disabled={shellOnly}
                  title="AI Links (internal href optimization)"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleAiLinksRow(index);
                  }}
                >
                  {row.status === "ai-links" ? (
                    null
                  ) : (
                    <Link2 className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </Button>
                <Button
                  variant="quiet"
                  type="button"
                  disabled={shellOnly}
                  title="AI Headers (all section titles)"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleAiHeadersRow(index);
                  }}
                >
                  {row.status === "ai-headers" ? (
                    null
                  ) : (
                    <Wand2 className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </Button>
              </div>
            ) : (
              <Button
                variant="quiet"
                type="button"
                disabled={shellOnly}
                title="AI Headers (all H2s on this post)"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleAiHeadersRow(index);
                }}
              >
                {row.status === "ai-headers" ? (
                  null
                ) : (
                  <Wand2 className="h-4 w-4 shrink-0 text-primary" />
                )}
              </Button>
            )
          }
        />
        <CollapsibleContent className="space-y-3 pt-3">
          {headerList.length > 0 ? (
            isElementorRow ? (
              <div className="space-y-3 text-base">
                {elementorHeaders.map((section, i) => {
                  const visualOnly = isVisualElementorSection(section);
                  return (
                  <div key={section.id || `elementor-section-${i}`} className="min-w-0 space-y-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="w-6 shrink-0 pt-1.5 tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="relative min-w-0 flex-1">
                            {visualOnly ? (
                              <div
                                className={cn(
                                  "flex h-8 min-w-0 items-center px-3 text-left text-base font-medium text-muted-foreground",
                                  META_INPUT_SURFACE,
                                )}
                              >
                                {section.title || "Layout or image band"}
                              </div>
                            ) : (
                              <Field
                                value={section.title}
                                readOnly={shellOnly}
                                placeholder="Section heading"
                                aria-label={`Section ${i + 1} title`}
                                onChange={(event) => {
                                  if (!section.id) return;
                                  if (!section.hasHeadingWidget && !section.headingInBodyHtml) return;
                                  commitElementorSectionField(section.id, {
                                    title: event.target.value,
                                  });
                                }}
                              />
                            )}
                          </div>
                          {!visualOnly && section.id ? (
                            <Field
                              value={row.elementorSectionKeywords?.[section.id] ?? ""}
                              readOnly={shellOnly}
                              disabled={shellOnly}
                              placeholder="Section keyword"
                              aria-label={`Section ${i + 1} keyword`}
                              onChange={(event) => {
                                const patch = patchElementorSectionKeyword(
                                  row,
                                  section.id,
                                  event.target.value,
                                );
                                if (Object.keys(patch).length > 0) updateRow(index, patch);
                              }}
                            />
                          ) : null}
                        </div>
                        {!visualOnly ? (
                          <div className="relative min-w-0 flex-1">
                            <OverviewSectionProseEditor
                              value={section.bodyHtml?.trim() || ""}
                              readOnly={shellOnly}
                              placeholder="Section copy"
                              siteUrl={site?.siteUrl}
                              className="pr-[2.75rem]"
                              onChange={(nextHtml) => {
                                if (!section.id) return;
                                commitElementorSectionField(section.id, { bodyHtml: nextHtml });
                              }}
                            />
                          </div>
                        ) : (
                          <p className="min-h-12 px-3 py-2 text-base text-muted-foreground">
                            Layout or image band
                          </p>
                        )}
                        {!visualOnly && section.id ? (
                          <ElementorSectionLinks
                            bodyHtml={section.bodyHtml?.trim() || section.bodyText?.trim() || ""}
                            readOnly={shellOnly}
                            onBodyChange={(nextHtml) => {
                              commitElementorSectionField(section.id, { bodyHtml: nextHtml });
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 text-base">
                {headerList.map((h2, i) => (
                  <div key={`header-${i}`} className="flex min-w-0 items-start gap-2">
                    <MetaEditableListTextarea
                      index={i}
                      value={h2}
                      readOnly={shellOnly}
                      ariaLabel={`Header ${i + 1}`}
                      onChange={(nextText) => {
                        const base = row.blogH2List?.length ? [...row.blogH2List] : [...headerList];
                        base[i] = nextText;
                        updateRow(index, { blogH2List: base });
                      }}
                    />
                  </div>
                ))}
              </div>
            )
          ) : !isElementorRow ? (
            <p className="text-base text-muted-foreground">
              No H2 headings in cached body HTML yet.
            </p>
          ) : (
            <p className="text-base text-muted-foreground">
              No sections in cached body HTML yet.
            </p>
          )}
          {isElementorRow && row.elementorDesignBreakdown?.trim() ? (
            <Collapsible open={headersPlanOpen} onOpenChange={setHeadersPlanOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="quiet">
                  <span className="flex-1 text-left">Design breakdown</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      headersPlanOpen && "rotate-180",
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-none bg-ui-field/60 p-2 text-base text-foreground">
                  {row.elementorDesignBreakdown}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
          {row.blogH2PlanJson?.trim() ? (
            <Collapsible open={headersPlanOpen} onOpenChange={setHeadersPlanOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="quiet">
                  <span className="flex-1 text-left">Plan JSON</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      headersPlanOpen && "rotate-180",
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-none bg-ui-field/60 p-2 text-base text-foreground">
                  {row.blogH2PlanJson}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
      </MetaAccordionStripeRow>
  );
}
