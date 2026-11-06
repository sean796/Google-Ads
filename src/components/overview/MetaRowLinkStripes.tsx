

import { Wand2, ChevronDown, Link2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { wikipediaTitleFromHref } from "@/lib/overview/overview-blog-wikipedia-link-insert";
import { MetaAccordionHeaderRow, MetaAccordionStripeRow, MetaEditableLinkRow } from "@/components/overview/MetaOptimizerRowParts";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui";
import type { MetaRowDetailsCtx } from "@/components/overview/use-meta-row-details-state";

export function MetaRowLinksStripe({ s }: { s: MetaRowDetailsCtx }) {
  const {
    row,
    index,
    updateRow,
    handleAiLinksRow,
    handleAiWikipediaLinkRow,
    shellOnly,
    linksOpen,
    setLinksOpen,
    linksPlanOpen,
    setLinksPlanOpen,
    wikiLinksOpen,
    setWikiLinksOpen,
    linkList,
    wikiLinkList,
    wikiLinksInBody,
    wikiLinkCount,
  } = s;
  return (
      <MetaAccordionStripeRow stripeIndex={2}>
      <Collapsible open={linksOpen} onOpenChange={setLinksOpen}>
        <MetaAccordionHeaderRow
          open={linksOpen}
          icon={<Link2 className="h-4 w-4 shrink-0" aria-hidden />}
          label="Links"
          count={linkList.length.toLocaleString()}
          countTitle="Internal link count"
          action={
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
                <Wand2 className="h-4 w-4 shrink-0 text-primary" />
              )}
            </Button>
          }
        />
        <CollapsibleContent className="space-y-3 pt-3">
          <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              disabled={shellOnly}
              onClick={() => {
                updateRow(index, {
                  blogLinkList: [...(row.blogLinkList ?? linkList), { anchor: "", href: "" }],
                });
              }}
              title="Add link"
            >
              <span className="text-base font-medium leading-none">+</span>
            </Button>
          </div>
          {linkList.length > 0 ? (
            <div className="space-y-1.5 text-base">
              {linkList.map((link, i) => (
                <MetaEditableLinkRow
                  key={`link-${i}`}
                  linkLabel={`Link ${i + 1}`}
                  anchor={link.anchor}
                  href={link.href}
                  readOnly={shellOnly}
                  onAnchorChange={(nextAnchor) => {
                    const base = row.blogLinkList?.length ? [...row.blogLinkList] : [...linkList];
                    base[i] = { ...base[i], anchor: nextAnchor };
                    updateRow(index, { blogLinkList: base });
                  }}
                  onHrefChange={(nextHref) => {
                    const base = row.blogLinkList?.length ? [...row.blogLinkList] : [...linkList];
                    base[i] = { ...base[i], href: nextHref };
                    updateRow(index, { blogLinkList: base });
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="text-base text-muted-foreground">No links yet. Add a row or scrape body HTML.</p>
          )}
          {row.blogLinksPlanJson?.trim() ? (
            <Collapsible open={linksPlanOpen} onOpenChange={setLinksPlanOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="quiet">
                  <span className="flex-1 text-left">Plan JSON</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      linksPlanOpen && "rotate-180",
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-none bg-ui-field/60 p-2 text-base text-foreground">
                  {row.blogLinksPlanJson}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
      </MetaAccordionStripeRow>
  );
}

export function MetaRowWikiStripe({ s }: { s: MetaRowDetailsCtx }) {
  const {
    row,
    index,
    handleAiWikipediaLinkRow,
    shellOnly,
    wikiLinksOpen,
    setWikiLinksOpen,
    wikiLinkList,
    wikiLinksInBody,
    wikiLinkCount,
  } = s;
  return (
      <MetaAccordionStripeRow stripeIndex={3}>
      <Collapsible open={wikiLinksOpen} onOpenChange={setWikiLinksOpen}>
        <MetaAccordionHeaderRow
          open={wikiLinksOpen}
          icon={<MapPin className="h-4 w-4 shrink-0" aria-hidden />}
          label="Wikipedia link"
          count={wikiLinkCount > 0 ? "1" : "0"}
          countTitle="Wikipedia link in body"
          action={
            <Button
              variant="quiet"
              type="button"
              disabled={shellOnly}
              title="Find entity and insert Wikipedia link"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleAiWikipediaLinkRow(index);
              }}
            >
              {row.status === "ai-wikipedia-link" ? (
                null
              ) : (
                <MapPin className="h-4 w-4 shrink-0 text-primary" />
              )}
            </Button>
          }
        />
        <CollapsibleContent className="space-y-3 pt-3">
          {wikiLinkCount > 0 ? (
            <div className="space-y-3 text-base">
              {wikiLinksInBody.length > 0
                ? wikiLinksInBody.map((link, i) => (
                    <div key={`wiki-body-${i}`} className="space-y-1.5 rounded-none bg-ui-field/60 p-3">
                      <p className="leading-relaxed text-foreground">
                        {link.contextBefore ? (
                          <span className="text-muted-foreground">…{link.contextBefore} </span>
                        ) : null}
                        <a
                          href={link.href.replace(/&amp;/g, "&")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary underline underline-offset-2"
                        >
                          {link.anchor}
                        </a>
                        {link.contextAfter ? (
                          <span className="text-muted-foreground"> {link.contextAfter}…</span>
                        ) : null}
                      </p>
                      <a
                        href={link.href.replace(/&amp;/g, "&")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block break-all text-primary underline underline-offset-2"
                      >
                        {wikipediaTitleFromHref(link.href)}
                      </a>
                    </div>
                  ))
                : wikiLinkList.map((link, i) => (
                    <div key={`wiki-staged-${i}`} className="space-y-1.5 rounded-none bg-ui-field/60 p-3">
                      <p className="text-foreground">
                        Staged anchor:{" "}
                        <span className="font-medium text-foreground">{link.anchor || "Wikipedia"}</span>
                      </p>
                      <a
                        href={link.href.replace(/&amp;/g, "&")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block break-all text-primary underline underline-offset-2"
                      >
                        {wikipediaTitleFromHref(link.href)}
                      </a>
                    </div>
                  ))}
            </div>
          ) : (
            <p className="text-base text-muted-foreground">
              No Wikipedia link in body yet.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
      </MetaAccordionStripeRow>
  );
}
