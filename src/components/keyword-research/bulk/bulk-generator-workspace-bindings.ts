import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { CSVRow, WordPressPostDestination } from "@/lib/bulk-auto-generate";
import type { ConnectedSiteSummary, WordPressSite } from "@/components/integrations/types";
import type { ScheduleOccupancy } from "@/lib/bulk-schedule-gap";
import type { ScheduleFrequency } from "@/lib/wordpress-scheduler";
import type { BulkSiteSitemapConfig } from "@/components/keyword-research/bulk/BulkGeneratorSitemapMenu";

type SiteConfig = BulkSiteSitemapConfig;

export type BulkGeneratorWorkspaceBindings = {
  inputMode: "csv" | "prompt";
  isProcessing: boolean;
  status: string;
  processingStepLog: string[];
  currentRow: number;
  totalRows: number;
  stats: { total: number; completed: number; error: number };
  harnessSections: BulkHarnessSectionUi[];
  harnessByRow: Map<number, BulkHarnessSectionUi[]>;
  harnessPlannedSectionCount: number | null;
  rows: CSVRow[];
  displayRows: CSVRow[];
  generatedRows: CSVRow[];
  handleStartProcessing: (promptRowsOverride?: CSVRow[]) => Promise<void>;
  handleApprove: () => Promise<void>;
  cancelProcessing: () => void;
  bulkPostDestination: WordPressPostDestination;
  setBulkPostDestination: (value: WordPressPostDestination) => void;
  selectedWordPressSites: Set<string>;
  setSelectedWordPressSites: (value: Set<string>) => void;
  siteConfigs: Record<string, SiteConfig>;
  setSiteConfigs: (
    value: Record<string, SiteConfig> | ((prev: Record<string, SiteConfig>) => Record<string, SiteConfig>),
  ) => void;
  scheduleFrequency: ScheduleFrequency;
  setScheduleFrequency: (value: ScheduleFrequency) => void;
  customInterval: number;
  setCustomInterval: (value: number) => void;
  dayOfWeek: number;
  setDayOfWeek: (value: number) => void;
  startDateOption: "immediate" | "custom";
  setStartDateOption: (value: "immediate" | "custom") => void;
  customStartDate: Date;
  setCustomStartDate: (value: Date) => void;
  startTime: string;
  setStartTime: (value: string) => void;
  useCsvPublishDates: boolean;
  setUseCsvPublishDates: (value: boolean) => void;
  wordpressDraftOnly: boolean;
  setWordpressDraftOnly: (value: boolean) => void;
  previewRows: CSVRow[];
  rowOrder: number[];
  setRowOrder: (value: number[] | ((prev: number[]) => number[])) => void;
  connectedSite: ConnectedSiteSummary | null;
  wordPressSite: WordPressSite | null;
  scheduleOccupancy: ScheduleOccupancy | null;
  scheduleOccupancyLoading: boolean;
  csvFileName: string | null;
  csvLoading?: boolean;
  /** OpenRouter title + URL slug agents running after CSV parse. */
  csvEnrichingTitlesUrls?: boolean;
  onPickCsvFile: (file: File) => Promise<void>;
  onLoadImportRows?: (rows: CSVRow[]) => void;
  onClearCsv: () => void;
  onClearPrompt: () => void;
  numberOfBlogs: number;
  setNumberOfBlogs: (value: number) => void;
  generalIntent: string;
  setGeneralIntent: (value: string) => void;
  isGeneratingChecklist: boolean;
  checklistPhase: string;
  checklistProgressPct?: number;
  hasGeneratedChecklist: boolean;
  handleGenerateChecklist: () => Promise<CSVRow[] | undefined>;
  sitemapInventoryLinks: PromptBulkSitemapInventoryLink[];
  gscHostedLink?: import("@/lib/bulk/bulk-gsc-keywords-hosted-link").BulkGscKeywordsHostedLink | null;
  sitemapInventoryLoading?: boolean;
  promptSiteContextReady?: boolean;
  /** @deprecated Use gscHostedLink from warm cache (Content Opt parity). */
  siteKwHostedLink?: import("@/lib/bulk/prompt-bulk-site-kw-scrape").PromptBulkSiteKwHostedLink | null;
  selectedBlogIndices: Set<number>;
  setSelectedBlogIndices: (
    value: Set<number> | ((prev: Set<number>) => Set<number>),
  ) => void;
  optionalPrompt: string;
  setOptionalPrompt: (value: string) => void;
  featuredImagePerBlog: boolean;
  setFeaturedImagePerBlog: (value: boolean) => void;
  featuredImageType: "ai-generated" | "google-maps";
  setFeaturedImageType: (value: "ai-generated" | "google-maps") => void;
  filesByRow: Map<number, BulkGeneratedFile[]>;
  failedRowIndices: ReadonlySet<number>;
  failedRowMessages: Readonly<Record<number, string>>;
  downloadFile: (file: BulkGeneratedFile) => void;
  downloadRowFiles: (rowIndex: number) => void;
  downloadAllFiles: () => void;
  downloadRunContentCsv: () => void;
  runContentCsvAvailable: boolean;
  sitemapMode: BulkSitemapMode;
  siteFallbackSitemapType: BulkRowSitemapType;
  onRowSitemapChange: (rowIndex: number, value: BulkRowSitemapType) => void;
  onSwitchToCustom: (defaultRowType: BulkRowSitemapType) => void;
  onCsvRowChange: (rowIndex: number, patch: Partial<CSVRow>) => void;
  onDisplayRowChange: (rowIndex: number, patch: Partial<CSVRow>) => void;
  /** Schedule-derived publish labels keyed by display/generated row index. */
  publishDateLabelByIndex: Record<number, string>;
};

/** @deprecated Use BulkGeneratorWorkspaceBindings */
export type BlogImportBulkWorkspaceBindings = BulkGeneratorWorkspaceBindings;
