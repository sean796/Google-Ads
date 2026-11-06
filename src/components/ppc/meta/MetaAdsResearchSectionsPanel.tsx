import { ChevronDown, Download } from "lucide-react";

import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import {
  metaAdResearchDownloadFiles,
  triggerMetaResearchDownload,
} from "@/lib/ppc/meta-ad-research-sections";
import type { MetaAdResearchSection } from "@/lib/ppc/meta-ads-types";
import { cn } from "@/lib/utils";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui";

const DETAILS_FLAT_COLLAPSE_TRIGGER =
  "flex min-h-9 w-full items-center justify-between gap-2 rounded-none border-0 bg-black px-3 py-1.5 text-left text-base text-white [&[data-state=open]>svg]:rotate-180";

type MetaAdsResearchSectionsPanelProps = {
  sections: MetaAdResearchSection[];
  downloadSlug?: string;
};

export function MetaAdsResearchSectionsPanel({
  sections,
  downloadSlug = "meta-ad",
}: MetaAdsResearchSectionsPanelProps) {
  const doneSections = sections.filter((section) => section.status === "done" && section.markdown?.trim());
  if (!doneSections.length) return null;

  const downloadAll = () => {
    for (const file of metaAdResearchDownloadFiles(doneSections, downloadSlug)) {
      triggerMetaResearchDownload(file.name, file.content);
    }
  };

  return (
    <div className="space-y-2 px-2.5 py-2 sm:px-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-base text-muted-foreground">Research</p>
        <Button
          variant="quiet"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            downloadAll();
          }}
        >
          <Download className="mr-1 h-4 w-4" aria-hidden />
          Download all
        </Button>
      </div>
      <ul className={cn(CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS)}>
        {doneSections.map((section, index) => (
          <li key={section.id}>
            <Collapsible defaultOpen={index === 0}>
              <CollapsibleTrigger
                className={cn(
                  DETAILS_FLAT_COLLAPSE_TRIGGER,
                  contentOptimizerRowStripeClass(index),
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="min-w-0 break-words">{section.title}</span>
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 border-0 bg-transparent px-3 pb-3 pt-1">
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-base text-foreground">
                  {section.markdown}
                </pre>
                <Button
                  variant="quiet"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const file = metaAdResearchDownloadFiles([section], downloadSlug)[0];
                    if (file) triggerMetaResearchDownload(file.name, file.content);
                  }}
                >
                  <Download className="mr-1 h-4 w-4" aria-hidden />
                  Download
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </li>
        ))}
      </ul>
    </div>
  );
}
