import React from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatAlertItem } from "@/lib/chat-preferences-types";
import {
  CHAT_SIDEBAR_ROW,
  CHAT_SIDEBAR_ROW_ACTIVE,
  CHAT_SIDEBAR_SECTION_LABEL,
} from "@/components/chat/chat-theme";
import { Button } from "@/ui";

type Props = {
  alerts: ChatAlertItem[];
  activeAlertId: string | null;
  onOpenAlert: (alert: ChatAlertItem) => void;
  onDismiss: (alertId: string) => void;
};

export function ChatAlertsList({
  alerts,
  activeAlertId,
  onOpenAlert,
  onDismiss,
}: Props): React.ReactElement | null {
  if (alerts.length === 0) return null;

  return (
    <div className="mt-4 px-1">
      <div className="flex items-center gap-2 py-2">
        <Bell className="h-4 w-4 chat-text-muted" />
        <span className={CHAT_SIDEBAR_SECTION_LABEL}>Alerts</span>
        <span className="ml-auto rounded-full bg-primary/20 px-2 py-0.5 text-base font-semibold">
          {alerts.length}
        </span>
      </div>
      <div className="space-y-0.5">
        {alerts.map((alert) => (
          <div key={alert.id} className="flex items-stretch gap-1">
            <Button
              pressed={activeAlertId === alert.id}
              variant="quiet"
              onClick={() => onOpenAlert(alert)}
            >
              <span className="min-w-0 flex-1 break-words">
                <span className="font-semibold">{alert.channelLabel}</span>
                <span className="chat-text-muted"> · {alert.bodyPreview}</span>
              </span>
            </Button>
            <Button
              variant="quiet"
              aria-label="Dismiss alert"
              onClick={() => onDismiss(alert.id)}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
