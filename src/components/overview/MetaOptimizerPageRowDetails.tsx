import React from "react";


import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { WordPressOptimizationContextValue } from "@/contexts/wordpress-optimization-context";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { cn } from "@/lib/utils";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { MetaAccordionStripeRow } from "@/components/overview/MetaOptimizerRowParts";
import {
  META_FIELD_COUNT,
  META_FIELD_END_RAIL,
  META_FIELD_END_RAIL_BTN,
  META_FIELD_END_RAIL_CELL,
  META_TRIGGER_FLAT,
  zoneMetaAccordionStack,
} from "@/components/overview/meta-optimizer-row-constants";
import { CONTENT_OPTIMIZER_ROW_SHELL_CLASS } from "@/components/overview/overview-tab/overview-tab-content-constants";
import { useMetaRowDetailsState } from "@/components/overview/use-meta-row-details-state";
import { MetaRowTopZone } from "@/components/overview/MetaRowTopZone";
import { MetaRowSerpZone } from "@/components/overview/MetaRowSerpZone";
import { MetaRowHeadersStripe } from "@/components/overview/MetaRowHeadersStripe";
import { MetaRowLinksStripe, MetaRowWikiStripe } from "@/components/overview/MetaRowLinkStripes";
import { MetaRowAnswerStripe, MetaRowFaqsStripe, MetaRowOverviewStripe, MetaRowScenarioStripe } from "@/components/overview/MetaRowProseStripes";
import { MetaRowContentStripe, MetaRowImageStripe } from "@/components/overview/MetaRowMediaStripes";

export interface MetaOptimizerPageRowDetailsProps {
  row: OverviewRow;
  rowIndex: number;
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  opt: WordPressOptimizationContextValue;
  bindings: Record<string, OverviewBinding>;
  bulkAiFaqSeedCount: number;
  metaOptimizerPipelineBusy: boolean;
  expandedResearchBriefUrl: string | null;
  setExpandedResearchBriefUrl: (url: string | null) => void;
  expandedContentUrl: string | null;
  setExpandedContentUrl: (url: string | null) => void;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  handleAiUrlRow: (index: number) => void | Promise<void>;
  handleScrapeRow: (index: number) => void | Promise<void>;
  handleUpdateWordPressForRow: (
    row: OverviewRow,
    options?: { silent?: boolean; binding?: OverviewBinding; rowIndex?: number },
  ) => Promise<boolean>;
  handleDataForSeoResearch: (
    rowIndex: number,
    options?: { skipGsc?: boolean; silent?: boolean },
  ) => Promise<Partial<OverviewRow> | null>;
  handleOptimizeAllSerpRow: (index: number) => void | Promise<void>;
  handleAiAllMetaRow: (index: number) => void | Promise<void>;
  handleAiTitleRow: (
    index: number,
    rowOverride?: OverviewRow,
    options?: { skipOptimizeTitleLoading?: boolean },
  ) => Promise<{ title: string; aiTitle: string } | null>;
  handleAiMetaRow: (
    index: number,
    rowOverride?: OverviewRow,
    options?: { skipOptimizeMetaLoading?: boolean },
  ) => Promise<{ metaDescription: string; aiMeta: string } | null>;
  handleAiKeywordRow: (index: number) => Promise<string | null>;
  handleSetDateToday: (index: number) => void;
  commitRowDateModifier: (index: number) => void;
  handleAiFaqRowAll: (index: number) => void | Promise<void>;
  handleAiFaqQuestion: (index: number, faqIndex: number) => void | Promise<void>;
  handleAiFaqAnswer: (index: number, faqIndex: number) => void | Promise<void>;
  handleAiHeadersRow: (index: number) => void | Promise<void>;
  handleAiLinksRow: (index: number) => void | Promise<void>;
  handleAiWikipediaLinkRow: (index: number) => void | Promise<void>;
  handleAiAnswerRow: (index: number) => void | Promise<void>;
  handleAiOverviewRow: (index: number) => void | Promise<void>;
  handleAiScenarioRow: (index: number) => void | Promise<void>;
  handleAiInContentImageRow: (index: number) => void | Promise<void>;
  /** Shell-only tile: empty fields, actions disabled (no URLs loaded yet). */
  placeholder?: boolean;
  /** Nested inside compact accordion shell: skip outer row border/background. */
  accordionBody?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (shiftKey?: boolean) => void;
  /** Collapse expanded accordion row (chevron shown in URL/actions bar). */
  onCollapse?: () => void;
}

export const MetaOptimizerPageRowDetails: React.FC<MetaOptimizerPageRowDetailsProps> = (
  props,
) => {
  const ctx = useMetaRowDetailsState(props);
  const { accordionBody } = ctx;
  return (
    <div
      className={cn(
        "min-w-0 w-full",
        accordionBody ? "space-y-2 px-0 pb-0 pt-0" : "space-y-3",
        !accordionBody && CONTENT_OPTIMIZER_ROW_SHELL_CLASS,
      )}
    >
      <MetaRowTopZone s={ctx} />
      <MetaRowSerpZone s={ctx} />

      <div
        className={zoneMetaAccordionStack}
        role="region"
        aria-label="Headers, FAQs and content optimization"
      >
        <MetaRowHeadersStripe s={ctx} />
        <MetaRowLinksStripe s={ctx} />
        <MetaRowWikiStripe s={ctx} />
        <MetaRowOverviewStripe s={ctx} />
        <MetaRowAnswerStripe s={ctx} />
        <MetaRowScenarioStripe s={ctx} />
        <MetaRowFaqsStripe s={ctx} />
        <MetaRowContentStripe s={ctx} />
        <MetaRowImageStripe s={ctx} />
      </div>
    </div>
  );
};
