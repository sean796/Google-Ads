import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui";

import {
  displayPostTitle,
  priorityBadgeClass,
} from "@/lib/sitemap-optimizer/merge-results-display";
import type { SitemapOptimizerMergeRecommendation } from "@/lib/sitemap-optimizer/types";
import { cn } from "@/lib/utils";

type SourceLink = { url: string; title: string };

type Props = {
  merge: SitemapOptimizerMergeRecommendation;
  sources: SourceLink[];
};

export function SitemapOptimizerMergeResultCard({ merge, sources }: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const newTitle = displayPostTitle(merge.recommendedTitle || "New post");
  const keyword = merge.recommendedPrimaryKeyword.trim();
  const meta = merge.recommendedMeta.trim();
  const metaPreview =
    meta.length > 160 ? `${meta.slice(0, 157)}…` : meta;

  return (
    <section className="rounded-md border border-border/60 bg-muted/25 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-base font-medium uppercase tracking-wide text-muted-foreground">
          New post
        </p>
        <span
          className={cn(
            "shrink-0 rounded px-2 py-0.5 text-base font-semibold uppercase",
            priorityBadgeClass(merge.priority),
          )}
        >
          {merge.priority}
        </span>
      </div>

      <p className="mt-2 text-base font-semibold leading-snug text-foreground">{newTitle}</p>

      {keyword ? (
        <p className="mt-2 text-base text-foreground">
          <span className="text-muted-foreground">Focus keyword: </span>
          {keyword}
        </p>
      ) : null}

      {metaPreview ? (
        <p className="mt-1 text-base text-muted-foreground">{metaPreview}</p>
      ) : null}

      {sources.length >= 2 ? (
        <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen} className="mt-4">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-left text-base font-medium text-foreground transition-colors hover:bg-muted/40 [&[data-state=open]>svg]:rotate-180">
            <span>Merged posts ({sources.length})</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2 data-[state=closed]:animate-none">
            <ul className="space-y-2 rounded-md border border-border/40 bg-background/40 px-3 py-2">
              {sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-base text-foreground underline-offset-2 hover:underline"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </section>
  );
}
