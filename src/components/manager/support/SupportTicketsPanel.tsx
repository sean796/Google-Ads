import { useCallback, useEffect, useState } from "react";
import { CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS } from "@/components/overview/overview-tab/overview-tab-content-constants";
import { useTeam } from "@/contexts/TeamContext";
import {
  addSupportComment,
  deleteAllSupportTickets,
  deleteSupportTicket,
  downloadSupportTicketChatLog,
  exportAllSupportTickets,
  getSupportTicket,
  listSupportTickets,
  updateSupportTicket,
} from "@/lib/support-api";
import type { SupportTicket } from "@/lib/support-types";
import { SupportTicketRowCompact } from "./SupportTicketRowCompact";
import { SupportTicketRowDetails } from "./SupportTicketRowDetails";
import { SupportWorkspaceHeader } from "./SupportWorkspaceHeader";

function formatWhen(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function ticketCreatedLabel(ticket: SupportTicket): string {
  const who = ticket.createdBy.displayName || ticket.createdBy.email || "Team member";
  return `${who} · ${formatWhen(ticket.createdAt)}`;
}

export function SupportTicketsPanel() {
  const { activeTeam } = useTeam();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);
  const [expandedTicket, setExpandedTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [comment, setComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [error, setError] = useState("");

  const loadTickets = useCallback(async () => {
    if (!activeTeam?.id) {
      setTickets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const rows = await listSupportTickets(activeTeam.id);
      setTickets(rows);
      setExpandedTicketId((current) =>
        current && rows.some((row) => row.id === current) ? current : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tickets");
    } finally {
      setLoading(false);
    }
  }, [activeTeam?.id]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!activeTeam?.id || !expandedTicketId) {
      setExpandedTicket(null);
      setComment("");
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    void getSupportTicket(activeTeam.id, expandedTicketId)
      .then((ticket) => {
        if (!cancelled) setExpandedTicket(ticket);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load ticket");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTeam?.id, expandedTicketId]);

  const toggleExpanded = (ticketId: number) => {
    setExpandedTicketId((current) => (current === ticketId ? null : ticketId));
    setComment("");
  };

  const handleExportAll = async () => {
    if (!activeTeam?.id) return;
    setExporting(true);
    setError("");
    try {
      await exportAllSupportTickets(activeTeam.id, activeTeam.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!activeTeam?.id) return;
    setDeletingAll(true);
    setError("");
    const result = await deleteAllSupportTickets(activeTeam.id);
    setDeletingAll(false);
    if (!result.ok) {
      setError(result.error || "Could not delete tickets");
      return;
    }
    setExpandedTicketId(null);
    setExpandedTicket(null);
    await loadTickets();
  };

  const handleDeleteTicket = async (ticketId: number) => {
    if (!activeTeam?.id) return;
    setError("");
    const result = await deleteSupportTicket(activeTeam.id, ticketId);
    if (!result.ok) {
      setError(result.error || "Could not delete ticket");
      return;
    }
    if (expandedTicketId === ticketId) {
      setExpandedTicketId(null);
      setExpandedTicket(null);
      setComment("");
    }
    await loadTickets();
  };

  const handleToggleStatus = async () => {
    if (!activeTeam?.id || !expandedTicket) return;
    const nextStatus = expandedTicket.status === "open" ? "closed" : "open";
    const result = await updateSupportTicket(activeTeam.id, expandedTicket.id, { status: nextStatus });
    if (!result.ok || !result.ticket) {
      setError(result.error || "Could not update ticket");
      return;
    }
    setExpandedTicket(result.ticket);
    setTickets((prev) =>
      prev.map((row) => (row.id === result.ticket!.id ? { ...row, status: result.ticket!.status } : row)),
    );
  };

  const handleAddComment = async () => {
    if (!activeTeam?.id || !expandedTicket || !comment.trim()) return;
    setSubmittingComment(true);
    setError("");
    const result = await addSupportComment(activeTeam.id, expandedTicket.id, comment.trim());
    setSubmittingComment(false);
    if (!result.ok || !result.ticket) {
      setError(result.error || "Could not add comment");
      return;
    }
    setComment("");
    setExpandedTicket(result.ticket);
  };

  const handleDownloadLog = async () => {
    if (!activeTeam?.id || !expandedTicket?.hasChatLog) return;
    try {
      await downloadSupportTicketChatLog(activeTeam.id, expandedTicket.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download chat log");
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <SupportWorkspaceHeader
        onExportAll={() => void handleExportAll()}
        onDeleteAll={() => void handleDeleteAll()}
        exporting={exporting}
        deletingAll={deletingAll}
        ticketCount={tickets.length}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-base text-muted-foreground">
            
            Loading tickets…
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-4 text-base text-muted-foreground">
            No support tickets yet. Use Create a ticket in Pulse Assist to file one.
          </div>
        ) : (
          <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS}>
            {tickets.map((ticket, index) => {
              const isExpanded = expandedTicketId === ticket.id;
              const createdLabel = formatWhen(ticket.createdAt);
              return (
                <div key={ticket.id}>
                  <SupportTicketRowCompact
                    ticket={ticket}
                    isExpanded={isExpanded}
                    stripeIndex={index}
                    createdLabel={createdLabel}
                    onToggle={() => toggleExpanded(ticket.id)}
                    onDelete={() => void handleDeleteTicket(ticket.id)}
                  />
                  {isExpanded ? (
                    <SupportTicketRowDetails
                      ticket={expandedTicket && expandedTicket.id === ticket.id ? expandedTicket : ticket}
                      loading={loadingDetail && (!expandedTicket || expandedTicket.id !== ticket.id)}
                      comment={comment}
                      submittingComment={submittingComment}
                      createdLabel={ticketCreatedLabel(
                        expandedTicket && expandedTicket.id === ticket.id ? expandedTicket : ticket,
                      )}
                      onCommentChange={setComment}
                      onToggleStatus={() => void handleToggleStatus()}
                      onAddComment={() => void handleAddComment()}
                      onDownloadLog={() => void handleDownloadLog()}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error ? <div className="px-4 py-2 text-base text-destructive">{error}</div> : null}
    </div>
  );
}
