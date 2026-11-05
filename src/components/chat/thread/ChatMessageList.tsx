import React, { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-types";
import { parseChatMessageHash } from "@/lib/chat-activity-log";
import { groupMessages } from "@/lib/chat-message-grouping";
import { ChatMessageBubble } from "@/components/chat/thread/ChatMessageBubble";
import { CHAT_TEXT_MUTED, CHAT_SCROLL_CLASS, CHAT_DAY_PILL_CLASS } from "@/components/chat/chat-theme";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

function dayLabel(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(d);
  } catch {
    return "";
  }
}

function threadReplyLabel(count: number, lastAt: string | null | undefined): string {
  const n = count === 1 ? "1 reply" : `${count} replies`;
  if (!lastAt) return n;
  try {
    const diff = Date.now() - new Date(lastAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${n} · Last reply ${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${n} · Last reply ${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${n} · Last reply ${days}d ago`;
  } catch {
    return n;
  }
}

export type ChatMessageListProps = {
  teamId: number;
  messages: ChatMessage[];
  currentUserId: number;
  hydrated: boolean;
  canWrite: boolean;
  isTeamAdmin?: boolean;
  highlightMessageId?: number | null;
  threadUnreadMap?: Map<number, number>;
  userSentRef?: React.MutableRefObject<boolean>;
  onHighlightDone?: () => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (message: ChatMessage) => void;
  onAiCorrect?: (message: ChatMessage) => void;
  onReplyInThread?: (message: ChatMessage) => void;
  searchActive?: boolean;
  userCardLayout?: boolean;
  hideDayPills?: boolean;
  onVisibleDayChange?: (day: string) => void;
};

export function ChatMessageList({
  teamId,
  messages,
  currentUserId,
  hydrated,
  canWrite,
  isTeamAdmin,
  highlightMessageId,
  threadUnreadMap,
  userSentRef,
  searchActive = false,
  onHighlightDone,
  onEdit,
  onDelete,
  onAiCorrect,
  onReplyInThread,
  userCardLayout = false,
  hideDayPills = false,
  onVisibleDayChange,
}: ChatMessageListProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const onVisibleDayChangeRef = useRef(onVisibleDayChange);
  onVisibleDayChangeRef.current = onVisibleDayChange;

  const reportVisibleDay = React.useCallback(() => {
    const root = scrollRef.current;
    if (!root || !hideDayPills) return;
    const sentinels = root.querySelectorAll("[data-chat-day]");
    if (sentinels.length === 0) {
      onVisibleDayChangeRef.current?.("");
      return;
    }
    const rootTop = root.getBoundingClientRect().top + 12;
    let active = sentinels[0]?.getAttribute("data-chat-day") ?? "";
    sentinels.forEach((el) => {
      if (el.getBoundingClientRect().top <= rootTop + 48) {
        active = el.getAttribute("data-chat-day") ?? active;
      }
    });
    onVisibleDayChangeRef.current?.(active);
  }, [hideDayPills]);

  const checkAtBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    reportVisibleDay();
  };

  useEffect(() => {
    if (highlightMessageId) {
      const el = document.getElementById(`chat-msg-${highlightMessageId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      const timer = window.setTimeout(() => onHighlightDone?.(), 2000);
      return () => window.clearTimeout(timer);
    }
    if (atBottom || userSentRef?.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      if (userSentRef) userSentRef.current = false;
    }
    return undefined;
  }, [messages.length, highlightMessageId, onHighlightDone, atBottom, userSentRef]);

  useEffect(() => {
    const hashId = parseChatMessageHash(window.location.hash);
    if (hashId && messages.some((m) => m.id === hashId)) {
      window.requestAnimationFrame(() => {
        document.getElementById(`chat-msg-${hashId}`)?.scrollIntoView({ block: "center" });
      });
    }
  }, [messages]);

  useEffect(() => {
    if (!hideDayPills) return;
    reportVisibleDay();
  }, [messages, hideDayPills, reportVisibleDay]);

  let lastDay = "";
  let rowIndex = 0;
  const groups = groupMessages(messages);

  return (
    <div ref={scrollRef} onScroll={checkAtBottom} className={cn("relative", CHAT_SCROLL_CLASS)}>
      {searchActive && hydrated && messages.length === 0 ? (
        <div className={cn("flex flex-1 items-center justify-center py-12 text-base", CHAT_TEXT_MUTED)}>
          No messages match your search.
        </div>
      ) : null}
      {!searchActive && hydrated && messages.length === 0 ? (
        <div className={cn("flex flex-1 items-center justify-center py-12 text-base", CHAT_TEXT_MUTED)}>
          No messages yet. Say hello.
        </div>
      ) : null}
      {groups.map((group) =>
        group.messages.map((message, idx) => {
          const day = dayLabel(message.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const compact = idx > 0;
          const threadCount = message.threadReplyCount ?? 0;
          const threadUnread = threadUnreadMap?.get(message.id) ?? message.threadUnreadCount ?? 0;
          const hasThreadActivity = threadCount > 0 || threadUnread > 0;
          const altRow = rowIndex % 2 === 1;
          rowIndex += 1;
          return (
            <React.Fragment key={message.id}>
              {showDay ? (
                hideDayPills ? (
                  <div data-chat-day={day} className="chat-day-sentinel h-px w-full shrink-0" aria-hidden />
                ) : (
                  <div className="sticky top-0 z-10 flex justify-center py-4">
                    <span className={CHAT_DAY_PILL_CLASS}>{day}</span>
                  </div>
                )
              ) : null}
              <ChatMessageBubble
                message={message}
                teamId={teamId}
                isOwn={message.userId === currentUserId}
                canWrite={canWrite}
                isTeamAdmin={isTeamAdmin}
                compact={compact}
                highlighted={highlightMessageId === message.id}
                onEdit={onEdit}
                onDelete={onDelete}
                onAiCorrect={onAiCorrect}
                onReplyInThread={onReplyInThread}
                userCardLayout={userCardLayout}
                altRow={userCardLayout ? altRow : undefined}
                threadSummary={
                  hasThreadActivity
                    ? {
                        label: threadReplyLabel(threadCount, message.threadLastReplyAt),
                        unread: threadUnread > 0,
                        hasReplies: threadCount > 0,
                      }
                    : undefined
                }
              />
            </React.Fragment>
          );
        }),
      )}
      <div ref={bottomRef} />
      {!searchActive && !atBottom && messages.length > 0 ? (
        <Button
          variant="run"
          type="button"
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
        >
          <ArrowDown className="h-4 w-4" />
          Jump to latest
        </Button>
      ) : null}
    </div>
  );
}
