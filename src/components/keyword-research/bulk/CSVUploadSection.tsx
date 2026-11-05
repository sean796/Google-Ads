import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { notify } from "@/lib/app-notifications";
import { NOTIFY_PLEASE_SELECT_A_CSV_FILE, notifyFailedToLoadCsvX, notifyLoadedXRowsFromCsv } from "@/lib/notify-messages";
import type { CSVRow, WordPressPostDestination } from '@/lib/bulk-auto-generate';
import type { ConnectedSiteSummary } from '@/components/integrations/types';
import { WordPressPostingConfig } from './WordPressPostingConfig';
import type { ScheduleOccupancy } from '@/lib/bulk-schedule-gap';
import type { ScheduleFrequency } from '@/lib/wordpress-scheduler';
import type { BulkSitemapMode } from '@/lib/bulk/bulk-sitemap-mode';
import {
  BULK_AUTO_GENERATE_TEMPLATE_FILENAME,
  BULK_AUTO_GENERATE_TEMPLATE_HREF,
} from '@/lib/bulk/bulk-auto-generate-template-columns';
import { Button, FileInput } from "@/ui";

interface SiteConfig {
  sitemapType: BulkSitemapMode;
}

interface CSVUploadSectionProps {
  csvFile: File | null;
  setCsvFile: (file: File | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  rows: CSVRow[];
  loadCSV: (file: File) => Promise<CSVRow[]>;
  connectedSite: ConnectedSiteSummary | null;
  isProcessing: boolean;
  /** When set, replaces the CSV file picker (e.g. SAP generator in-memory rows). */
  replaceFileUploadWith?: React.ReactNode;
  // WordPress posting props
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
  /** SAP generator: tighter schedule UI + compact summary. */
  sapMode?: boolean;
  postDestination: WordPressPostDestination;
  setPostDestination: (value: WordPressPostDestination) => void;
  postDestinationChoices?: WordPressPostDestination[];
  scheduleOccupancy?: ScheduleOccupancy | null;
  scheduleOccupancyLoading?: boolean;
  hideFileUploadSlot?: boolean;
  hideWordPressPostingInBody?: boolean;
}

export function CSVUploadSection({
  csvFile,
  setCsvFile,
  fileInputRef,
  rows,
  loadCSV,
  connectedSite,
  isProcessing,
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
  replaceFileUploadWith,
  sapMode = false,
  postDestination,
  setPostDestination,
  postDestinationChoices,
  scheduleOccupancy,
  scheduleOccupancyLoading,
  hideFileUploadSlot = false,
  hideWordPressPostingInBody = false,
}: CSVUploadSectionProps) {
  if (hideFileUploadSlot && hideWordPressPostingInBody) {
    return null;
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      notify.error(NOTIFY_PLEASE_SELECT_A_CSV_FILE);
      return;
    }

    try {
      setCsvFile(file);
      const loadedRows = await loadCSV(file);
      notify.success(notifyLoadedXRowsFromCsv(loadedRows.length));
    } catch (error) {
      notify.error(notifyFailedToLoadCsvX(error instanceof Error ? error.message : 'Unknown error'));
      setCsvFile(null);
    }
  };

  return (
    <div className="space-y-2">
      {!hideFileUploadSlot && (replaceFileUploadWith != null ? (
        <div>{replaceFileUploadWith}</div>
      ) : (
      <div className="space-y-2">
        <div className="flex items-center justify-end">
          <a
            href={BULK_AUTO_GENERATE_TEMPLATE_HREF}
            download={BULK_AUTO_GENERATE_TEMPLATE_FILENAME}
            className="text-xs text-primary hover:underline"
          >
            Download Template
          </a>
        </div>
        <div className="flex items-center gap-2">
          <FileInput
            ref={fileInputRef}
            accept=".csv"
            onChange={handleFileSelect}
            disabled={isProcessing}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
          >
            <Upload className="h-4 w-4 mr-2" />
            {csvFile ? csvFile.name : 'Select CSV'}
          </Button>
          {csvFile && (
            <Button
              variant="quiet"
              onClick={() => {
                setCsvFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
              disabled={isProcessing}
            >
              Clear
            </Button>
          )}
        </div>
        {rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {rows.length} row{rows.length !== 1 ? 's' : ''} loaded
          </p>
        )}
      </div>
      ))}

      {/* Connected site + WordPress: semantic publish zone in SAP mode */}
      {!hideWordPressPostingInBody && sapMode ? (
        <div className="rounded-md bg-muted/15 p-2">
          <div className="space-y-1.5">
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
              isDisabled={isProcessing}
              connectedSite={connectedSite}
              sapMode={sapMode}
              postDestination={postDestination}
              setPostDestination={setPostDestination}
              postDestinationChoices={postDestinationChoices}
              scheduleOccupancy={scheduleOccupancy}
              scheduleOccupancyLoading={scheduleOccupancyLoading}
            />
          </div>
        </div>
      ) : !hideWordPressPostingInBody ? (
        <>
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
            isDisabled={isProcessing}
            connectedSite={connectedSite}
            sapMode={sapMode}
            postDestination={postDestination}
            setPostDestination={setPostDestination}
            postDestinationChoices={postDestinationChoices}
            scheduleOccupancy={scheduleOccupancy}
            scheduleOccupancyLoading={scheduleOccupancyLoading}
          />
        </>
      ) : null}
    </div>
  );
}
