import { Button, DialogShell } from "@/ui";
import { Clock, AlertCircle } from "lucide-react";
import { DraftData } from "@/hooks/use-autosave";
import { formatDistanceToNow } from "date-fns";

interface DraftRecoveryDialogProps {
  open: boolean;
  draft: DraftData | null;
  onRecover: () => void;
  onDiscard: () => void;
}

export const DraftRecoveryDialog: React.FC<DraftRecoveryDialogProps> = ({
  open,
  draft,
  onRecover,
  onDiscard,
}) => {
  const timeAgo = draft
    ? formatDistanceToNow(new Date(draft.timestamp), { addSuffix: true })
    : "";

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => !next && onDiscard()}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-primary" aria-hidden />
          Unsaved Draft Found
        </span>
      }
      description="We found an unsaved draft from your previous session."
      actions={
        <>
          <Button variant="tool" onClick={onDiscard}>
            Discard Draft
          </Button>
          <Button variant="run" onClick={onRecover}>
            Recover Draft
          </Button>
        </>
      }
    >
      {draft && (
        <div className="flex items-start gap-3 bg-ui-field p-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium text-foreground">
              {draft.blueprint.title || "Untitled Blueprint"}
            </p>
            <p className="mt-1 text-base text-muted-foreground">Last saved {timeAgo}</p>
            {draft.blueprint.purpose && (
              <p className="mt-2 text-base text-muted-foreground">{draft.blueprint.purpose}</p>
            )}
            <p className="mt-2 text-base text-muted-foreground">
              {draft.blueprint.agents.length} agent(s) configured
            </p>
          </div>
        </div>
      )}
    </DialogShell>
  );
};
