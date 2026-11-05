import React from "react";
import { Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { TaskFormPanel } from "@/components/manager/tasks/TaskFormLayout";
import {
  auditPlatformsFromPayload,
  DFS_ARTICLE_AUDIT_ALL_PLATFORMS,
  DFS_ARTICLE_AUDIT_PLATFORM_OPTIONS,
  type DfsArticleAuditPlatform,
} from "@/lib/dfs-article-audit/dfs-article-audit-types";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import { RowButton, Field } from "@/ui";

const QUESTION_FIELD_CLASS =
  "h-9 min-w-0 flex-1 rounded-none border-0 bg-black px-3 text-base text-white shadow-none outline-none ring-0 focus-visible:ring-0";

function questionRows(questions: string[] | undefined): string[] {
  if (!Array.isArray(questions) || questions.length === 0) return [""];
  return [...questions];
}

export type DfsArticleAuditExecutionFieldsProps = {
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  onChange: (payload: TaskExecutionPayload) => void;
};

export function DfsArticleAuditExecutionFields({
  executionPayload,
  disabled = false,
  onChange,
}: DfsArticleAuditExecutionFieldsProps): React.ReactElement {
  const payload = executionPayload ?? {};
  const rows = questionRows(payload.auditQuestions);
  const selectedPlatforms = auditPlatformsFromPayload(payload.auditPlatforms);

  const patchRows = (next: string[]) => {
    onChange({ ...payload, auditQuestions: next.length > 0 ? next : [""] });
  };

  const patchQuestion = (index: number, value: string) => {
    const next = questionRows(payload.auditQuestions);
    next[index] = value;
    patchRows(next);
  };

  const addQuestion = () => {
    patchRows([...questionRows(payload.auditQuestions), ""]);
  };

  const togglePlatform = (platform: DfsArticleAuditPlatform) => {
    const base =
      Array.isArray(payload.auditPlatforms)
        ? auditPlatformsFromPayload(payload.auditPlatforms)
        : [...DFS_ARTICLE_AUDIT_ALL_PLATFORMS];
    const next = base.includes(platform)
      ? base.filter((p) => p !== platform)
      : [...base, platform];
    onChange({ ...payload, auditPlatforms: next });
  };

  return (
    <>
      <TaskFormPanel title="LLM platforms">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-black px-3 py-2">
          {DFS_ARTICLE_AUDIT_PLATFORM_OPTIONS.map((option) => {
            const checked = selectedPlatforms.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-none text-base text-white"
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  aria-label={option.label}
                  className="rounded-none border-border data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                  onCheckedChange={() => togglePlatform(option.value)}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </TaskFormPanel>

      <TaskFormPanel title="Questions">
        <div className="flex flex-col gap-1">
          {rows.map((value, index) => (
            <div key={index} className="flex min-w-0 items-center gap-2 bg-black px-3 py-1">
              <span className="w-5 shrink-0 text-base text-muted-foreground">{index + 1}</span>
              <Field
                placeholder={`Question ${index + 1}`}
                value={value}
                disabled={disabled}
                aria-label={`Question ${index + 1}`}
                onChange={(event) => patchQuestion(index, event.target.value)}
              />
            </div>
          ))}
          <RowButton
            type="button"
            disabled={disabled}
            aria-label="Add question"
            onClick={addQuestion}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
          </RowButton>
        </div>
      </TaskFormPanel>
    </>
  );
}
