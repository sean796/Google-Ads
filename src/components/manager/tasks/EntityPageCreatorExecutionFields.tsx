import React, { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { EntitySapPageCountFields } from "@/components/manager/tasks/EntitySapPageCountFields";
import { ForgeWhatPublishScheduleFields } from "@/components/manager/tasks/ForgeWhatPublishScheduleFields";
import {
  TASK_FORM_FLAT_CONTROL_CLASS,
  TaskFormPlaceholderCell,
} from "@/components/manager/tasks/TaskFormLayout";
import { ensureEntityPageCreatorPayload } from "@/lib/entity-page-creator/entity-page-creator-defaults";
import { entityInspectorPayloadForClientSite } from "@/lib/editorial/sync-editorial-sap-payload-from-site";
import type { EntityPageCreatorExecutionPayload, TaskExecutionPayload } from "@/lib/tasks-types";

export type EntityPageCreatorExecutionFieldsProps = {
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  layout?: "stack" | "inline";
  surface?: "default" | "what";
  clientSiteId?: string;
  onChange: (payload: TaskExecutionPayload) => void;
};

export function EntityPageCreatorExecutionFields({
  executionPayload,
  disabled = false,
  surface = "default",
  clientSiteId = "",
  onChange,
}: EntityPageCreatorExecutionFieldsProps): React.ReactElement {
  const payload = ensureEntityPageCreatorPayload(
    executionPayload as EntityPageCreatorExecutionPayload,
  );

  const patch = (partial: Partial<EntityPageCreatorExecutionPayload>) => {
    onChange(ensureEntityPageCreatorPayload({ ...payload, ...partial }));
  };

  useEffect(() => {
    const next = entityInspectorPayloadForClientSite(clientSiteId, payload);
    if (!next) return;
    onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from property profile when workflow client changes
  }, [clientSiteId]);

  return (
    <div className="flex flex-col gap-0.5">
      <EntitySapPageCountFields
        executionPayload={payload}
        disabled={disabled}
        clientSiteId={clientSiteId}
        onChange={(next) => onChange(next)}
      />

      <TaskFormPlaceholderCell>
        <Input
          value={payload.focusKeyword ?? ""}
          disabled={disabled}
          placeholder="Keyword"
          className={TASK_FORM_FLAT_CONTROL_CLASS}
          onChange={(e) => patch({ focusKeyword: e.target.value })}
        />
      </TaskFormPlaceholderCell>

      {surface === "what" ? (
        <ForgeWhatPublishScheduleFields
          payload={payload}
          disabled={disabled}
          onChange={(next) => onChange(ensureEntityPageCreatorPayload({ ...payload, ...next }))}
        />
      ) : null}
    </div>
  );
}
