import { useEffect } from 'react';
import type { ScheduleOccupancy } from '@/lib/bulk-schedule-gap';
import type { ScheduleFrequency } from '@/lib/wordpress-scheduler';
import { getStoredSites, type WordPressSite } from '@/components/IntegrationsTab';
import type { ConnectedSiteSummary } from '@/components/integrations/types';
import { cn } from '@/lib/utils';
import {
  BULK_POST_DESTINATION_CHOICES,
  WORDPRESS_POST_DESTINATION_LONG,
  type CSVRow,
  type WordPressPostDestination,
} from '@/lib/bulk-auto-generate';
import { WordPressScheduleFields } from './WordPressScheduleFields';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { defaultBulkSitemapMode, type BulkSitemapMode } from '@/lib/bulk/bulk-sitemap-mode';
import { SelectField } from "@/ui";

interface SiteConfig {
  sitemapType: BulkSitemapMode;
}

interface WordPressPostingConfigProps {
  selectedWordPressSites: Set<string>;
  setSelectedWordPressSites: (value: Set<string>) => void;
  siteConfigs: Record<string, SiteConfig>;
  setSiteConfigs: (
    value: Record<string, SiteConfig> | ((prev: Record<string, SiteConfig>) => Record<string, SiteConfig>)
  ) => void;
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
  /** When true, non-empty `publish_date_gmt` cells override frequency schedule for that row. */
  useCsvPublishDates: boolean;
  setUseCsvPublishDates: (value: boolean) => void;
  wordpressDraftOnly: boolean;
  setWordpressDraftOnly: (value: boolean) => void;
  /** Rows that will be processed (effective batch). */
  previewRows: CSVRow[];
  rowOrder: number[];
  isDisabled?: boolean;
  connectedSite?: ConnectedSiteSummary | null;
  /** SAP generator: prefer entity sitemap when no saved config. */
  sapMode?: boolean;
  /** GBP Post: schedule grid only (hide WordPress destination, sitemap, CSV overrides). */
  gbpMode?: boolean;
  postDestination: WordPressPostDestination;
  setPostDestination: (value: WordPressPostDestination) => void;
  /** Which export radios to show (default: wordpress, local). */
  postDestinationChoices?: WordPressPostDestination[];
  /** Post inventory occupancy for Next available slot (gap scheduling). */
  scheduleOccupancy?: ScheduleOccupancy | null;
  scheduleOccupancyLoading?: boolean;
  /** Blog import details: destination is in the workspace header toolbar. */
  hideDestinationRadios?: boolean;
  /** Workspace chrome: schedule lives in title-row menu, not details drawer. */
  hideScheduleFields?: boolean;
  /** CSV workspace: sitemap lives in title-row menu, not details drawer. */
  hideSitemapField?: boolean;
}

export function WordPressPostingConfig({
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
  previewRows: _previewRows,
  rowOrder: _rowOrder,
  isDisabled = false,
  connectedSite,
  sapMode = false,
  gbpMode = false,
  postDestination,
  setPostDestination,
  postDestinationChoices = BULK_POST_DESTINATION_CHOICES,
  scheduleOccupancy = null,
  scheduleOccupancyLoading = false,
  hideDestinationRadios = false,
  hideScheduleFields = false,
  hideSitemapField = false,
}: WordPressPostingConfigProps) {
  const sites = getStoredSites();
  const isLocalExport = postDestination === 'local';
  const showRemotePostingFields = !gbpMode && !isLocalExport;

  useEffect(() => {
    if (!postDestinationChoices.includes(postDestination)) {
      setPostDestination(postDestinationChoices[0] ?? 'wordpress');
    }
  }, [postDestination, postDestinationChoices, setPostDestination]);

  const getTargetSite = (): WordPressSite | null => {
    if (!connectedSite || sites.length === 0) return null;
    const normalize = (url: string) =>
      url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');
    return (
      sites.find((s) => normalize(s.siteUrl) === normalize(connectedSite.siteUrl)) ?? null
    );
  };

  const targetSite = getTargetSite();

  useEffect(() => {
    if (!targetSite || isDisabled) return;
    setSelectedWordPressSites((prev) => {
      if (prev.has(targetSite.id)) return prev;
      return new Set([targetSite.id]);
    });
    setSiteConfigs((prev) => {
      if (prev[targetSite.id]) return prev;
      return {
        ...prev,
        [targetSite.id]: {
          sitemapType: sapMode && targetSite.entitySitemapUrl ? 'entity' : defaultBulkSitemapMode(),
        },
      };
    });
  }, [targetSite, sapMode, isDisabled, setSelectedWordPressSites, setSiteConfigs]);

  const useGapScheduling =
    startDateOption === 'immediate' &&
    !gbpMode &&
    postDestination !== 'local' &&
    scheduleFrequency !== 'immediately' &&
    Boolean(scheduleOccupancy);

  return (
    <div className={cn('space-y-1.5', sapMode ? 'mt-1' : 'mt-2')}>
      {targetSite && (
        <div className="flex flex-col gap-1 rounded-md bg-muted/20 p-1.5">
          {(() => {
            const site = targetSite;
            const config = siteConfigs[site.id] || {
              sitemapType: sapMode && site.entitySitemapUrl ? 'entity' : defaultBulkSitemapMode(),
            };

            return (
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {!gbpMode && !hideDestinationRadios ? (
                <div className="flex flex-col gap-2 rounded-md bg-muted/15 p-2 sm:col-span-2">
                  <span className="text-base font-medium text-foreground">Export destination</span>
                  <RadioGroup
                    value={postDestination}
                    onValueChange={(v) => setPostDestination(v as WordPressPostDestination)}
                    disabled={isDisabled}
                    className="flex flex-wrap gap-4"
                  >
                    {postDestinationChoices.map((choice) => (
                      <div key={choice} className="flex items-center gap-2">
                        <RadioGroupItem value={choice} id={`bulk-pd-${choice}`} />
                        <label
                          htmlFor={`bulk-pd-${choice}`}
                          className="cursor-pointer text-base font-normal"
                        >
                          {WORDPRESS_POST_DESTINATION_LONG[choice]}
                        </label>
                      </div>
                    ))}
                  </RadioGroup>
                  {postDestination === 'local' ? (
                    <p className="text-base text-muted-foreground">
                      Full harness and SEO pipeline run locally. Download JSON, blueprint, and post-body CSV from the
                      files panel. Nothing is sent to WordPress.
                    </p>
                  ) : null}
                </div>
                ) : null}

                {showRemotePostingFields && !hideSitemapField ? (
                <>
                <div className="min-w-0">
                  <SelectField
                    placeholder="Sitemap type"
                    value={config.sitemapType}
                    onValueChange={(value) => {
                      setSiteConfigs((prev) => ({
                        ...prev,
                        [site.id]: {
                          ...prev[site.id],
                          sitemapType: value as 'post' | 'entity',
                        },
                      }));
                    }}
                    options={[
                      { value: "post", label: "Post (post-sitemap.xml)" },
                      {
                        value: "entity",
                        label: `Entity (${site.entitySitemapUrl ? site.entitySitemapUrl.split('/').pop() : 'Not configured'})`,
                        disabled: !site.entitySitemapUrl,
                      },
                    ]}
                    width="full"
                    disabled={isDisabled}
                  />
                </div>

                {!hideScheduleFields ? (
                  <WordPressScheduleFields
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
                    isDisabled={isDisabled}
                    gbpMode={gbpMode}
                    useGapScheduling={useGapScheduling}
                    scheduleOccupancyLoading={scheduleOccupancyLoading}
                  />
                ) : null}
                </>
                ) : null}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
