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
};

export type EntityPageCreatorExecutionPayload = PostCreatorExecutionPayload & {
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

export type TaskExecutionPayload = {
  targetUrl?: string;
  targetBucket?: TaskExecutionTargetBucket;
  /** Set by trigger evaluator; only these URLs are optimized in trigger mode. */
  targetUrls?: string[];
  /** When missing_new_template, bulk Full AISEO keeps URLs that lack an Answer H2. */
  urlFilter?: "missing_new_template";
  postId?: number | null;
  updateMode?: "update" | "draft";
  comparePreset?: GscReportingComparePreset;
  gscComparePresetId?: GscReportingComparePresetId;
  gscCompareRanges?: GscCompareRanges;
  gscTrailingMonthCount?: number;
  gscReportStructure?: GscReportStructure;
  /** Base64 Local Dominator CSV for GSC report Local Insights section. */
  localDominatorCsvBase64?: string;
  /** Screenshot attachments for GSC report Local Insights section. */
  localInsightsImages?: Array<{ fileName: string; mime: string; contentBase64: string }>;
  /** Workflow client / connected property for this run (not the header active site). */
  siteId?: string;
  siteUrl?: string;
  productionSiteUrl?: string;
  businessName?: string;
  keyword?: string;
  /** Pre-set ChatGPT audit questions (optional blanks allowed). */
  auditQuestions?: string[];
  /** DFS article audit LLM platforms (chat_gpt, gemini, perplexity). Default all three when unset. */
  auditPlatforms?: import("@/lib/dfs-article-audit/dfs-article-audit-types").DfsArticleAuditPlatform[];
  /** WYSIWYG browser automation instructions (HTML). */
  browserInstructionsHtml?: string;
  /** How browser automation resolves its start URL. Defaults to manual. */
  targetUrlSource?: BrowserTargetUrlSource;
  /** Upstream workflow variable key when targetUrlSource is variable. */
  targetUrlVariable?: string;
  saveToDisk?: boolean;
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
  schedulePublishDays?: number[];
  scheduleFrequency?: import("@/lib/wordpress-scheduler").ScheduleFrequency;
  scheduleCustomInterval?: number;
  scheduleDayOfWeek?: number;
  scheduleStartDateOption?: "immediate" | "custom";
  scheduleCustomStartDate?: string;
  scheduleDraftOnly?: boolean;
  /** When true, each run saves outputs to the team task archive on the server. */
  saveLocalArchive?: boolean;
  /** Injected upstream workflow RAG context for downstream agents. */
  workflowContextBlock?: string;
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
  /** Clipped ACF seo_research snippet for DFS article audit. */
  seoResearchBrief?: string;
  /** CSV step: optimizer research keyed by URL. */
  prefilledUrlResearch?: Record<string, string>;
  /** CSV step file source. */
  csvInputSource?: "upload" | "workflow" | "site";
  csvBase64?: string;
  csvFileName?: string;
  csvHeaders?: string[];
  csvColumnMap?: import("@/lib/workflow/csv-rows-types").CsvRowsColumnMap;
  /** Post creator: inject previous-agent / CSV research into article prompts. */
  useUpstreamContext?: boolean;
  gridCsvUrl?: string;
  gridCsvBase64?: string;
  entityCsvInputSource?: EntityCsvInputSource;
  entityCsvUrl?: string;
  entityCsvBase64?: string;
  ragInputKeys?: string[];
  entityTypeFocus?: string[];
  radiusPreset?: import("@/components/integrations/entity-generation/types").RadiusDistancePreset;
  /** Then tab Email delivery (AgentMail). */
  sendAutomationEmail?: boolean;
  automationEmailTo?: string;
  automationEmailSubject?: string;
  automationEmailMessage?: string;
  automationEmailAiIntro?: boolean;
  /** Then tab Google Drive delivery. */
  saveToGoogleDrive?: boolean;
  googleDriveFolderId?: string;
  googleDriveFolderLabel?: string;
  googleDrivePresetKey?: string;
  googleDriveFolderSource?: GoogleDriveFolderSource;
  googleDriveFolderPath?: string;
  googleDriveFolderPathManual?: boolean;
  googleDriveFolderYear?: string;
  googleDriveFolderMonth?: string;
  googleDriveFolderVariable?: string;
  /** Leaf month folder from step test; uploads skip folder resolve when set. */
  googleDriveTargetFolderId?: string;
  contentGapSitemapSource?: ContentGapSitemapSource;
  contentGapCountMode?: ContentGapCountMode;
  contentGapTargetCount?: number;
  /** When true, target count comes from the site editorial package (blogs or SAP quota). */
  contentGapUseEditorialPackage?: boolean;
  /** Calendar month for scheduled/posted counts (YYYY-MM). Defaults to current month at run time. */
  contentGapCountMonth?: string;
  /** Day of every month this check is for (1–31). */
  contentGapDayOfMonth?: number;
  optimizationOptions?: {
    optimizeTitle?: boolean;
    optimizeMeta?: boolean;
    optimizeExcerpt?: boolean;
    optimizeContent?: boolean;
    optimizeFeaturedImage?: boolean;
    optimizeExtraText?: boolean;
    optimizeExtraImage?: boolean;
    useAcfKeyword?: boolean;
    manualKeyword?: string;
    testMode?: boolean;
    autoOptimize?: boolean;
    dfsArticleAuditBlock?: string;
    workflowContextBlock?: string;
    workflowAuditOutputs?: import("@/lib/workflow/workflow-types").WorkflowStepOutput[];
    optionalPrompt?: string;
    /** When true, run live SERP research even if ACF already has a brief. */
    forceNewResearch?: boolean;
  };
};

export type TaskExecutionStatus =
  | "queued"
  | "preflight"
  | "awaiting_client"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskExecutionProgress = {
  status?: string;
  stepId?: string;
  subProgress?: number;
  progress?: number;
  message?: string;
  microLog?: Array<{ stepId: string; message?: string }>;
  error?: string;
  startTime?: number;
  lastUpdate?: number;
  endTime?: number;
};

export type TaskExecutionClientRunContract = {
  executionId: number;
  siteId: string;
  url?: string;
  scope?: "single" | "all";
  targetBucket?: TaskExecutionTargetBucket;
  targetUrls?: string[];
  urlFilter?: "missing_new_template";
  updateMode?: "update" | "draft";
  optimizationOptions?: NonNullable<TaskExecutionPayload["optimizationOptions"]>;
  comparePreset?: GscReportingComparePreset;
  gscComparePresetId?: GscReportingComparePresetId;
  gscCompareRanges?: GscCompareRanges;
  gscTrailingMonthCount?: number;
  businessName?: string;
  keyword?: string;
  seoResearchBrief?: string;
  prefilledUrlResearch?: Record<string, string>;
  useUpstreamContext?: boolean;
  auditQuestions?: string[];
  auditPlatforms?: import("@/lib/dfs-article-audit/dfs-article-audit-types").DfsArticleAuditPlatform[];
  browserInstructionsHtml?: string;
  saveToDisk?: boolean;
  saveLocalArchive?: boolean;
  executionMode?: "client" | "server";
  sendAutomationEmail?: boolean;
  automationEmailTo?: string;
  automationEmailSubject?: string;
  automationEmailMessage?: string;
  automationEmailAiIntro?: boolean;
  saveToGoogleDrive?: boolean;
  googleDriveFolderId?: string;
  googleDriveFolderLabel?: string;
  googleDrivePresetKey?: string;
  googleDriveFolderSource?: GoogleDriveFolderSource;
  googleDriveFolderPath?: string;
  googleDriveFolderPathManual?: boolean;
  googleDriveFolderYear?: string;
  googleDriveFolderMonth?: string;
  googleDriveFolderVariable?: string;
  googleDriveTargetFolderId?: string;
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
  useUpstreamContext?: boolean;
  workflowContextBlock?: string;
  resolvedPost?: {
    id: number;
    subtype: string;
    link?: string;
    slug?: string;
    endpoint?: string;
  } | null;
};

export type TaskExecution = {
  id: number;
  teamId: number;
  taskId: number;
  executionKind: TaskExecutionKind;
  status: TaskExecutionStatus;
  startedBy: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  clientRunContract?: TaskExecutionClientRunContract | null;
  executionMode?: "client" | "server" | null;
  result?: unknown;
  error?: string;
  progress?: TaskExecutionProgress | null;
};

export type TaskPayloadKind = "project" | "task" | "note" | "file" | "template" | "section" | "tag";

export type TasksViewMode = "list" | "board" | "calendar" | "files";

export type TasksNavMode = "my" | "project";

export type TasksFilterMode = "incomplete" | "all" | "completed";

export type TasksSortMode = "dueDate" | "created" | "title";

export type TaskTemplateTaskDef = {
  keyword: string;
  title: string;
  status?: TaskStatus;
  clientSiteId?: string | null;
  assignPulse?: boolean;
  scheduleMode?: TaskScheduleMode;
  triggerConfig?: TaskTriggerConfig;
  recurrenceRule?: TaskRecurrenceRule;
  dueDate?: string;
  dueTime?: string;
  assigneeIds?: number[];
  tagIds?: string[];
  executionKind?: TaskExecutionKind;
  executionPayload?: TaskExecutionPayload;
};

export type DefaultTaskCreatePayload = {
  keyword?: string;
  title: string;
  status?: TaskStatus;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  recurrenceRule?: TaskRecurrenceRule;
  scheduleMode?: TaskScheduleMode;
  triggerConfig?: TaskTriggerConfig;
  assignPulse?: boolean;
  assigneeIds?: number[];
  tagIds?: string[];
  executionKind?: TaskExecutionKind;
  executionPayload?: TaskExecutionPayload;
  clientSiteId?: string | null;
};

export type TaskTemplate = {
  keyword: string;
  kind: "template";
  name: string;
  defaultTasks: TaskTemplateTaskDef[];
  defaultClientSiteId?: string | null;
};

export type TaskTag = {
  keyword: string;
  kind: "tag";
  name: string;
  color: string;
};

export type TaskSection = {
  id: number;
  teamId: number;
  projectId: number;
  sortOrder: number;
  createdAt: string;
  payload: Record<string, unknown>;
  keyword: string;
  title: string;
};

export type ForgeAutomationVisibility = "public" | "private";

export type TaskProject = {
  id: number;
  teamId: number;
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  payload: Record<string, unknown>;
  keyword: string;
  title: string;
  description: string;
  wordpressSiteId?: string;
  isAutomation?: boolean;
  sourceTemplateKeyword?: string;
  createdBy?: number;
  automationVisibility?: ForgeAutomationVisibility;
};

export type TeamTask = {
  id: number;
  teamId: number;
  projectId: number;
  sectionId: number;
  parentTaskId: number;
  status: TaskStatus;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
  keyword: string;
  title: string;
  description: string;
  dueDate: string;
  /** HH:mm in America/Edmonton */
  dueTime?: string;
  assigneeIds: number[];
  tagIds: string[];
  projectTitle: string;
  wordpressSiteId?: string;
  recurrenceRule?: TaskRecurrenceRule;
  scheduleMode?: TaskScheduleMode;
  triggerConfig?: TaskTriggerConfig;
  triggerMeta?: TaskTriggerMeta;
  scheduleMeta?: TaskScheduleMeta;
  executionKind?: TaskExecutionKind;
  executionPayload?: TaskExecutionPayload;
  lastExecutionId?: number | null;
  lastExecutionStatus?: TaskExecutionStatus | string | null;
};

export type TaskNote = {
  id: number;
  teamId: number;
  taskId: number;
  createdAt: string;
  payload: Record<string, unknown>;
  body: string;
  authorId: number;
  keyword: string;
  mentionUserIds: number[];
};

export type TaskFile = {
  id: number;
  teamId: number;
  taskId: number;
  storagePath: string;
  createdAt: string;
  payload: Record<string, unknown>;
  fileName: string;
  mime: string;
  uploadedBy: number;
  keyword: string;
  taskTitle?: string;
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
