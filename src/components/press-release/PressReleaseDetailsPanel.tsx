import { ExternalLink } from "lucide-react";
import { BulkHarnessSectionsPanel } from "@/components/keyword-research/bulk/BulkHarnessSectionsPanel";
import type { WordPressSite } from "@/components/integrations/types";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { PressReleaseInventoryHostedLink } from "@/lib/press-release/press-release-site-inventory";
import {
  WorkspaceDetailsKvRow,
  WorkspaceDetailsSection,
  WorkspaceDetailsStack,
} from "@/components/shared/WorkspaceDetailsStack";
import { workspaceDetailsCanOpen } from "@/lib/workspace/workspace-details-can-open";

export type PressReleaseDetailsPanelProps = {
  isProcessing: boolean;
  runPhase: string;
  keyword: string;
  title: string;
  wordPressSite: WordPressSite | null;
  harnessSections: BulkHarnessSectionUi[];
  harnessPlannedSectionCount: number | null;
  inventoryJsonLink: PressReleaseInventoryHostedLink | null;
};

export function pressReleaseDetailsCanOpen(
  busy: boolean,
  hasKeyword: boolean,
  hasTitle: boolean,
  hasInventory: boolean,
): boolean {
  return workspaceDetailsCanOpen(busy, hasKeyword, hasTitle, hasInventory);
}

export function PressReleaseDetailsPanel({
  isProcessing,
  runPhase,
  keyword,
  title,
  wordPressSite,
  harnessSections,
  harnessPlannedSectionCount,
  inventoryJsonLink,
}: PressReleaseDetailsPanelProps) {
  const harnessActive = isProcessing && harnessSections.length > 0;
  let kvIndex = 0;

  return (
    <WorkspaceDetailsStack>
      <WorkspaceDetailsSection title="Workspace" stripeIndex={0}>
        <WorkspaceDetailsKvRow label="Keyword" value={keyword.trim() || "—"} stripeIndex={kvIndex++} />
        <WorkspaceDetailsKvRow label="Title" value={title.trim() || "—"} stripeIndex={kvIndex++} />
        <WorkspaceDetailsKvRow
          label="Site"
          value={wordPressSite?.name ?? "No site connected"}
          stripeIndex={kvIndex++}
        />
        {inventoryJsonLink ? (
          <WorkspaceDetailsKvRow
            label="Post inventory"
            value={`${inventoryJsonLink.filename} (${inventoryJsonLink.rowCount} URLs)`}
            stripeIndex={kvIndex++}
          />
        ) : null}
      </WorkspaceDetailsSection>

      {(isProcessing || inventoryJsonLink) && (
        <WorkspaceDetailsSection title="Run detail" stripeIndex={1} defaultOpen>
          {isProcessing && runPhase && !harnessActive ? (
            <WorkspaceDetailsKvRow label="Phase" value={runPhase} stripeIndex={0} />
          ) : null}
          {harnessActive || harnessPlannedSectionCount ? (
            <BulkHarnessSectionsPanel
              harnessSections={harnessSections}
              harnessPlannedSectionCount={harnessPlannedSectionCount}
              currentRow={0}
              totalRows={1}
              isProcessing={isProcessing}
            />
          ) : null}
          {inventoryJsonLink && !isProcessing ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-2 sm:px-3">
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <a
                className="min-w-0 break-words text-primary underline-offset-2 hover:underline"
                href={inventoryJsonLink.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {inventoryJsonLink.filename}
              </a>
            </div>
          ) : null}
        </WorkspaceDetailsSection>
      )}
    </WorkspaceDetailsStack>
  );
}
