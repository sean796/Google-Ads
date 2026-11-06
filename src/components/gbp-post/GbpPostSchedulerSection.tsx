import React, { useMemo } from "react";
import { Calendar } from "lucide-react";
import { BlogGenerationSettings } from "@/components/keyword-research/bulk/BlogGenerationSettings";
import { WordPressPostingConfig } from "@/components/keyword-research/bulk/WordPressPostingConfig";
import type { ConnectedSiteSummary } from "@/components/integrations/types";
import type { WordPressSite } from "@/components/integrations/types";
import type { CSVRow, WordPressPostDestination } from "@/lib/bulk-auto-generate";
import {
  clampNumberOfGbpPosts,
  getFirstOfThisMonthDate,
  type GbpSchedulerSectionState,
} from "@/lib/gbp-post/gbp-schedule-plan";
import {
  clampTimesPerMonth,
  type ScheduleFrequency,
} from "@/lib/wordpress-scheduler";

function buildGbpPreviewRows(count: number, keyword: string): CSVRow[] {
  const n = clampNumberOfGbpPosts(count);
  const kw = keyword.trim();
  return Array.from({ length: n }, (_, i) => ({
    title: kw ? `${kw} (GBP ${i + 1})` : `GBP post ${i + 1}`,
    keyword: kw || `gbp-post-${i + 1}`,
    keyword_focus: kw || undefined,
  }));
}

export type { GbpSchedulerSectionState } from "@/lib/gbp-post/gbp-schedule-plan";

function ensureSchedulerDate(value: unknown, startTime: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return getFirstOfThisMonthDate(startTime);
}

interface GbpPostSchedulerSectionProps {
  site: WordPressSite;
  keyword: string;
  scheduler: GbpSchedulerSectionState;
  setScheduler: React.Dispatch<React.SetStateAction<GbpSchedulerSectionState>>;
  disabled?: boolean;
  hidePostCount?: boolean;
}

/**
 * Same layout as Prompt generator → WordPressPostingConfig (blog bulk scheduler).
 */
export const GbpPostSchedulerSection: React.FC<GbpPostSchedulerSectionProps> = ({
  site,
  keyword,
  scheduler,
  setScheduler,
  disabled = false,
  hidePostCount = false,
}) => {
  const connectedSite: ConnectedSiteSummary = useMemo(
    () => ({
      name: site.name,
      siteUrl: site.siteUrl,
      productionSiteUrl: site.productionSiteUrl,
    }),
    [site.name, site.siteUrl, site.productionSiteUrl],
  );

  const previewRows = useMemo(
    () => buildGbpPreviewRows(scheduler.numberOfPosts, keyword),
    [scheduler.numberOfPosts, keyword],
  );

  const [selectedWordPressSites, setSelectedWordPressSites] = React.useState<Set<string>>(
    () => new Set([site.id]),
  );
  const [siteConfigs, setSiteConfigs] = React.useState<Record<string, { sitemapType: "post" }>>({
    [site.id]: { sitemapType: "post" },
  });
  const [postDestination, setPostDestination] = React.useState<WordPressPostDestination>("wordpress");

  const setNumberOfPosts = (n: number) => {
    const count = clampNumberOfGbpPosts(n);
    setScheduler((prev) => ({
      ...prev,
      numberOfPosts: count,
      rowOrder: Array.from({ length: count }, (_, i) => i),
    }));
  };

  return (
    <div className="rounded-lg bg-black/25 p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <h3 className="text-base font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          GBP schedule
        </h3>
      </div>
      <div className="space-y-2">
        {hidePostCount ? null : (
          <BlogGenerationSettings
            numberOfBlogs={scheduler.numberOfPosts}
            setNumberOfBlogs={setNumberOfPosts}
            optionalPrompt=""
            setOptionalPrompt={() => {}}
            featuredImagePerBlog={false}
            setFeaturedImagePerBlog={() => {}}
            featuredImageType="ai-generated"
            setFeaturedImageType={() => {}}
            isGeneratingChecklist={false}
            isProcessing={disabled}
            countOnly
            countLabel="How many GBP posts"
            countPlaceholder="How many GBP posts"
          />
        )}

        <WordPressPostingConfig
          selectedWordPressSites={selectedWordPressSites}
          setSelectedWordPressSites={setSelectedWordPressSites}
          siteConfigs={siteConfigs}
          setSiteConfigs={setSiteConfigs}
          scheduleFrequency={scheduler.scheduleFrequency}
          setScheduleFrequency={(f) => setScheduler((p) => ({ ...p, scheduleFrequency: f }))}
          customInterval={scheduler.customInterval}
          setCustomInterval={(n) =>
            setScheduler((p) => ({
              ...p,
              customInterval:
                p.scheduleFrequency === "everyNDays"
                  ? n
                  : clampTimesPerMonth(n),
            }))
          }
          dayOfWeek={scheduler.dayOfWeek}
          setDayOfWeek={(d) => setScheduler((p) => ({ ...p, dayOfWeek: d }))}
          startDateOption={scheduler.startDateOption}
          setStartDateOption={(v) => setScheduler((p) => ({ ...p, startDateOption: v }))}
          customStartDate={ensureSchedulerDate(scheduler.customStartDate, scheduler.startTime)}
          setCustomStartDate={(d) =>
            setScheduler((p) => ({ ...p, customStartDate: d }))
          }
          startTime={scheduler.startTime}
          setStartTime={(t) => setScheduler((p) => ({ ...p, startTime: t }))}
          useCsvPublishDates={false}
          setUseCsvPublishDates={() => {}}
          wordpressDraftOnly={false}
          setWordpressDraftOnly={() => {}}
          previewRows={previewRows}
          rowOrder={scheduler.rowOrder}
          isDisabled={disabled}
          connectedSite={connectedSite}
          gbpMode
          postDestination={postDestination}
          setPostDestination={setPostDestination}
        />
      </div>
    </div>
  );
};
