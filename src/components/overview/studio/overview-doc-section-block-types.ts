import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";

export interface OverviewDocSectionBlocksProps {
  row: OverviewRow;
  rowIndex: number;
  sitemapSource: OverviewSitemapSource;
  siteId?: string | null;
  siteUrl?: string;
  businessName?: string;
  isElementorRow: boolean;
  bodyHtml: string;
  busy: boolean;
  onUpdateRow: (index: number, patch: Partial<OverviewRow>) => void;
  onAiAnswer: (index: number) => void | Promise<void>;
  onAiOverview: (index: number) => void | Promise<void>;
  onAiHeaders: (index: number) => void | Promise<void>;
  onAiLinks: (index: number) => void | Promise<void>;
  onAiWikipediaLink: (index: number) => void | Promise<void>;
  onAiScenario: (index: number) => void | Promise<void>;
  onAiInContentImage: (index: number) => void | Promise<void>;
  onAiFaqAll: (index: number) => void | Promise<void>;
  onAiFaqQuestion: (index: number, faqIndex: number) => void | Promise<void>;
  onAiFaqAnswer: (index: number, faqIndex: number) => void | Promise<void>;
  onAiElementorSection?: (index: number, sectionId: string) => void | Promise<void>;
  onAiElementorSectionHeader?: (index: number, sectionId: string) => void | Promise<void>;
  onAiElementorSectionContent?: (index: number, sectionId: string) => void | Promise<void>;
  onPassageStatusChange?: (status: { label: string; current: number; total: number } | null) => void;
  /** Auto SEO batch/single: highlight the H2 section matching the current harness step title. */
  activeOptimizingSectionTitle?: string | null;
}
