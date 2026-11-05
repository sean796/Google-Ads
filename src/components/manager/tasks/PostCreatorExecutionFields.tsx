import React from "react";
import { CheckField, Field, TextareaField } from "@/ui";
import {
  TaskFormFieldGrid,
  TaskFormFlatGrid,
  TaskFormInfieldSelect,
  TaskFormPanel,
  TaskFormPlaceholderCell,
} from "@/components/manager/tasks/TaskFormLayout";
import { ForgeWhatPublishScheduleFields } from "@/components/manager/tasks/ForgeWhatPublishScheduleFields";
import { PulseForgePostSchedulePanel } from "@/components/manager/tasks/planner/PulseForgePostSchedulePanel";
import { ensurePostCreatorPayload } from "@/lib/post-creator/post-creator-defaults";
import type { TaskExecutionPayload } from "@/lib/tasks-types";

const KEYWORD_SOURCE_OPTIONS = [
  { value: "prompt", label: "AI ideas" },
  { value: "gsc", label: "GSC performers" },
  { value: "manual", label: "Manual list" },
];
const DESTINATION_OPTIONS = [
  { value: "wordpress", label: "WordPress schedule" },
  { value: "draft", label: "Draft only" },
];
export type PostCreatorExecutionFieldsProps = {
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  layout?: "stack" | "inline";
  surface?: "default" | "what";
  onChange: (payload: TaskExecutionPayload) => void;
};

function normalizeWhatKeywordSource(source: TaskExecutionPayload["keywordSource"]): "gsc" | "manual" {
  return source === "manual" ? "manual" : "gsc";
}

export function PostCreatorExecutionFields({
  executionPayload,
  disabled = false,
  layout = "stack",
  surface = "default",
  onChange,
}: PostCreatorExecutionFieldsProps): React.ReactElement {
  const payload = ensurePostCreatorPayload(executionPayload);
  const inline = layout === "inline";
  const whatSurface = surface === "what";

  const patch = (partial: Partial<TaskExecutionPayload>) => {
    onChange(ensurePostCreatorPayload({ ...payload, ...partial }));
  };

  const postCount = payload.postCount ?? 1;
  const keywordSource = whatSurface
    ? normalizeWhatKeywordSource(payload.keywordSource)
    : (payload.keywordSource ?? "prompt");

  const postsPerRun = (
    <Field
      type="number"
      min={1}
      max={31}
      placeholder="Posts per run"
      value={postCount}
      disabled={disabled}
      onChange={(e) => patch({ postCount: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })}
    />
  );
  const useUpstream = (
    <CheckField
      label="Use previous agent data"
      checked={payload.useUpstreamContext === true}
      disabled={disabled}
      onCheckedChange={(checked) => patch({ useUpstreamContext: checked })}
    />
  );
  const aiFeaturedImage = (
    <CheckField
      label="AI featured image"
      checked={payload.featuredImage !== false}
      disabled={disabled}
      onCheckedChange={(checked) => patch({ featuredImage: checked })}
    />
  );

  if (whatSurface) {
    return (
      <div className="flex flex-col gap-3">
        <TaskFormPanel title="Posts">{postsPerRun}</TaskFormPanel>
        <TaskFormPanel title="Keywords">
          <TaskFormFieldGrid>
            <TaskFormInfieldSelect
              label="Keyword source"
              value={keywordSource}
              disabled={disabled}
              options={[
                { value: "gsc", label: "GSC performers" },
                { value: "manual", label: "Manual list" },
              ]}
              onChange={(v) =>
                patch({
                  keywordSource: v as TaskExecutionPayload["keywordSource"],
                  optionalPrompt: undefined,
                })
              }
            />
            {keywordSource === "manual" ? (
              <Field
                placeholder="Manual keyword"
                value={payload.keywordValue ?? ""}
                disabled={disabled}
                onChange={(e) => patch({ keywordValue: e.target.value })}
              />
            ) : null}
          </TaskFormFieldGrid>
          {useUpstream}
        </TaskFormPanel>
        <TaskFormPanel title="Featured image">{aiFeaturedImage}</TaskFormPanel>
        <ForgeWhatPublishScheduleFields
          payload={payload}
          disabled={disabled}
          onChange={(next) => onChange(ensurePostCreatorPayload(next))}
        />
      </div>
    );
  }

  if (inline) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-1">
        <TaskFormFlatGrid className="grid-cols-4">
          <TaskFormPlaceholderCell>{postsPerRun}</TaskFormPlaceholderCell>
          <TaskFormInfieldSelect
            label="Keyword source"
            value={keywordSource}
            disabled={disabled}
            options={KEYWORD_SOURCE_OPTIONS}
            onChange={(v) => patch({ keywordSource: v as TaskExecutionPayload["keywordSource"] })}
          />
          <TaskFormInfieldSelect
            label="Destination"
            value={payload.postDestination ?? "wordpress"}
            disabled={disabled}
            options={DESTINATION_OPTIONS}
            onChange={(v) => patch({ postDestination: v as TaskExecutionPayload["postDestination"] })}
          />
          <TaskFormPlaceholderCell className="px-2">{aiFeaturedImage}</TaskFormPlaceholderCell>
        </TaskFormFlatGrid>
        <div className={keywordSource === "prompt" ? "" : "invisible"} aria-hidden={keywordSource !== "prompt"}>
          <TextareaField
            rows={2}
            placeholder="Topic prompt"
            value={payload.optionalPrompt ?? ""}
            disabled={disabled || keywordSource !== "prompt"}
            onChange={(e) => patch({ optionalPrompt: e.target.value })}
          />
        </div>
        <TaskFormPlaceholderCell className="px-2">{useUpstream}</TaskFormPlaceholderCell>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <TaskFormFieldGrid>{postsPerRun}</TaskFormFieldGrid>
      <PulseForgePostSchedulePanel
        executionKind="post_creator"
        executionPayload={payload}
        disabled={disabled}
        onChange={onChange}
      />
      <TaskFormFieldGrid>
        <TaskFormInfieldSelect
          label="Keyword source"
          value={keywordSource}
          disabled={disabled}
          options={KEYWORD_SOURCE_OPTIONS}
          onChange={(v) => patch({ keywordSource: v as TaskExecutionPayload["keywordSource"] })}
        />
        <TaskFormInfieldSelect
          label="Destination"
          value={payload.postDestination ?? "wordpress"}
          disabled={disabled}
          options={DESTINATION_OPTIONS}
          onChange={(v) => patch({ postDestination: v as TaskExecutionPayload["postDestination"] })}
        />
      </TaskFormFieldGrid>
      {keywordSource === "prompt" ? (
        <TextareaField
          rows={2}
          placeholder="Topic prompt"
          value={payload.optionalPrompt ?? ""}
          disabled={disabled}
          onChange={(e) => patch({ optionalPrompt: e.target.value })}
        />
      ) : null}
      {useUpstream}
      {aiFeaturedImage}
      <p className="text-base text-muted-foreground">Target bucket: Posts</p>
    </div>
  );
}