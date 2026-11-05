import React, { useEffect, useRef } from "react";
import { Button, FileInput } from "@/ui";
import {
  TaskFormFieldGrid,
  TaskFormInfield,
  TaskFormPanel,
} from "@/components/manager/tasks/TaskFormLayout";
import { EntitySapPageCountFields } from "@/components/manager/tasks/EntitySapPageCountFields";
import { PulseForgePostSchedulePanel } from "@/components/manager/tasks/planner/PulseForgePostSchedulePanel";
import { ensureEntityPageCreatorPayload } from "@/lib/entity-page-creator/entity-page-creator-defaults";
import { entityInspectorPayloadForClientSite } from "@/lib/editorial/sync-editorial-sap-payload-from-site";
import type { EntityPageCreatorExecutionPayload, TaskExecutionPayload } from "@/lib/tasks-types";

export type SapGeneratorExecutionFieldsProps = {
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  workflowEntityCsvLocked?: boolean;
  clientSiteId?: string;
  onChange: (payload: TaskExecutionPayload) => void;
};

export function SapGeneratorExecutionFields({
  executionPayload,
  disabled = false,
  workflowEntityCsvLocked = false,
  clientSiteId = "",
  onChange,
}: SapGeneratorExecutionFieldsProps): React.ReactElement {
  const payload = ensureEntityPageCreatorPayload(
    executionPayload as EntityPageCreatorExecutionPayload,
  );

  const entityCsvInputRef = useRef<HTMLInputElement>(null);

  const patch = (partial: Partial<EntityPageCreatorExecutionPayload>) => {
    onChange(ensureEntityPageCreatorPayload({ ...payload, ...partial }));
  };

  useEffect(() => {
    const next = entityInspectorPayloadForClientSite(clientSiteId, payload);
    if (!next) return;
    onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from workflow client
  }, [clientSiteId]);

  const handleEntityCsvFile = async (file: File | null) => {
    if (!file) {
      patch({
        entityCsvBase64: undefined,
        entityCsvUrl: undefined,
        entityCsvInputSource: "upload",
      });
      return;
    }
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    patch({
      entityCsvInputSource: "upload",
      entityCsvBase64: btoa(binary),
      entityCsvUrl: undefined,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <TaskFormPanel title="Entity CSV">
        {workflowEntityCsvLocked ? (
          <p className="text-base text-muted-foreground">Entity CSV from upstream Entity Generator.</p>
        ) : (
          <TaskFormFieldGrid>
            <TaskFormInfield label="Entity CSV file">
              <FileInput
                ref={entityCsvInputRef}
                accept=".csv,text/csv"
                aria-label="Entity CSV file"
                onChange={(e) => void handleEntityCsvFile(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="tool" disabled={disabled} onClick={() => entityCsvInputRef.current?.click()}>
                Choose CSV file
              </Button>
            </TaskFormInfield>
          </TaskFormFieldGrid>
        )}
      </TaskFormPanel>

      <EntitySapPageCountFields
        executionPayload={payload}
        disabled={disabled}
        clientSiteId={clientSiteId}
        onChange={(next) => onChange(next)}
      />

      <PulseForgePostSchedulePanel
        executionKind="sap_generator"
        executionPayload={payload}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}
