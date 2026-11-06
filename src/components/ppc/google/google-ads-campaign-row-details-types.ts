import type { PpcCampaignRow, PpcWpPageContext } from "@/lib/ppc/google-ads-types";

export type GoogleAdsCampaignRowDetailsProps = {
  row: PpcCampaignRow;
  adGroupKeywords: string[];
  stripeIndex: number;
  panelId: string;
  deleteDisabled?: boolean;
  wpPages?: PpcWpPageContext[];
  wpPagesLoading?: boolean;
  landingPageReadOnly?: boolean;
  onCollapse: () => void;
  onDelete: () => void;
  onUpdateCampaign: (patch: Partial<PpcCampaignRow>) => void;
  onKeywordChange?: (keyword: string) => void;
  onLandingPageChange?: (url: string) => void;
  onDailyBudgetChange?: (budget: number | undefined) => void;
  onLoadWpPages?: () => void;
  onAdGroupKeywordChange?: (index: number, keyword: string) => void;
  generateDisabled?: boolean;
  isRowGenerating?: boolean;
  onGenerate?: () => void;
  generatingAdGroupKey?: string | null;
  onGenerateAdGroup?: (adGroupIndex: number) => void;
  adsCustomerId?: string;
};
