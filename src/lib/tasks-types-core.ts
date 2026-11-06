import type { TaskScheduleMode, TaskTriggerConfig, TaskTriggerMeta } from "@/lib/task-trigger-types";
import type { GscCompareRanges, GscReportingComparePresetId } from "@/lib/gsc-reporting/gsc-fetch-date-presets";
import type { GscReportStructure } from "@/lib/gsc-reporting/gsc-reporting-monthly-totals";
export type { TaskScheduleMode, TaskTriggerConfig, TaskTriggerMeta };

export type TaskRecurrenceRule = "none" | "daily" | "weekly" | "monthly" | "yearly";

export const TASK_RECURRENCE_LABELS: Record<TaskRecurrenceRule, string> = {
  none: "None",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export const TASK_RECURRENCE_RULES: TaskRecurrenceRule[] = ["none", "daily", "weekly", "monthly", "yearly"];

export type TaskScheduleMeta = {
  lastRunKey?: string;
  lastRunAt?: string;
};

export type TaskStatus = "todo" | "in_progress" | "done";

export type TaskExecutionKind =
  | "content_optimizer"
  | "content_optimizer_meta"
  | "gsc_reporting"
  | "ads_reporting"
  | "post_creator"
  | "entity_page_creator"
  | "entity_generator"
  | "sap_generator"
  | "local_dominator_export"
  | "chatgpt_website_audit"
  | "dfs_llm_article_audit"
  | "browser_automation"
  | "content_gap_check"
  | "csv_rows"
  | "";

export type ContentGapSitemapSource = "posts" | "sap";

export type ContentGapCountMode = "sitemap" | "scheduled_month" | "posted_month" | "editorial_month";

export type BrowserTargetUrlSource = "manual" | "client_site" | "variable";

export type GoogleDriveFolderSource = "manual" | "client_root" | "path" | "variable";

/** Grid is the only supported path; "wiki" is legacy JSON only. */
export type EntityPageLocationSource = "wiki" | "grid";

export type EntityPageGridInputSource = "upload" | "workflow";

export type EntityCsvInputSource = "upload" | "workflow";

export type GscReportingComparePreset = "mom" | "yoy";

export type PostCreatorKeywordSource = "prompt" | "gsc" | "manual";

export type PostCreatorEntityMode = "auto" | "manual" | "blank";

export type PostCreatorSitemapType = "post" | "entity";

export type PostCreatorPostDestination = "wordpress" | "draft";

export type PostCreatorExecutionPayload = {
  postCount?: number;
  keywordSource?: PostCreatorKeywordSource;
  optionalPrompt?: string;
  agentMailMessageId?: string;
  prefilledImportRows?: import("@/lib/bulk/bulk-csv-parser").CSVRow[];
  entityMode?: PostCreatorEntityMode;
  entityValue?: string;
  keywordValue?: string;
  titleTemplate?: string;
  featuredImage?: boolean;
  sitemapType?: PostCreatorSitemapType;
  postDestination?: PostCreatorPostDestination;
  scheduleTimesPerMonth?: number;
  scheduleStartDay?: number;
  scheduleStartTime?: string;
  scheduleStaggerOptimized?: boolean;
  /** Unique day-of-month slots when cadence is times per month. */
  schedulePublishDays?: number[];
  /** Full WordPress publish schedule (same model as Generator bulk). */
  scheduleFrequency?: import("@/lib/wordpress-scheduler").ScheduleFrequency;
  scheduleCustomInterval?: number;
  scheduleDayOfWeek?: number;
  scheduleStartDateOption?: "immediate" | "custom";
  /** Local calendar date YYYY-MM-DD for pick-date / anchor starts. */
  scheduleCustomStartDate?: string;
  scheduleDraftOnly?: boolean;
  saveLocalArchive?: boolean;
  useUpstreamContext?: boolean;
  workflowContextBlock?: string;
  sendAutomationEmail?: boolean;
  automationEmailTo?: string;
  saveToGoogleDrive?: boolean;
};

export type EntityPageCreatorExecutionPayload = PostCreatorExecutionPayload & {
  businessName?: string;
  keyword?: string;
  targetBucket?: TaskExecutionTargetBucket;
  locationSource?: EntityPageLocationSource;
  gridInputSource?: EntityPageGridInputSource;
  entityAdGroupCount?: number;
  entityAdsPerGroup?: number;
  entityPageCount?: number;
  /** When true, SAP page count comes from the site editorial package (Standard/Lite). */
  entityUseEditorialPackage?: boolean;
  /** When package mode is on, which tier quota to use (defaults to the workflow client package). */
  entityEditorialPackageTier?: import("@/lib/editorial-content-package").EditorialContentPackageTier;
  focusKeyword?: string;
  gridCsvUrl?: string;
  gridCsvBase64?: string;
  entityCsvInputSource?: EntityCsvInputSource;
  entityCsvUrl?: string;
  entityCsvBase64?: string;
  ragInputKeys?: string[];
  entityTypeFocus?: string[];
  radiusPreset?: import("@/components/integrations/entity-generation/types").RadiusDistancePreset;
};

export type TaskExecutionTargetBucket = "pages" | "posts" | "sap" | "all";
