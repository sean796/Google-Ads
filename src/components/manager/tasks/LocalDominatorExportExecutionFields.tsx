import React, { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import {
  TaskFormFieldGrid,
  TaskFormFlatGrid,
  TaskFormFlatSelectPlaceholder,
  TaskFormInfield,
} from "@/components/manager/tasks/TaskFormLayout";
import {
  LOCAL_DOMINATOR_GRID_KEYWORD_AUTO,
  LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY,
  isLocalDominatorAutoGridKeyword,
  isLocalDominatorPropertyGridKeyword,
  normalizeLocalDominatorGridKeywordStored,
} from "@/lib/local-dominator/local-dominator-export-keyword";
import type { TaskExecutionPayload } from "@/lib/tasks-types";

export type LocalDominatorExportExecutionFieldsProps = {
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  layout?: "stack" | "inline";
  /** When set, business name comes from the workflow client step (not stored on this step). */
  clientSiteName?: string;
  onChange: (payload: TaskExecutionPayload) => void;
};

const KEYWORD_MODE_PROPERTY = "property";
const KEYWORD_MODE_AUTO = "auto";
const KEYWORD_MODE_CUSTOM = "custom";

function keywordModeFromStored(stored: string): string {
  if (isLocalDominatorPropertyGridKeyword(stored)) return KEYWORD_MODE_PROPERTY;
  if (isLocalDominatorAutoGridKeyword(stored)) return KEYWORD_MODE_AUTO;
  return KEYWORD_MODE_CUSTOM;
}

export function LocalDominatorExportExecutionFields({
  executionPayload,
  disabled = false,
  layout = "stack",
  clientSiteName = "",
  onChange,
}: LocalDominatorExportExecutionFieldsProps): React.ReactElement {
  const payload = executionPayload ?? {};
  const businessNameStored = String(payload.businessName ?? "").trim();
  const storedKeyword = normalizeLocalDominatorGridKeywordStored(payload.keyword);
  const keywordMode = keywordModeFromStored(storedKeyword);
  const customKeyword = keywordMode === KEYWORD_MODE_CUSTOM ? storedKeyword : "";
  const inline = layout === "inline";
  const clientName = clientSiteName.trim();
  const workflowClientBound = clientName.length > 0;
  const seededKeywordRef = useRef(false);

  const patch = (partial: Partial<TaskExecutionPayload>) => {
    onChange({ ...payload, ...partial });
  };

  useEffect(() => {
    if (disabled || !workflowClientBound || !businessNameStored) return;
    const { businessName: _removed, ...rest } = payload;
    onChange(rest);
  }, [businessNameStored, disabled, onChange, payload, workflowClientBound]);

  useEffect(() => {
    if (seededKeywordRef.current || disabled) return;
    const raw = String(payload.keyword ?? "").trim();
    if (
      raw === LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY ||
      raw === LOCAL_DOMINATOR_GRID_KEYWORD_AUTO
    ) {
      return;
    }
    if (isLocalDominatorAutoGridKeyword(raw)) {
      seededKeywordRef.current = true;
      patch({
        keyword: workflowClientBound
          ? LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY
          : LOCAL_DOMINATOR_GRID_KEYWORD_AUTO,
      });
      return;
    }
    const business = workflowClientBound ? clientName : businessNameStored;
    if (
      raw.toLowerCase() === "blinds near me"
      && business.toLowerCase() !== "advance blinds & drapery"
    ) {
      seededKeywordRef.current = true;
      patch({
        keyword: workflowClientBound
          ? LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY
          : LOCAL_DOMINATOR_GRID_KEYWORD_AUTO,
      });
    }
  }, [businessNameStored, clientName, disabled, payload.keyword, workflowClientBound]);

  useEffect(() => {
    if (disabled || !workflowClientBound || seededKeywordRef.current) return;
    const raw = String(payload.keyword ?? "").trim();
    if (!raw || isLocalDominatorAutoGridKeyword(raw)) {
      seededKeywordRef.current = true;
      patch({ keyword: LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY });
    }
  }, [disabled, payload.keyword, workflowClientBound]);

  const fields = (
    <>
      {workflowClientBound ? (
        <TaskFormInfield label="Business">
          <div className="flex h-8 items-center px-3 text-base text-foreground">{clientName}</div>
        </TaskFormInfield>
      ) : (
        <TaskFormInfield label="Business">
          <Input
            value={String(payload.businessName ?? "")}
            disabled={disabled}
            onChange={(event) => patch({ businessName: event.target.value })}
            className="h-8 border-0 bg-zinc-900/50 text-base"
          />
        </TaskFormInfield>
      )}
      <TaskFormInfield label="Keyword">
        <TaskFormFlatSelectPlaceholder
          placeholder="Keyword"
          value={keywordMode}
          disabled={disabled}
          onChange={(value) => {
            if (value === KEYWORD_MODE_PROPERTY) {
              patch({ keyword: LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY });
              return;
            }
            if (value === KEYWORD_MODE_AUTO) {
              patch({ keyword: LOCAL_DOMINATOR_GRID_KEYWORD_AUTO });
              return;
            }
            patch({ keyword: customKeyword });
          }}
          options={[
            { value: KEYWORD_MODE_PROPERTY, label: "Property primary" },
            { value: KEYWORD_MODE_AUTO, label: "Auto (first grid)" },
            { value: KEYWORD_MODE_CUSTOM, label: "Custom keyword" },
          ]}
          className="h-8 border-0 bg-zinc-900/50 text-base"
        />
        {keywordMode === KEYWORD_MODE_CUSTOM ? (
          <Input
            value={customKeyword}
            placeholder="e.g. blinds near me"
            disabled={disabled}
            onChange={(event) => patch({ keyword: event.target.value })}
            className="mt-2 h-8 border-0 bg-zinc-900/50 text-base"
          />
        ) : null}
      </TaskFormInfield>
    </>
  );

  if (inline) {
    return <TaskFormFlatGrid className="grid-cols-2">{fields}</TaskFormFlatGrid>;
  }

  return <TaskFormFieldGrid>{fields}</TaskFormFieldGrid>;
}
