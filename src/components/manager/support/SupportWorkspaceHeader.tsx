import { LifeBuoy } from "lucide-react";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import { BULK_TOOLBAR_GROUP_DIVIDER } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { Button } from "@/ui";

type SupportWorkspaceHeaderProps = {
  onExportAll: () => void;
  onDeleteAll: () => void;
  exporting: boolean;
  deletingAll: boolean;
  ticketCount: number;
};

export function SupportWorkspaceHeader({
  onExportAll,
  onDeleteAll,
  exporting,
  deletingAll,
  ticketCount,
}: SupportWorkspaceHeaderProps) {
  const busy = exporting || deletingAll;

  return (
    <UnifiedWorkspaceChrome
      icon={LifeBuoy}
      title="Support"
      titleRowEnd={
        <span className="text-base text-muted-foreground">
          {ticketCount} ticket{ticketCount === 1 ? "" : "s"}
        </span>
      }
      toolbar={
        <>
          <Button type="button" onClick={onExportAll} disabled={busy || ticketCount === 0}>
            {exporting ? "Exporting…" : "Export all"}
          </Button>
          <span className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />
          <Button type="button" onClick={onDeleteAll} disabled={busy || ticketCount === 0}>
            {deletingAll ? "Deleting…" : "Delete all"}
          </Button>
        </>
      }
      workspaceBusy={busy}
      progressBand="empty"
    />
  );
}
