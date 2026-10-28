import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, FileText } from 'lucide-react';
import { WordPressPostingConfig } from './WordPressPostingConfig';
import { BlogGenerationSettings } from './BlogGenerationSettings';
import type { ScheduleOccupancy } from '@/lib/bulk-schedule-gap';
import type { ScheduleFrequency } from '@/lib/wordpress-scheduler';
import type { ConnectedSiteSummary } from '@/components/integrations/types';
import type { CSVRow, WordPressPostDestination } from '@/lib/bulk-auto-generate';
import { REPORTING_TOOLBAR_BTN } from '@/components/research/reporting/reporting-toolbar-styles';
import { cn } from '@/lib/utils';
import type { BulkSitemapMode } from '@/lib/bulk/bulk-sitemap-mode';

interface SiteConfig {
  sitemapType: BulkSitemapMode;
}

interface PromptInputSectionProps {
  numberOfBlogs: number;
  setNumberOfBlogs: (value: number) => void;
  optionalPrompt: string;
  setOptionalPrompt: (value: string) => void;
  featuredImagePerBlog: boolean;
  setFeaturedImagePerBlog: (value: boolean) => void;
  featuredImageType: 'ai-generated' | 'google-maps';
  setFeaturedImageType: (value: 'ai-generated' | 'google-maps') => void;
  connectedSite: ConnectedSiteSummary | null;
  // WordPress posting
  selectedWordPressSites: Set<string>;
  setSelectedWordPressSites: (value: Set<string>) => void;
  siteConfigs: Record<string, SiteConfig>;
  setSiteConfigs: (value: Record<string, SiteConfig> | ((prev: Record<string, SiteConfig>) => Record<string, SiteConfig>)) => void;
  scheduleFrequency: ScheduleFrequency;
  setScheduleFrequency: (value: ScheduleFrequency) => void;
  customInterval: number;
  setCustomInterval: (value: number) => void;
  dayOfWeek: number;
  setDayOfWeek: (value: number) => void;
  startDateOption: 'immediate' | 'custom';
  setStartDateOption: (value: 'immediate' | 'custom') => void;
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
  // Actions
  isGeneratingChecklist: boolean;
  isProcessing: boolean;
  apiKey?: string;
  openRouterApiKey?: string;
  handleGenerateChecklist: () => Promise<void>;
  setSelectedBlogIndices: (indices: Set<number>) => void;
  postDestination: WordPressPostDestination;
  setPostDestination: (value: WordPressPostDestination) => void;
  postDestinationChoices?: WordPressPostDestination[];
  scheduleOccupancy?: ScheduleOccupancy | null;
  scheduleOccupancyLoading?: boolean;
}

export function PromptInputSection({
  numberOfBlogs,
  setNumberOfBlogs,
  optionalPrompt,
  setOptionalPrompt,
  featuredImagePerBlog,
  setFeaturedImagePerBlog,
  featuredImageType,
  setFeaturedImageType,
  connectedSite,
  selectedWordPressSites,
  setSelectedWordPressSites,
  siteConfigs,
  setSiteConfigs,
  scheduleFrequency,
  setScheduleFrequency,
  customInterval,
  setCustomInterval,
  dayOfWeek,
  setDayOfWeek,
  startDateOption,
  setStartDateOption,
  customStartDate,
  setCustomStartDate,
  startTime,
  setStartTime,
  useCsvPublishDates,
  setUseCsvPublishDates,
  wordpressDraftOnly,
  setWordpressDraftOnly,
  previewRows,
  rowOrder,
  isGeneratingChecklist,
  isProcessing,
  apiKey,
  openRouterApiKey,
  handleGenerateChecklist,
  setSelectedBlogIndices,
  postDestination,
  setPostDestination,
  postDestinationChoices,
  scheduleOccupancy,
  scheduleOccupancyLoading,
}: PromptInputSectionProps) {
  return (
    <div className="rounded-lg bg-black/25 p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <h3 className="text-base font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Prompt generator (checklist)
        </h3>
      </div>
      <div className="space-y-2">
      {/* Blog Generation Settings */}
      <BlogGenerationSettings
        numberOfBlogs={numberOfBlogs}
        setNumberOfBlogs={setNumberOfBlogs}
        optionalPrompt={optionalPrompt}
        setOptionalPrompt={setOptionalPrompt}
        featuredImagePerBlog={featuredImagePerBlog}
        setFeaturedImagePerBlog={setFeaturedImagePerBlog}
        featuredImageType={featuredImageType}
        setFeaturedImageType={setFeaturedImageType}
        isGeneratingChecklist={isGeneratingChecklist}
        isProcessing={isProcessing}
      />

      {/* WordPress Posting Options */}
      <WordPressPostingConfig
        selectedWordPressSites={selectedWordPressSites}
        setSelectedWordPressSites={setSelectedWordPressSites}
        siteConfigs={siteConfigs}
        setSiteConfigs={setSiteConfigs}
        scheduleFrequency={scheduleFrequency}
        setScheduleFrequency={setScheduleFrequency}
        customInterval={customInterval}
        setCustomInterval={setCustomInterval}
        dayOfWeek={dayOfWeek}
        setDayOfWeek={setDayOfWeek}
        startDateOption={startDateOption}
        setStartDateOption={setStartDateOption}
        customStartDate={customStartDate}
        setCustomStartDate={setCustomStartDate}
        startTime={startTime}
        setStartTime={setStartTime}
        useCsvPublishDates={useCsvPublishDates}
        setUseCsvPublishDates={setUseCsvPublishDates}
        wordpressDraftOnly={wordpressDraftOnly}
        setWordpressDraftOnly={setWordpressDraftOnly}
        previewRows={previewRows}
        rowOrder={rowOrder}
        isDisabled={isGeneratingChecklist || isProcessing}
        connectedSite={connectedSite}
        postDestination={postDestination}
        setPostDestination={setPostDestination}
        postDestinationChoices={postDestinationChoices}
        scheduleOccupancy={scheduleOccupancy}
        scheduleOccupancyLoading={scheduleOccupancyLoading}
      />

      <Button
        onClick={async () => {
          await handleGenerateChecklist();
        }}
        className={cn(
          'neo-pulse-btn-semantic-analysis w-full text-lg h-12',
          REPORTING_TOOLBAR_BTN,
        )}
        size="lg"
      >
        {isGeneratingChecklist ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Generating Blog Ideas...
          </>
        ) : (
          <>
            <MessageSquare className="h-5 w-5 mr-2" />
            Generate Blog Ideas
          </>
        )}
      </Button>
      </div>
    </div>
  );
}
