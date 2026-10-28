import React, { useCallback, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  TASK_FORM_FLAT_CONTROL_CLASS,
  TaskFormFlatGrid,
  TaskFormFlatSelectPlaceholder,
  TaskFormInlineRow,
  TaskFormPanel,
} from "@/components/manager/tasks/TaskFormLayout";
import { AutomationWhatAspectPills } from "@/components/manager/tasks/planner/AutomationWhatAspectPills";
import { PostCreatorExecutionFields } from "@/components/manager/tasks/PostCreatorExecutionFields";
import { GscReportingExecutionFields } from "@/components/manager/tasks/GscReportingExecutionFields";
import { AdsReportingExecutionFields } from "@/components/manager/tasks/AdsReportingExecutionFields";
import { ChatGptAuditExecutionFields } from "@/components/manager/tasks/ChatGptAuditExecutionFields";
import { DfsArticleAuditExecutionFields } from "@/components/manager/tasks/DfsArticleAuditExecutionFields";
import { BrowserAutomationExecutionFields } from "@/components/manager/tasks/BrowserAutomationExecutionFields";
import { ContentGapCheckExecutionFields, ensureContentGapCheckPayload } from "@/components/manager/tasks/ContentGapCheckExecutionFields";
import { LocalDominatorExportExecutionFields } from "@/components/manager/tasks/LocalDominatorExportExecutionFields";
import { TaskExecutionTargetFields } from "@/components/manager/tasks/TaskExecutionTargetFields";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import {
  AUTOMATION_RECIPE_BUCKET_LABELS,
  AUTOMATION_RECIPE_CATEGORY_ORDER,
  automationRecipeCategoryLabel,
} from "@/lib/automation-recipes-filters";
import type { AutomationBlockCatalogItem } from "@/lib/automation-blocks-api";
import {
  mergeActionBlockFilterOptions,
  type AutomationActionBlockListQuery,
} from "@/lib/automation-action-block-filters";
import type { AutomationActionBlock } from "@/lib/automation-planner-types";
import { EntityPageCreatorExecutionFields } from "@/components/manager/tasks/EntityPageCreatorExecutionFields";
import { CsvRowsExecutionFields } from "@/components/manager/workflow/WorkflowCsvRowsInspector";
import { EntityGeneratorExecutionFields } from "@/components/manager/tasks/EntityGeneratorExecutionFields";
import { SapGeneratorExecutionFields } from "@/components/manager/tasks/SapGeneratorExecutionFields";
import { ensureEntityPageCreatorPayload } from "@/lib/entity-page-creator/entity-page-creator-defaults";
import { ensurePostCreatorPayload } from "@/lib/post-creator/post-creator-defaults";
import {
  ensureOptimizationOptions,
  inferOptimizerKindFromOptions,
  inferOptimizerKeywordFromOptions,
} from "@/lib/task-optimization-options-defaults";
import type { EntityPageCreatorExecutionPayload, TaskExecutionKind, TaskExecutionPayload } from "@/lib/tasks-types";
import {
  CSV_ROWS_ACTION_KEYWORD,
  csvRowsConfigFromPayload,
  csvRowsPayloadFromConfig,
  isCsvRowsActionKeyword,
} from "@/lib/workflow/csv-rows-types";
import { BULK_HEADER_SELECT } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";

const SCHEDULE_PAYLOAD_KEYS: (keyof TaskExecutionPayload)[] = [
  "scheduleFrequency",
  "scheduleCustomInterval",
  "scheduleDayOfWeek",
  "scheduleStartDateOption",
  "scheduleCustomStartDate",
  "scheduleTimesPerMonth",
  "scheduleStartDay",
  "scheduleStartTime",
  "scheduleStaggerOptimized",
  "schedulePublishDays",
  "scheduleDraftOnly",
  "saveLocalArchive",
  "sendAutomationEmail",
  "automationEmailTo",
  "automationEmailSubject",
  "automationEmailMessage",
  "automationEmailAiIntro",
  "saveToGoogleDrive",
  "googleDriveFolderId",
  "googleDriveFolderLabel",
  "googleDrivePresetKey",
  "googleDriveFolderSource",
  "googleDriveFolderPath",
  "googleDriveFolderPathManual",
  "googleDriveFolderVariable",
];

