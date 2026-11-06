import React from "react";
import { Phone, PhoneOff } from "lucide-react";

import type { ChatCall } from "@/lib/chat-call-types";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui";

export type ChatIncomingCallModalProps = {
  call: ChatCall | null;
  callerDisplayName: string;
  onAccept: () => void;
  onDecline: () => void;
};

export function ChatIncomingCallModal({
  call,
  callerDisplayName,
  onAccept,
  onDecline,
}: ChatIncomingCallModalProps): React.ReactElement {
  return (
    <Dialog open={call != null} onOpenChange={(open) => !open && onDecline()}>
      <DialogContent className="bg-black text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base text-white">Incoming call</DialogTitle>
        </DialogHeader>
        <p className="text-base text-white/80">{callerDisplayName} is calling you</p>
        <div className="flex justify-end gap-2">
          <Button
            variant="quiet"
            type="button"
            onClick={onDecline}
          >
            <PhoneOff className="h-4 w-4" />
            Decline
          </Button>
          <Button variant="run" type="button" onClick={onAccept}>
            <Phone className="h-4 w-4" />
            Accept
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
