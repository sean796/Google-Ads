import type { WordPressSite } from '@/components/integrations/types';
import type { BulkGeneratedFile } from '@/lib/bulk-file-manager';
import type { RunHistoryEntry } from '@/hooks/content-optimization/use-optimization-state';
import type { SapMapsMediaBank } from '@/lib/bulk/sap-maps-media-bank';
import type { PeerFeaturedImageReportCollector } from '@/lib/bulk/peer-featured-image-report';
import type { PeerFeaturedLibraryCsvFile } from '@/lib/overview/sap-peer-featured-image-search';
import type { WorkflowStepOutput } from '@/lib/workflow/workflow-types';
import type { SeoContentBriefV1 } from '@/lib/overview-seo-content-brief';
import type { SemrushBulkEnrichmentResult } from '@/lib/wordpress-api/semrush';
import type { IntelligentKeywordResearchMergeResult } from '@/lib/bulk/intelligent-keyword-research-merge';

export type WordPressPostDestination = 'wordpress' | 'local' | 'direct';

/** Default export destinations shown in bulk WordPress posting UI. */
export const BULK_POST_DESTINATION_CHOICES: WordPressPostDestination[] = [
  'wordpress',
  'local',
];

/** Blog import tab: upload as-is to WordPress (direct) or local content + meta JSON only. */
export const BLOG_IMPORT_POST_DESTINATION_CHOICES: WordPressPostDestination[] = [
  'direct',
  'local',
];

export const WORDPRESS_POST_DESTINATION_SHORT: Record<WordPressPostDestination, string> = {
  wordpress: 'WordPress',
  local: 'Local files',
  direct: 'Direct',
};

export const WORDPRESS_POST_DESTINATION_LONG: Record<WordPressPostDestination, string> = {
  wordpress: 'Post to WordPress',
  local: 'Local only (files)',
  direct: 'Direct',
};

export interface WordPressPostingOptions {
  enabled: boolean;
  site: WordPressSite;
  sitemapType: 'post' | 'entity';
  frequency: 'immediately' | 'daily' | 'weekly' | 'monthly' | 'custom' | 'everyNDays';
  customInterval?: number;
  customStaggerOptimized?: boolean;
  dayOfWeek?: number;
  startDate: Date;
  startTime: string;
  totalRows: number;
  sites?: Array<{
    site: WordPressSite;
    sitemapType: 'post' | 'entity';
  }>;
  useCsvPublishDates?: boolean;
  postDestination?: WordPressPostDestination;
  headerPostDestination?: WordPressPostDestination;
  scheduleOccupancy?: import('@/lib/bulk-schedule-gap').ScheduleOccupancy;
  useGapScheduling?: boolean;
  gapDatesBySlot?: Date[];
  draftOnly?: boolean;
  publishDays?: number[];
  /** wp/v2/posts vs pages for standard (non-entity) creates/updates. */
  wordpressRestEndpoint?: 'posts' | 'pages';
}

export type BulkHarnessSectionPayload = {
  rowIndex: number;
  sectionIndex: number;
  totalSections: number;
  title: string;
  phase: 'start' | 'progress' | 'done';
  markdownSlice?: string;
  truncated?: boolean;
};

export interface BulkProcessingOptions {
  apiKey: string;
  openRouterApiKey: string;
  openRouterOnly?: boolean;
  blogImportSourceFile?: File | null;
  blogImportForm?: {
    focusKeyword: string;
    titleOverride: string;
    featuredImageMode: 'y' | 'n' | 'google-maps';
    entity: string;
  };
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowPurpose?: string;
  featuredImageType?: 'ai-generated' | 'google-maps';
  wordPressPosting?: WordPressPostingOptions;
  headerPostDestination?: WordPressPostDestination;
  useEntitySitemapTemplate?: boolean;
  linkPrefetchPromise?: Promise<void>;
  googleMapsImagePromise?: Promise<void>;
  googleMapsImageSerpLocation?: string;
  wordPressPostsByKeyword?: Map<
    string,
    Array<{
      id: number;
      slug: string;
      title: string;
      excerpt: string;
      link: string;
      date_gmt: string;
      collection?: string;
      postType?: string;
    }>
  >;
  onProgress?: (rowIndex: number, totalRows: number, status: string) => void;
  onRowComplete?: (rowIndex: number, files: BulkGeneratedFile[]) => void;
  onError?: (rowIndex: number, error: Error) => void;
  onAppendHistory?: (entry: RunHistoryEntry) => void;
  onHarnessSection?: (payload: BulkHarnessSectionPayload) => void;
  sequentialHarnessSections?: boolean;
  siteSummary?: string;
  optionalPrompt?: string;
  portfolioBlockedHosts?: string[];
  bulkScheduleSlotIndex?: number;
  sapMapsMediaBank?: SapMapsMediaBank;
  sapMapsEntityRowCounts?: Map<string, number>;
  peerSites?: WordPressSite[];
  peerFeaturedReport?: PeerFeaturedImageReportCollector;
  onPeerFeaturedCsv?: (file: PeerFeaturedLibraryCsvFile) => void;
  wordPressPagesForOfferTable?: Array<{
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    link: string;
    date_gmt: string;
  }>;
  reservedUploadSlugsBySite?: Map<string, Set<string>>;
  workflowSerpResearch?: {
    outputs?: WorkflowStepOutput[];
    getOutputs?: () => WorkflowStepOutput[] | undefined;
    commitBrief?: (
      keyword: string,
      brief: SeoContentBriefV1,
      storedFile: string | null,
    ) => Promise<void>;
  };
  workflowDfsArticleAudit?: {
    outputs?: WorkflowStepOutput[];
    getOutputs?: () => WorkflowStepOutput[] | undefined;
  };
  skipWikipediaLookup?: boolean;
  updateTargetPostId?: number;
  optimizePreserveTitle?: string;
  optimizePreserveSlug?: string;
  forceFreshTopicFanout?: boolean;
  forbiddenLiveH2s?: string[];
}

export interface BulkProcessingResult {
  success: boolean;
  totalRows: number;
  completedRows: number;
  failedRows: number;
  files: BulkGeneratedFile[];
  errors: Array<{ rowIndex: number; error: string }>;
}

/** Passed from bulk hook when Semrush + intelligent merge already ran alongside DFS. */
export type PrefetchedBulkKeywordResearch = {
  semrush: SemrushBulkEnrichmentResult;
  primaryExternalCitationUrl: string | null;
  intelligentMerge: IntelligentKeywordResearchMergeResult | null;
};
