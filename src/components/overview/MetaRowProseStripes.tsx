

import { Wand2, ListTree, ImageIcon } from "lucide-react";
import { MetaAccordionHeaderRow, MetaAccordionStripeRow } from "@/components/overview/MetaOptimizerRowParts";
import { Button, SelectField, Collapsible, CollapsibleContent } from "@/ui";
import type { MetaRowDetailsCtx } from "@/components/overview/use-meta-row-details-state";

export function MetaRowOverviewStripe({ s }: { s: MetaRowDetailsCtx }) {
  const {
    row,
    index,
    site,
    sitemapSource,
    updateRow,
    handleAiAnswerRow,
    handleAiOverviewRow,
    handleAiScenarioRow,
    handleAiInContentImageRow,
    placeholder,
    shellOnly,
    headerList,
    overviewReady,
    answerReady,
    scenarioReady,
    overviewSectionHtml,
    answerSectionHtml,
    scenarioSectionHtml,
    answerOpen,
    setAnswerOpen,
    overviewOpen,
    setOverviewOpen,
    scenarioOpen,
    setScenarioOpen,
    inContentImageOpen,
    setInContentImageOpen,
    inContentImageReady,
  } = s;
  return (
      <MetaAccordionStripeRow stripeIndex={4}>
      <Collapsible open={answerOpen} onOpenChange={setAnswerOpen}>
        <MetaAccordionHeaderRow
          open={answerOpen}
          icon={<ListTree className="h-4 w-4 shrink-0" aria-hidden />}
          label="Answer"
          count={answerReady ? "1" : "0"}
          countTitle="Answer staged"
          action={
            <Button
              variant="quiet"
              type="button"
              disabled={shellOnly}
              title="AI Answer (prepend to post body)"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleAiAnswerRow(index);
              }}
            >
              {row.status === "ai-answer" ? (
                null
              ) : (
                <Wand2 className="h-4 w-4 shrink-0 text-primary" />
              )}
            </Button>
          }
        />
        <CollapsibleContent className="space-y-3 pt-3">
          {answerSectionHtml ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-none bg-ui-field/60 p-3 text-base text-foreground">
              {answerSectionHtml}
            </pre>
          ) : (
            <p className="text-base text-muted-foreground">
              No Answer staged yet. Run the wand to prepend an Answer block.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
      </MetaAccordionStripeRow>
  );
}

export function MetaRowAnswerStripe({ s }: { s: MetaRowDetailsCtx }) {
  const {
    row,
    index,
    site,
    sitemapSource,
    updateRow,
    handleAiOverviewRow,
    handleAiScenarioRow,
    handleAiInContentImageRow,
    placeholder,
    shellOnly,
    headerList,
    overviewReady,
    scenarioReady,
    overviewSectionHtml,
    scenarioSectionHtml,
    overviewOpen,
    setOverviewOpen,
    scenarioOpen,
    setScenarioOpen,
    inContentImageOpen,
    setInContentImageOpen,
    inContentImageReady,
  } = s;
  return (
      <MetaAccordionStripeRow stripeIndex={5}>
      <Collapsible open={overviewOpen} onOpenChange={setOverviewOpen}>
        <MetaAccordionHeaderRow
          open={overviewOpen}
          icon={<ListTree className="h-4 w-4 shrink-0" aria-hidden />}
          label="Overview"
          count={overviewReady ? "1" : "0"}
          countTitle="Overview staged"
          action={
            <Button
              variant="quiet"
              type="button"
              disabled={shellOnly}
              title="AI Overview (prepend to post body)"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleAiOverviewRow(index);
              }}
            >
              {row.status === "ai-overview" ? (
                null
              ) : (
                <Wand2 className="h-4 w-4 shrink-0 text-primary" />
              )}
            </Button>
          }
        />
        <CollapsibleContent className="space-y-3 pt-3">
          {overviewSectionHtml ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-none bg-ui-field/60 p-3 text-base text-foreground">
              {overviewSectionHtml}
            </pre>
          ) : (
            <p className="text-base text-muted-foreground">
              No Overview staged yet. Run the wand to prepend an Overview block.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
      </MetaAccordionStripeRow>
  );
}

