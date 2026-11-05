import React, { useMemo } from "react";
import { TaskFormInfieldSelect, TaskFormPanel } from "@/components/manager/tasks/TaskFormLayout";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import { getStoredSites } from "@/components/integrations/storage";
import { ChatRichEditor } from "@/components/chat/editor/ChatRichEditor";
import type { BrowserTargetUrlSource, TaskExecutionPayload } from "@/lib/tasks-types";
import { Field } from "@/ui";

const URL_SOURCE_OPTIONS: { value: BrowserTargetUrlSource; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "client_site", label: "Client site" },
  { value: "variable", label: "Variable" },
];

export type BrowserUrlVariableOption = {
  key: string;
  label: string;
};

export type BrowserAutomationExecutionFieldsProps = {
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  layout?: "stack" | "workflow";
  clientSiteId?: string;
  urlVariableOptions?: BrowserUrlVariableOption[];
  onChange: (payload: TaskExecutionPayload) => void;
};

function resolveUrlSource(payload: TaskExecutionPayload): BrowserTargetUrlSource {
  const source = payload.targetUrlSource;
  if (source === "client_site" || source === "variable") return source;
  return "manual";
}

export function BrowserAutomationExecutionFields({
  executionPayload,
  disabled = false,
  layout = "stack",
  clientSiteId = "",
  urlVariableOptions = [],
  onChange,
}: BrowserAutomationExecutionFieldsProps): React.ReactElement {
  const payload = executionPayload ?? {};
  const workflow = layout === "workflow";
  const urlSource = resolveUrlSource(payload);

  const clientSite = useMemo(() => {
    const id = clientSiteId.trim();
    if (!id) return null;
    return getStoredSites().find((item) => item.id === id) ?? null;
  }, [clientSiteId]);

  const clientSiteUrl = String(clientSite?.siteUrl ?? clientSite?.productionSiteUrl ?? "").trim();

  const patch = (partial: Partial<TaskExecutionPayload>) => {
    onChange({ ...payload, ...partial });
  };

  const patchUrlSource = (source: BrowserTargetUrlSource) => {
    if (source === "client_site") {
      patch({ targetUrlSource: source, targetUrl: clientSiteUrl || payload.targetUrl });
      return;
    }
    if (source === "variable") {
      patch({
        targetUrlSource: source,
        targetUrlVariable: payload.targetUrlVariable ?? urlVariableOptions[0]?.key ?? "",
      });
      return;
    }
    patch({ targetUrlSource: source });
  };

  return (
    <>
      <TaskFormPanel title="Target URL">
        <div className="flex min-w-0 flex-wrap items-center gap-1 px-3 py-2" role="group" aria-label="URL source">
          {URL_SOURCE_OPTIONS.map((option) => (
            <WorkspacePill
              key={option.value}
              label={option.label}
              square
              tone={workflow ? "forge" : "default"}
              active={urlSource === option.value}
              disabled={disabled}
              onClick={() => patchUrlSource(option.value)}
            />
          ))}
        </div>
        {urlSource === "manual" ? (
          <Field
            value={payload.targetUrl ?? ""}
            disabled={disabled}
            aria-label="Target URL"
            placeholder="https://example.com"
            onChange={(event) => patch({ targetUrl: event.target.value, targetUrlSource: "manual" })}
          />
        ) : null}
        {urlSource === "client_site" ? (
          <div className="min-h-9 bg-black px-3 py-2 text-base text-white">
            {clientSiteUrl || "Select a client to preview the site URL."}
          </div>
        ) : null}
        {urlSource === "variable" ? (
          <TaskFormInfieldSelect
            label="URL variable"
            value={payload.targetUrlVariable ?? ""}
            disabled={disabled || urlVariableOptions.length === 0}
            options={urlVariableOptions.map((option) => ({
              value: option.key,
              label: option.label || option.key,
            }))}
            onChange={(value) => patch({ targetUrlVariable: value, targetUrlSource: "variable" })}
          />
        ) : null}
      </TaskFormPanel>
      <TaskFormPanel title="Instructions">
        <div className="min-h-[12rem] bg-black">
          <ChatRichEditor
            members={[]}
            content={payload.browserInstructionsHtml ?? ""}
            disabled={disabled}
            placeholder="Search Google for Flowbie and open the first result."
            showAiToolbar={false}
            compactToolbar
            submitOnEnter={false}
            onChange={(html) => patch({ browserInstructionsHtml: html })}
            onSubmit={() => {}}
          />
        </div>
      </TaskFormPanel>
    </>
  );
}
