import React, { useCallback, useEffect, useState } from "react";
import { CHAT_TEXT_MUTED, CHAT_TEXT_PRIMARY } from "@/components/chat/chat-theme";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

const DISMISS_KEY = (teamId: number) => `neo-pulse-chat-notif-prompt-dismissed-${teamId}`;

type Props = {
  teamId: number;
  onEnableDesktopAlerts: () => Promise<boolean>;
};

export function ChatNotificationPermissionPrompt({
  teamId,
  onEnableDesktopAlerts,
}: Props): React.ReactElement | null {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setVisible(false);
      return;
    }
    if (Notification.permission !== "default") {
      setVisible(false);
      return;
    }
    try {
      setVisible(localStorage.getItem(DISMISS_KEY(teamId)) !== "1");
    } catch {
      setVisible(true);
    }
  }, [teamId]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY(teamId), "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }, [teamId]);

  const allow = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      if (result === "granted") {
        await onEnableDesktopAlerts();
      }
      dismiss();
    } finally {
      setBusy(false);
    }
  }, [dismiss, onEnableDesktopAlerts]);

  if (!visible) return null;

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 bg-ui-field/50 px-4 py-3">
      <p className={cn("min-w-0 text-base", CHAT_TEXT_PRIMARY)}>
        Allow desktop notifications for chat messages?
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="quiet"
          type="button"
          disabled={busy}
          onClick={dismiss}
        >
          Not now
        </Button>
        <Button variant="run" type="button" disabled={busy} onClick={() => void allow()}>
          Allow
        </Button>
      </div>
    </div>
  );
}
