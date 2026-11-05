import { Download } from "lucide-react";
import {
  SupportChatLogAttachment,
  supportChatLogFileName,
} from "@/components/support/SupportChatLogAttachment";
import type { SupportTicket } from "@/lib/support-types";
import { Button, TextareaField } from "@/ui";

type SupportTicketRowDetailsProps = {
  ticket: SupportTicket;
  loading: boolean;
  comment: string;
  submittingComment: boolean;
  createdLabel: string;
  onCommentChange: (value: string) => void;
  onToggleStatus: () => void;
  onAddComment: () => void;
  onDownloadLog: () => void;
};

export function SupportTicketRowDetails({
  ticket,
  loading,
  comment,
  submittingComment,
  createdLabel,
  onCommentChange,
  onToggleStatus,
  onAddComment,
  onDownloadLog,
}: SupportTicketRowDetailsProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 bg-black px-3 py-4 text-base text-muted-foreground">
        
        Loading ticket…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 bg-black px-3 py-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-foreground">
            {ticket.title || `Ticket #${ticket.id}`}
          </h2>
          <span className="text-base capitalize text-muted-foreground">{ticket.status}</span>
          <span className="text-base text-muted-foreground">{ticket.source}</span>
        </div>
        <p className="text-base text-foreground">{ticket.summary}</p>
        <p className="text-base text-muted-foreground">{createdLabel}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onToggleStatus}>
          Mark {ticket.status === "open" ? "closed" : "open"}
        </Button>
      </div>

      {ticket.hasChatLog ? (
        <div className="space-y-2">
          <p className="text-base font-medium text-foreground">Attachment</p>
          <SupportChatLogAttachment
            fileName={supportChatLogFileName(ticket.id)}
            sizeLabel="Stored on server"
          />
          <Button type="button" onClick={onDownloadLog}>
            <Download className="mr-2 h-4 w-4" aria-hidden />
            Download attachment
          </Button>
        </div>
      ) : null}

      {ticket.workspace?.managerTab || ticket.workspace?.siteName ? (
        <div className="space-y-1">
          <h3 className="text-base font-medium text-foreground">Workspace</h3>
          <p className="text-base text-muted-foreground">
            {[ticket.workspace.managerTab, ticket.workspace.siteName, ticket.workspace.url]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        <h3 className="text-base font-medium text-foreground">Comments</h3>
        {(ticket.comments ?? []).length === 0 ? (
          <p className="text-base text-muted-foreground">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {(ticket.comments ?? []).map((entry) => (
              <li key={entry.id} className="space-y-1">
                <p className="text-base font-medium text-foreground">
                  {entry.displayName || "Team member"} · {new Date(entry.createdAt).toLocaleString()}
                </p>
                <p className="text-base text-foreground">{entry.body}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <TextareaField
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            rows={3}
            placeholder="Add a comment"
          />
          <Button variant="run" type="button" onClick={onAddComment} disabled={submittingComment || !comment.trim()}>
            {submittingComment ? "Saving…" : "Add comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
