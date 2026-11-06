

import { ContentOptimizationControls } from "@/components/integrations/wordpress/ContentOptimizationControls";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { Wand2, ChevronDown, Sparkles, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseFaqEntries, serializeFaqEntriesPlain } from "@/lib/faq-entries";
import { overviewBindingForRow, overviewDateModifierTodayIso } from "@/lib/overview/overview-bulk-seo-payload";
import { subtypeToEndpoint } from "@/hooks/content-optimization/optimization-helpers";
import { MetaAccordionStripeRow, MetaFieldEndRail } from "@/components/overview/MetaOptimizerRowParts";
import { META_FIELD_COUNT, META_FIELD_END_RAIL, META_FIELD_END_RAIL_CELL, META_FAQ_PAIR_TILE } from "@/components/overview/meta-optimizer-row-constants";
import { Button, Field, TextareaField, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui";
import type { MetaRowDetailsCtx } from "@/components/overview/use-meta-row-details-state";

export function MetaRowContentStripe({ s }: { s: MetaRowDetailsCtx }) {
  const {
    row,
    index,
    site,
    sitemapSource,
    opt,
    bindings,
    expandedContentUrl,
    setExpandedContentUrl,
    updateRow,
    handleAiFaqRowAll,
    handleAiFaqQuestion,
    handleAiFaqAnswer,
    placeholder,
    faqEntries,
    faqPairCount,
    faqEditorOpen,
    setFaqEditorOpen,
    titleReadOnly,
  } = s;
  return (
      <MetaAccordionStripeRow stripeIndex={8}>
      <Collapsible open={faqEditorOpen} onOpenChange={setFaqEditorOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="quiet">
            <CircleHelp className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 break-words text-left">FAQs</span>
            <div className={cn(META_FIELD_END_RAIL, "pointer-events-none shrink-0")} aria-hidden>
              <span
                className={cn(META_FIELD_COUNT, META_FIELD_END_RAIL_CELL, "min-w-[1.75rem] tabular-nums font-semibold")}
                title="FAQ pairs (parsed)"
              >
                {faqPairCount.toLocaleString()}
              </span>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 transition-transform",
                faqEditorOpen && "rotate-180",
              )}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              onClick={() => {
                const current = parseFaqEntries(row.faq);
                const next = [...current, { question: "", answer: "" }];
                updateRow(index, { faq: serializeFaqEntriesPlain(next) });
              }}
              title="Add FAQ"
            >
              <span className="text-base font-medium leading-none">+</span>
            </Button>
            <Button
              type="button"
              onClick={() => {
                const current = parseFaqEntries(row.faq);
                if (!current.length) return;
                const next = current.slice(0, current.length - 1);
                updateRow(index, { faq: serializeFaqEntriesPlain(next) });
              }}
              title="Remove last FAQ"
            >
              <span className="text-base font-medium leading-none">−</span>
            </Button>
            <Button
              type="button"
              onClick={() => void handleAiFaqRowAll(index)}
              title="AI FAQs (4 pairs if empty)"
            >
              {row.status === "ai-faq" ? (
                null
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="space-y-3">
            {faqEntries.map((entry, i) => (
              <div key={i} className={cn("space-y-2 text-base", META_FAQ_PAIR_TILE)}>
                <div className="flex w-full min-w-0">
                  <div className="relative min-w-0 flex-1">
                    <Field
                      value={entry.question}
                      onChange={(e) => {
                        const current = parseFaqEntries(row.faq);
                        const next = [...(current.length ? current : [{ question: "", answer: "" }])];
                        if (!next[i]) next[i] = { question: "", answer: "" };
                        next[i] = { ...next[i], question: e.target.value };
                        updateRow(index, { faq: serializeFaqEntriesPlain(next) });
                      }}
                      placeholder="Question"
                      aria-label={`FAQ question ${i + 1}`}
                    />
                    <MetaFieldEndRail align="center" className="right-0.5">
                      <span
                        className={cn(META_FIELD_COUNT, META_FIELD_END_RAIL_CELL, "min-w-[2rem] tabular-nums")}
                        title="Characters"
                        aria-hidden
                      >
                        {entry.question.length}
                      </span>
                      <Button
                        variant="quiet"
                        type="button"
                        title="AI question"
                        onClick={() => void handleAiFaqQuestion(index, i)}
                      >
                        {row.status === "ai-faq" ? (
                          null
                        ) : (
                          <Wand2 className="h-3 w-3 shrink-0 text-primary" />
                        )}
                      </Button>
                    </MetaFieldEndRail>
                  </div>
                </div>
                <div className="flex w-full min-w-0">
                  <div className="relative min-w-0 flex-1">
                    <TextareaField
                      value={entry.answer}
                      onChange={(e) => {
                        const current = parseFaqEntries(row.faq);
                        const next = [...(current.length ? current : [{ question: "", answer: "" }])];
                        if (!next[i]) next[i] = { question: "", answer: "" };
                        next[i] = { ...next[i], answer: e.target.value };
                        updateRow(index, { faq: serializeFaqEntriesPlain(next) });
                      }}
                      rows={3}
                      placeholder="Answer"
                      aria-label={`FAQ answer ${i + 1}`}
                    />
                    <MetaFieldEndRail align="top" className="right-0.5 top-2">
                      <span
                        className={cn(META_FIELD_COUNT, META_FIELD_END_RAIL_CELL, "min-w-[2rem] tabular-nums")}
                        title="Characters"
                        aria-hidden
                      >
                        {entry.answer.length}
                      </span>
                      <Button
                        variant="quiet"
                        type="button"
                        title="AI answer"
                        onClick={() => void handleAiFaqAnswer(index, i)}
                      >
                        {row.status === "ai-faq" ? (
                          null
                        ) : (
                          <Wand2 className="h-3 w-3 shrink-0 text-primary" />
                        )}
                      </Button>
                    </MetaFieldEndRail>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
      </MetaAccordionStripeRow>
  );
}

export function MetaRowImageStripe({ s }: { s: MetaRowDetailsCtx }) {
  const {
    row,
    index,
    site,
    sitemapSource,
    opt,
    bindings,
    expandedContentUrl,
    setExpandedContentUrl,
    updateRow,
    titleReadOnly,
  } = s;
  return (
      <MetaAccordionStripeRow stripeIndex={9}>
      <Collapsible
        open={expandedContentUrl === row.url}
        onOpenChange={(next) => setExpandedContentUrl(next ? row.url : null)}
      >
        <CollapsibleTrigger asChild>
          <Button variant="quiet">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 text-left">Optimize content</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 transition-transform",
                expandedContentUrl === row.url && "rotate-180",
              )}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          {opt.isOptimizingContent[site.id] ? (
            <p className="mb-3 text-base text-muted-foreground">Running — see Details in the header.</p>
          ) : null}
          <ContentOptimizationControls
            site={site}
            panelTitle={null}
            lockedPageUrl={row.url}
            presetResolvedPost={(() => {
              const binding = overviewBindingForRow(row, bindings);
              const sheetBody =
                row.postContentOptimized?.trim() || row.postContent?.trim() || "";
              const endpoint =
                subtypeToEndpoint(binding?.subtype) ||
                (binding?.subtype === "service-area" ? "service-areas" : binding?.subtype) ||
                undefined;
              return binding?.postId
                ? {
                    id: binding.postId,
                    subtype: binding.subtype,
                    link: row.url,
                    endpoint,
                    title: row.title || row.aiTitle || undefined,
                    content: sheetBody || undefined,
                    excerpt: row.metaDescription || undefined,
                    focusKeyword: row.focusKeyword?.trim() || undefined,
                    seoResearch: row.seoResearch?.trim() || undefined,
                  }
                : null;
            })()}
            url={row.url}
            updateMode={opt.optimizeUpdateMode[site.id] || "update"}
            isOptimizing={Boolean(opt.isOptimizingContent[site.id])}
            progress={opt.optimizationProgress[site.id]}
            fileManager={opt.optimizationFileManagers[site.id]}
            onUrlChange={() => {}}
            onUpdateModeChange={(mode) => opt.setOptimizeUpdateMode((p) => ({ ...p, [site.id]: mode }))}
            onOptimize={(postData) => {
              void (async () => {
                const oldUrl = row.url;
                updateRow(index, { dateModifier: overviewDateModifierTodayIso() });
                await opt.handleOptimizeContentClick(
                  site,
                  row.url,
                  opt.optimizeUpdateMode[site.id] || "update",
                  postData ?? null,
                );
                const { consumeOverviewOptimizedUpload } = await import(
                  "@/lib/overview/overview-content-opt-html-store"
                );
                const payload = consumeOverviewOptimizedUpload(oldUrl);
                const html = payload?.html;
                const canon = payload?.link?.trim();
                if (html?.trim()) {
                  const binding = overviewBindingForRow(row, bindings);
                  const patch: Partial<OverviewRow> = {
                    postContent: html,
                    postContentOptimized: html,
                    ...(binding?.postId
                      ? { postId: binding.postId, postType: binding.subtype }
                      : {}),
                  };
                  if (canon) {
                    patch.url = canon;
                  }
                  updateRow(index, patch);
                }
              })();
            }}
            optimizationOptions={{
              ...(opt.optimizationOptions[site.id] || {
                optimizeTitle: true,
                optimizeMeta: true,
                optimizeExcerpt: true,
                optimizeContent: true,
                optimizeFeaturedImage: false,
                autoOptimize: true,
                testMode: false,
                stagingSite: false,
                hasEntity: sitemapSource === "sap",
              }),
              optimizeTitle: !titleReadOnly,
              optimizeContent: true,
              optimizeFeaturedImage: false,
              optimizeExtraText: false,
              optimizeExtraImage: false,
              contentOnlyUpload: true,
              autoOptimize: true,
              hasEntity: sitemapSource === "sap",
              useAcfKeyword: false,
              manualKeyword: row.focusKeyword?.trim() || "",
            }}
            onOptimizationOptionsChange={(o) => opt.setOptimizationOptions((p) => ({ ...p, [site.id]: o }))}
            inContentImageType={opt.inContentImageTypes[site.id] || ""}
            inContentImagePrompt={opt.inContentImagePrompts[site.id] || ""}
            onInContentImageTypeChange={(t) => opt.setInContentImageTypes((p) => ({ ...p, [site.id]: t }))}
            onInContentImagePromptChange={(pr) => opt.setInContentImagePrompts((p) => ({ ...p, [site.id]: pr }))}
            cardClassName="mt-0 w-full border-0 bg-transparent shadow-none text-foreground [&_.text-muted-foreground]:text-muted-foreground"
          />
        </CollapsibleContent>
      </Collapsible>
      </MetaAccordionStripeRow>
  );
}
