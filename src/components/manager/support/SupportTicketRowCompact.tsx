import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import {
  CONTENT_OPTIMIZER_PAGE_ROW_ACTIONS_CELL,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import type { SupportTicket } from "@/lib/support-types";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

type SupportTicketRowCompactProps = {
  ticket: SupportTicket;
  isExpanded: boolean;
  stripeIndex: number;
  createdLabel: string;
  onToggle: () => void;
  onDelete: () => void;
};

export function SupportTicketRowCompact({
  ticket,
  isExpanded,
  stripeIndex,
  createdLabel,
  onToggle,
  onDelete,
}: SupportTicketRowCompactProps) {
  const handleRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    onToggle();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      className={cn(
        contentOptimizerRowStripeClass(stripeIndex),
        "grid w-full min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_5rem_8.5rem_4.5rem] items-center gap-2",
      )}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <span className="min-w-0 break-words text-base font-medium text-foreground">
        {ticket.title || `Ticket #${ticket.id}`}
      </span>
      <span className="text-base capitalize text-muted-foreground">{ticket.status}</span>
      <span className="min-w-0 break-words text-base text-muted-foreground">{createdLabel}</span>
      <div className={cn(CONTENT_OPTIMIZER_PAGE_ROW_ACTIONS_CELL, "justify-end gap-1")}>
        <Button
          size="icon" icon={Trash2}
          variant="quiet"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ticket ${ticket.id}`}
        ></Button>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </div>
    </div>
  );
}