const ACTION_KIND_PILLS: { keyword: string; label: string; kind: TaskExecutionKind }[] = [
  { keyword: "content-optimizer-full", label: "Full AISEO", kind: "content_optimizer" },
  { keyword: "content-optimizer-meta", label: "Meta + extra text", kind: "content_optimizer_meta" },
  { keyword: "post-creator-monthly", label: "Post creator", kind: "post_creator" },
  { keyword: "gsc-report-mom", label: "GSC MoM", kind: "gsc_reporting" },
  { keyword: "gsc-report-yoy", label: "GSC YoY", kind: "gsc_reporting" },
  { keyword: "ads-report-mom", label: "Ads MoM", kind: "ads_reporting" },
  { keyword: "ads-report-yoy", label: "Ads YoY", kind: "ads_reporting" },
  { keyword: "entity-page-creator-monthly", label: "Entity pages", kind: "entity_page_creator" },
  { keyword: "entity-generator-monthly", label: "Entity generator", kind: "entity_generator" },
  { keyword: "sap-generator-monthly", label: "SAP generator", kind: "sap_generator" },
  { keyword: "local-dominator-grid-export", label: "Local Grid export", kind: "local_dominator_export" },
  { keyword: "chatgpt-website-audit", label: "ChatGPT website audit", kind: "chatgpt_website_audit" },
  { keyword: "dfs-llm-article-audit", label: "DFS LLM article audit", kind: "dfs_llm_article_audit" },
  { keyword: "residential-browser-automation", label: "Residential browser automation", kind: "browser_automation" },
  { keyword: "content-gap-check", label: "Content gap check", kind: "content_gap_check" },
];

function preserveSchedulePayload(
  current: TaskExecutionPayload,
  next: TaskExecutionPayload,
): TaskExecutionPayload {
  const preserved: Partial<TaskExecutionPayload> = {};
  for (const key of SCHEDULE_PAYLOAD_KEYS) {
    if (current[key] !== undefined) preserved[key] = current[key];
  }
  return { ...next, ...preserved };
}

function applyActionBlockDefaults(
  block: AutomationBlockCatalogItem,
  current: AutomationActionBlock,
): AutomationActionBlock {
  const d = (block.defaults?.executionPayload ?? {}) as TaskExecutionPayload;
  let mergedPayload = preserveSchedulePayload(current.executionPayload, {
    ...current.executionPayload,
    ...d,
  });
  const kind = (block.executionKind ?? current.executionKind) as TaskExecutionKind;
  if (kind === "content_optimizer" || kind === "content_optimizer_meta") {
    mergedPayload = ensureOptimizationOptions(mergedPayload, block.keyword);
  }
  if (kind === "entity_page_creator" || kind === "entity_generator" || kind === "sap_generator") {
    mergedPayload = ensureEntityPageCreatorPayload(mergedPayload as EntityPageCreatorExecutionPayload);
  }
  return {
    keyword: block.keyword,
    executionKind: kind,
    executionPayload: mergedPayload,
    title: current.title,
  };
}

function FilterSelect({
  value,
  onChange,
  children,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  "aria-label": string;
}): React.ReactElement {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={`${BULK_HEADER_SELECT} h-8 shrink-0 text-base [color-scheme:dark]`}
    >
      {children}
    </select>
  );
}

export type AutomationWhatPanelProps = {
  action: AutomationActionBlock;
  actionBlocks: AutomationBlockCatalogItem[];
  clientSiteId?: string;
  disabled?: boolean;
  pillTone?: "default" | "forge" | "monochrome";
  onChange: (action: AutomationActionBlock) => void;
};

