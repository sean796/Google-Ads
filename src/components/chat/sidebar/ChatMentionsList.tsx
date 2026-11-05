import React from "react";
import { AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMentionInboxItem } from "@/lib/chat-types";
import {
  CHAT_SIDEBAR_ROW,
  CHAT_SIDEBAR_ROW_ACTIVE,
  CHAT_SIDEBAR_SECTION_LABEL,
  CHAT_UNREAD_BADGE,
  CHAT_TEXT_MUTED,
  CHAT_TEXT_PRIMARY,
} from "@/components/chat/chat-theme";
import { Button } from "@/ui";

export type ChatMentionsListProps = {
  mentions: ChatMentionInboxItem[];
  unreadCount: number;
  activeMentionMessageId: number | null;
  onOpenMention: (item: ChatMentionInboxItem) => void;
};

export function ChatMentionsList({
  mentions,
  unreadCount,
  activeMentionMessageId,
  onOpenMention,
}: ChatMentionsListProps): React.ReactElement {
  return (
    <>
      <div className="mt-4 flex items-center justify-between px-1 py-2">
        <span className={CHAT_SIDEBAR_SECTION_LABEL}>Mentions</span>
        {unreadCount > 0 ? <span className={cn("shrink-0", CHAT_UNREAD_BADGE)}>{unreadCount}</span> : null}
      </div>
      {mentions.length === 0 ? (
        <p className={cn("px-2 py-2 text-base", CHAT_TEXT_MUTED)}>No mentions yet</p>
      ) : (
        mentions.map((item) => {
          const unread = item.readAt == null;
          const active = activeMentionMessageId === item.messageId;
          return (
            <Button
              pressed={Boolean(active)}
              variant="quiet"
              key={item.id}
              onClick={() => onOpenMention(item)}
            >
              <span className="flex w-full min-w-0 items-center gap-2">
                <AtSign className={cn("h-4 w-4 shrink-0", unread ? "text-[hsl(var(--chat-accent))]" : CHAT_TEXT_MUTED)} />
                <span className={cn("min-w-0 flex-1 break-words font-medium", CHAT_TEXT_PRIMARY)}>
                  {item.authorDisplayName}
                </span>
              </span>
              <span className={cn("w-full break-words pl-6 text-base", CHAT_TEXT_MUTED)}>{item.channelLabel}</span>
              {item.preview ? (
                <span className={cn("w-full pl-6 text-base", CHAT_TEXT_MUTED)}>{item.preview}</span>
              ) : null}
            </Button>
          );
        })
      )}
    </>
  );
}
