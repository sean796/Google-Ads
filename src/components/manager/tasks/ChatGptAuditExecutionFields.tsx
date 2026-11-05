import React from "react";
import { Plus } from "lucide-react";
import { TaskFormPanel } from "@/components/manager/tasks/TaskFormLayout";
import { TaskExecutionTargetFields } from "@/components/manager/tasks/TaskExecutionTargetFields";
import { ChatGptAuditUrlScopeFields } from "@/components/manager/tasks/ChatGptAuditUrlScopeFields";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import { RowButton, Field } from "@/ui";

const QUESTION_FIELD_CLASS =
  "h-9 min-w-0 flex-1 rounded-none border-0 bg-black px-3 text-base text-white shadow-none outline-none ring-0 focus-visible:ring-0";

function questionRows(questions: string[] | undefined): string[] {
  if (!Array.isArray(questions) || questions.length === 0) return [""];
  return [...questions];
}

export type ChatGptAuditExecutionFieldsProps = {
  executionPayload?: TaskExecutionPayload | null;
  clientSiteId?: string;
  disabled?: boolean;
  showScope?: boolean;
  onChange: (payload: TaskExecutionPayload) => void;
};

export function ChatGptAuditExecutionFields({
  executionPayload,
  clientSiteId,
  disabled = false,
  showScope = true,
  onChange,
}: ChatGptAuditExecutionFieldsProps): React.ReactElement {
  const payload = executionPayload ?? {};
  const rows = questionRows(payload.auditQuestions);

  const patchScope = (next: TaskExecutionPayload) => {
    const bucketChanged = next.targetBucket !== payload.targetBucket;
    onChange(bucketChanged ? { ...next, targetUrls: undefined } : next);
  };

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

  return (
    <>
      {showScope ? (
        <TaskFormPanel title="Scope">
          <TaskExecutionTargetFields
            variant="flatPlaceholder"
            bucketLabel="Target bucket"
            executionPayload={payload}
            disabled={disabled}
            onChange={patchScope}
          />
        </TaskFormPanel>
      ) : null}
      {showScope ? (
        <ChatGptAuditUrlScopeFields
          clientSiteId={clientSiteId}
          executionPayload={payload}
          disabled={disabled}
          onChange={onChange}
        />
      ) : null}
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