export function AutomationWhatPanel({
  action,
  actionBlocks,
  clientSiteId,
  disabled = false,
  pillTone = "default",
  onChange,
}: AutomationWhatPanelProps): React.ReactElement {
  const [query, setQuery] = useState<AutomationActionBlockListQuery>({});

  const filterOptions = useMemo(
    () => mergeActionBlockFilterOptions(actionBlocks),
    [actionBlocks],
  );

  const catalogPills = useMemo(
    () =>
      ACTION_KIND_PILLS.filter((pill) =>
        actionBlocks.some((block) => block.keyword === pill.keyword),
      ),
    [actionBlocks],
  );

  const patchQuery = useCallback((patch: Partial<AutomationActionBlockListQuery>) => {
    setQuery((current) => ({ ...current, ...patch }));
  }, []);

  const handleSelectBlock = (keyword: string) => {
    if (keyword === CSV_ROWS_ACTION_KEYWORD) {
      onChange({
        keyword: CSV_ROWS_ACTION_KEYWORD,
        executionKind: "",
        executionPayload: csvRowsPayloadFromConfig(csvRowsConfigFromPayload(action.executionPayload)),
        title: action.title || "CSV rows",
      });
      return;
    }
    const block = actionBlocks.find((b) => b.keyword === keyword);
    if (!block) return;
    onChange(applyActionBlockDefaults(block, action));
  };

  const patchPayload = (partial: Partial<TaskExecutionPayload>) => {
    onChange({
      ...action,
      executionPayload: { ...action.executionPayload, ...partial },
    });
  };

  const kind = action.executionKind;
  const isOptimizer = kind === "content_optimizer" || kind === "content_optimizer_meta";
  const optimizerPayload = isOptimizer
    ? ensureOptimizationOptions(action.executionPayload, action.keyword)
    : action.executionPayload;

  const handleAspectChange = (executionPayload: TaskExecutionPayload) => {
    const options = executionPayload.optimizationOptions ?? {};
    const executionKind = inferOptimizerKindFromOptions(options);
    const keyword = inferOptimizerKeywordFromOptions(options);
    onChange({
      ...action,
      keyword,
      executionKind,
      executionPayload,
    });
  };

  const showAspectPills = isOptimizer;

  return (
    <div className="flex flex-col gap-3 rounded-none bg-zinc-900/50 p-4">
      <div className="flex flex-wrap items-center gap-2 bg-black px-3 py-2">
        <FilterSelect
          aria-label="Category"
          value={query.category ?? ""}
          onChange={(category) => patchQuery({ category: category || undefined })}
        >
          <option value="">All categories</option>
          {AUTOMATION_RECIPE_CATEGORY_ORDER.filter((cat) => filterOptions.categories.includes(cat)).map(
            (cat) => (
              <option key={cat} value={cat}>
                {automationRecipeCategoryLabel(cat)}
              </option>
            ),
          )}
        </FilterSelect>
        <FilterSelect
          aria-label="Bucket"
          value={query.bucket ?? ""}
          onChange={(bucket) => patchQuery({ bucket: bucket || undefined })}
        >
          <option value="">All buckets</option>
          {filterOptions.buckets.map((bucket) => (
            <option key={bucket} value={bucket}>
              {AUTOMATION_RECIPE_BUCKET_LABELS[bucket] ?? bucket}
            </option>
          ))}
        </FilterSelect>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {catalogPills.map(({ keyword, label, kind: pillKind }) => (
          <WorkspacePill
            key={keyword}
            label={label}
            square
            tone={pillTone}
            active={action.keyword === keyword && action.executionKind === pillKind}
            disabled={disabled}
            onClick={() => handleSelectBlock(keyword)}
          />
        ))}
        <WorkspacePill
          label="CSV rows"
          square
          tone={pillTone}
          active={isCsvRowsActionKeyword(action.keyword)}
          disabled={disabled}
          onClick={() => handleSelectBlock(CSV_ROWS_ACTION_KEYWORD)}
        />
        {showAspectPills ? (
          <AutomationWhatAspectPills
            executionPayload={optimizerPayload}
            disabled={disabled}
            pillTone={pillTone}
            onChange={handleAspectChange}
          />
        ) : null}
      </div>

      <TaskFormInlineRow label="Run title">
        <Input
          value={action.title ?? ""}
          onChange={(e) => onChange({ ...action, title: e.target.value })}
          placeholder="Optional task title"
          disabled={disabled}
          className={TASK_FORM_FLAT_CONTROL_CLASS}
        />
      </TaskFormInlineRow>

      {isOptimizer ? (
        <TaskFormPanel title="Scope">
          <TaskFormFlatGrid className="grid-cols-2">
            <TaskExecutionTargetFields
              variant="flatPlaceholder"
              bucketLabel="Target bucket"
              executionPayload={optimizerPayload}
              disabled={disabled}
              onChange={(executionPayload) => onChange({ ...action, executionPayload })}
            />
            <TaskFormFlatSelectPlaceholder
              placeholder="Update mode"
              value={optimizerPayload.updateMode ?? "update"}
              onChange={(v) => patchPayload({ updateMode: v as TaskExecutionPayload["updateMode"] })}
              disabled={disabled}
              options={[
                { value: "update", label: "Update live" },
                { value: "draft", label: "Draft only" },
              ]}
            />
          </TaskFormFlatGrid>
        </TaskFormPanel>
      ) : null}

      {kind === "post_creator" ? (
        <PostCreatorExecutionFields
          surface="what"
          executionPayload={ensurePostCreatorPayload(action.executionPayload)}
          disabled={disabled}
          onChange={(executionPayload) =>
            onChange({
              ...action,
              executionKind: "post_creator",
              executionPayload: ensurePostCreatorPayload(executionPayload),
            })
          }
        />
      ) : null}

      {kind === "entity_page_creator" ? (
        <EntityPageCreatorExecutionFields
          surface="what"
          executionPayload={ensureEntityPageCreatorPayload(action.executionPayload as EntityPageCreatorExecutionPayload)}
          disabled={disabled}
          onChange={(executionPayload) =>
            onChange({
              ...action,
              executionKind: "entity_page_creator",
              executionPayload: ensureEntityPageCreatorPayload(executionPayload as EntityPageCreatorExecutionPayload),
            })
          }
        />
      ) : null}

      {kind === "entity_generator" ? (
        <EntityGeneratorExecutionFields
          surface="what"
          executionPayload={ensureEntityPageCreatorPayload(action.executionPayload as EntityPageCreatorExecutionPayload)}
          disabled={disabled}
          onChange={(executionPayload) =>
            onChange({
              ...action,
              executionKind: "entity_generator",
              executionPayload: ensureEntityPageCreatorPayload(executionPayload as EntityPageCreatorExecutionPayload),
            })
          }
        />
      ) : null}

      {kind === "sap_generator" ? (
        <SapGeneratorExecutionFields
          executionPayload={ensureEntityPageCreatorPayload(action.executionPayload as EntityPageCreatorExecutionPayload)}
          disabled={disabled}
          workflowEntityCsvLocked={
            (action.executionPayload as EntityPageCreatorExecutionPayload)?.entityCsvInputSource === "workflow"
          }
          onChange={(executionPayload) =>
            onChange({
              ...action,
              executionKind: "sap_generator",
              executionPayload: ensureEntityPageCreatorPayload(executionPayload as EntityPageCreatorExecutionPayload),
            })
          }
        />
      ) : null}

      {kind === "gsc_reporting" ? (
        <TaskFormPanel title="Report">
          <GscReportingExecutionFields
            layout="inline"
            executionPayload={action.executionPayload}
            disabled={disabled}
            onChange={(executionPayload) =>
              onChange({ ...action, executionKind: "gsc_reporting", executionPayload })
            }
          />
        </TaskFormPanel>
      ) : null}

      {kind === "ads_reporting" ? (
        <TaskFormPanel title="PPC report">
          <AdsReportingExecutionFields
            layout="inline"
            executionPayload={action.executionPayload}
            disabled={disabled}
            onChange={(executionPayload) =>
              onChange({ ...action, executionKind: "ads_reporting", executionPayload })
            }
          />
        </TaskFormPanel>
      ) : null}

      {kind === "local_dominator_export" ? (
        <TaskFormPanel title="Local Grid export">
          <LocalDominatorExportExecutionFields
            layout="inline"
            executionPayload={action.executionPayload}
            disabled={disabled}
            onChange={(executionPayload) =>
              onChange({ ...action, executionKind: "local_dominator_export", executionPayload })
            }
          />
        </TaskFormPanel>
      ) : null}

      {kind === "chatgpt_website_audit" ? (
        <ChatGptAuditExecutionFields
          clientSiteId={clientSiteId}
          executionPayload={action.executionPayload}
          disabled={disabled}
          onChange={(executionPayload) =>
            onChange({ ...action, executionKind: "chatgpt_website_audit", executionPayload })
          }
        />
      ) : null}

      {kind === "dfs_llm_article_audit" ? (
        <DfsArticleAuditExecutionFields
          executionPayload={action.executionPayload}
          disabled={disabled}
          onChange={(executionPayload) =>
            onChange({ ...action, executionKind: "dfs_llm_article_audit", executionPayload })
          }
        />
      ) : null}

      {kind === "browser_automation" ? (
        <BrowserAutomationExecutionFields
          executionPayload={action.executionPayload}
          disabled={disabled}
          onChange={(executionPayload) =>
            onChange({ ...action, executionKind: "browser_automation", executionPayload })
          }
        />
      ) : null}

      {kind === "content_gap_check" ? (
        <ContentGapCheckExecutionFields
          executionPayload={action.executionPayload}
          disabled={disabled}
          onChange={(executionPayload) =>
            onChange({
              ...action,
              executionKind: "content_gap_check",
              executionPayload: ensureContentGapCheckPayload(executionPayload),
            })
          }
        />
      ) : null}

      {isCsvRowsActionKeyword(action.keyword) ? (
        <CsvRowsExecutionFields
          surface="what"
          disabled={disabled}
          config={csvRowsConfigFromPayload(action.executionPayload)}
          onChange={(config) =>
            onChange({
              ...action,
              keyword: CSV_ROWS_ACTION_KEYWORD,
              executionKind: "",
              executionPayload: {
                ...action.executionPayload,
                ...csvRowsPayloadFromConfig(config),
              },
            })
          }
        />
      ) : null}
    </div>
  );
}
