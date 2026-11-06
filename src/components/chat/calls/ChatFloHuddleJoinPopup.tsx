import React from "react";

import { NeoPulseAvatar } from "@/components/chat/NeoPulseAvatar";
import type { ActiveHuddleSummary } from "@/lib/chat-call-types";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui";

export type ChatFloHuddleJoinPopupProps = {
  open: boolean;
  channelLabel: string;
  huddle: ActiveHuddleSummary | null;
  participantNames: string[];
  onJoin: () => void;
  onDismiss: () => void;
};

export function ChatFloHuddleJoinPopup({
  open,
  channelLabel,
  huddle,
  participantNames,
  onJoin,
  onDismiss,
}: ChatFloHuddleJoinPopupProps): React.ReactElement {
  const count = huddle?.participantCount ?? participantNames.length;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      <DialogContent className="bg-black text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base text-white">Join huddle in {channelLabel}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-base text-white/70">
            {count} {count === 1 ? "person is" : "people are"} in a huddle with NEO Pulse.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <NeoPulseAvatar className="h-10 w-10" />
            {participantNames.slice(0, 6).map((name) => (
              <span key={name} className="rounded-full bg-ui-field-hover px-3 py-1 text-base text-white">
                {name}
              </span>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="quiet" type="button" onClick={onDismiss}>
              Dismiss
            </Button>
            <Button variant="run" type="button" onClick={onJoin}>
              Join
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