export function MetaRowScenarioStripe({ s }: { s: MetaRowDetailsCtx }) {
  const {
    row,
    index,
    site,
    sitemapSource,
    updateRow,
    handleAiScenarioRow,
    handleAiInContentImageRow,
    placeholder,
    shellOnly,
    headerList,
    scenarioReady,
    scenarioSectionHtml,
    scenarioOpen,
    setScenarioOpen,
    inContentImageOpen,
    setInContentImageOpen,
    inContentImageReady,
  } = s;
  return (
      <MetaAccordionStripeRow stripeIndex={6}>
      <Collapsible open={scenarioOpen} onOpenChange={setScenarioOpen}>
        <MetaAccordionHeaderRow
          open={scenarioOpen}
          icon={<ListTree className="h-4 w-4 shrink-0" aria-hidden />}
          label="Scenario"
          count={scenarioReady ? "1" : "0"}
          countTitle="Illustrative scenario staged"
          action={
            <Button
              variant="quiet"
              type="button"
              disabled={shellOnly}
              title="AI Scenario (regenerate illustrative H2)"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleAiScenarioRow(index);
              }}
            >
              {row.status === "ai-scenario" ? (
                null
              ) : (
                <Wand2 className="h-4 w-4 shrink-0 text-primary" />
              )}
            </Button>
          }
        />
        <CollapsibleContent className="space-y-3 pt-3">
          {scenarioSectionHtml ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-none bg-ui-field/60 p-3 text-base text-foreground">
              {scenarioSectionHtml}
            </pre>
          ) : (
            <p className="text-base text-muted-foreground">
              No illustrative section staged yet. Run the wand on a page with the local-example H2.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
      </MetaAccordionStripeRow>
  );
}

export function MetaRowFaqsStripe({ s }: { s: MetaRowDetailsCtx }) {
  const {
    row,
    index,
    site,
    sitemapSource,
    updateRow,
    handleAiInContentImageRow,
    placeholder,
    shellOnly,
    headerList,
    inContentImageOpen,
    setInContentImageOpen,
    inContentImageReady,
  } = s;
  return (
      <MetaAccordionStripeRow stripeIndex={7}>
      <Collapsible open={inContentImageOpen} onOpenChange={setInContentImageOpen}>
        <MetaAccordionHeaderRow
          open={inContentImageOpen}
          icon={<ImageIcon className="h-4 w-4 shrink-0" aria-hidden />}
          label="Images"
          count={inContentImageReady ? "1" : "0"}
          countTitle="In-content image staged"
          action={
            <Button
              variant="quiet"
              type="button"
              disabled={shellOnly}
              title="AI In Content Image"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleAiInContentImageRow(index);
              }}
            >
              {row.status === "ai-in-content-image" ? (
                null
              ) : (
                <Wand2 className="h-4 w-4 shrink-0 text-primary" />
              )}
            </Button>
          }
        />
        <CollapsibleContent className="space-y-3 pt-3">
          {sitemapSource === "sap" ? (
            <div className="space-y-2">
              <label
                htmlFor={`in-content-image-kind-${index}`}
                className="text-base font-medium"
              >
                Image type
              </label>
              <SelectField placeholder="Photo" value={row.blogInContentImageKind === "local" ? "local" : "photo"} onValueChange={(value) => {
                  updateRow(index, {
                    blogInContentImageKind: value === "local" ? "local" : "photo",
                  });
                }} disabled={shellOnly} options={[{ value: "photo", label: "Photo" }, { value: "local", label: "Local Image (generate)" }]} width="full" />
            </div>
          ) : null}
          <div className="space-y-2">
            <label htmlFor={`in-content-image-heading-${index}`} className="text-base font-medium">
              Heading
            </label>
            <SelectField placeholder="Auto (best heading)" value={row.blogInContentImageTargetHeading?.trim() || "__auto__"} onValueChange={(value) => {
                updateRow(index, {
                  blogInContentImageTargetHeading:
                    value === "__auto__" ? undefined : value,
                });
              }} disabled={shellOnly || headerList.length === 0} options={[{ value: "__auto__", label: "Auto (best heading)" }, ...headerList.map((heading, headingIndex) => ({ value: heading, label: heading }))]} width="full" />
            {headerList.length === 0 ? (
              <p className="text-base text-muted-foreground">
                No H2 headings yet. Scrape or reload the sitemap to import body HTML.
              </p>
            ) : null}
          </div>
          {inContentImageReady ? (
            <div className="space-y-2">
              <img
                src={row.blogInContentImageUrl}
                alt={row.blogInContentImageAlt || "In content image"}
                className="max-h-64 w-full object-contain bg-ui-field/60"
              />
              {row.blogInContentImageSection?.trim() ? (
                <p className="text-base text-foreground">
                  Section: {row.blogInContentImageSection}
                </p>
              ) : null}
              {row.blogInContentImageAlt?.trim() ? (
                <p className="text-base text-muted-foreground">
                  Alt: {row.blogInContentImageAlt}
                </p>
              ) : null}
              {row.blogInContentImageReferenceSourceUrl?.trim() ? (
                <p className="text-base">
                  <a
                    href={row.blogInContentImageReferenceSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    Original source
                  </a>
                </p>
              ) : null}
              {row.blogInContentImageSharedFromPageUrl?.trim() ? (
                <p className="text-base">
                  <a
                    href={row.blogInContentImageSharedFromPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    Shared from{" "}
                    {row.blogInContentImageSharedFromSiteName?.trim() || "peer site"}
                  </a>
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-base text-muted-foreground">
              {row.blogInContentImageKind === "local" && sitemapSource === "sap"
                ? "Local Image generates a new place photo. Use AISEO → Find Local Image to reuse images from other sites."
                : "Select a heading (or Auto), then run the wand."}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
      </MetaAccordionStripeRow>
  );
}
