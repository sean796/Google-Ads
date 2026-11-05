import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { openChatDm } from "@/lib/chat-api";
import type { ChatChannel } from "@/lib/chat-types";
import { NeoPulseAvatar } from "@/components/chat/NeoPulseAvatar";
import { isNeoPulseBotMember, sortMembersWithNeoPulseBotFirst } from "@/lib/chat-neo-pulse";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Button, RowButton } from "@/ui";

export type DmMemberPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened: (channel: ChatChannel) => void;
};

export function DmMemberPicker({
  open,
  onOpenChange,
  onOpened,
}: DmMemberPickerProps): React.ReactElement {
  const { user } = useAuth();
  const { activeTeam, members } = useTeam();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const others = sortMembersWithNeoPulseBotFirst(members.filter((m) => m.userId !== user?.id));

  const handleOpen = async (userId: number) => {
    if (!activeTeam) return;
    setBusyId(userId);
    setError(null);
    try {
      const result = await openChatDm(activeTeam.id, userId);
      if (result.ok && result.channel) {
        onOpened(result.channel);
        onOpenChange(false);
      } else {
        setError(result.error ?? "Could not open DM");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black text-white">
        <DialogHeader>
          <DialogTitle className="text-base">Direct message</DialogTitle>
        </DialogHeader>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {others.map((member) => (
            <RowButton
              key={member.userId}
              type="button"
              disabled={busyId === member.userId}
              onClick={() => void handleOpen(member.userId)}
            >
              {isNeoPulseBotMember(member) ? (
                <NeoPulseAvatar avatarUrl={member.avatarUrl} displayName={member.displayName} className="h-10 w-10" />
              ) : (
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="bg-primary/20 text-base font-semibold text-white">
                    {(member.displayName.slice(0, 2) || "?").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="min-w-0 flex-1">
                <span className="text-base font-medium text-white">{member.displayName}</span>
                <span className="block break-words text-base text-white/50">
                  {isNeoPulseBotMember(member) ? "AI teammate" : member.email}
                </span>
              </div>
            </RowButton>
          ))}
          {others.length === 0 ? (
            <p className="py-4 text-center text-base text-white/50">No other team members</p>
          ) : null}
        </div>
        {error ? <p className="text-base text-ui-danger-hover">{error}</p> : null}
        <Button variant="quiet" type="button" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
