import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchChatChannels,
  fetchChatMessages,
  markChatChannelRead,
  markChatThreadRead,
  postChatTyping,
  sendChatMessage,
} from "@/lib/chat-api";
import { extractMentionUserIds } from "@/lib/chat-mention-utils";
import { readChatSessionCache, writeChatSessionCache } from "@/lib/chat-session-cache";
import type { ChatChannel, ChatMessage, ThreadUnreadSummary } from "@/lib/chat-types";

const POLL_MS = 3000;
const CHANNEL_REFRESH_DEBOUNCE_MS = 15000;

export type UseChatPollOptions = {
  teamId: number | null;
  activeChannelId: number | null;
  enabled: boolean;
};

function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const msg of incoming) byId.set(msg.id, msg);
  return [...byId.values()].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.id - b.id;
  });
}

function hydratedFromMessages(messagesByChannel: Record<number, ChatMessage[]>): Set<number> {
  return new Set(Object.keys(messagesByChannel).map(Number));
}

function seedLastMessageIds(
  messagesByChannel: Record<number, ChatMessage[]>,
  ref: { current: Record<number, number> },
): void {
  for (const [channelId, messages] of Object.entries(messagesByChannel)) {
    if (messages.length > 0) {
      ref.current[Number(channelId)] = messages[messages.length - 1]!.id;
    }
  }
}

function initialSessionState(teamId: number | null): {
  channels: ChatChannel[];
  messagesByChannel: Record<number, ChatMessage[]>;
  hydratedChannels: Set<number>;
} {
  if (!teamId) {
    return { channels: [], messagesByChannel: {}, hydratedChannels: new Set() };
  }
  const cached = readChatSessionCache(teamId);
  if (!cached) {
    return { channels: [], messagesByChannel: {}, hydratedChannels: new Set() };
  }
  return {
    channels: cached.channels,
    messagesByChannel: cached.messagesByChannel,
    hydratedChannels: hydratedFromMessages(cached.messagesByChannel),
  };
}

export function useChatPoll({ teamId, activeChannelId, enabled }: UseChatPollOptions) {
  const seeded = initialSessionState(teamId);
  const [channels, setChannels] = useState<ChatChannel[]>(() => seeded.channels);
  const [messagesByChannel, setMessagesByChannel] = useState<Record<number, ChatMessage[]>>(
    () => seeded.messagesByChannel,
  );
  const [hydratedChannels, setHydratedChannels] = useState<Set<number>>(() => seeded.hydratedChannels);
  const [backgroundMessagesByChannel, setBackgroundMessagesByChannel] = useState<Record<number, ChatMessage[]>>(
    {},
  );
  const [threadsUnread, setThreadsUnread] = useState<ThreadUnreadSummary[]>([]);
  const [typingUsers, setTypingUsers] = useState<{ userId: number; displayName: string }[]>([]);
  const [sending, setSending] = useState(false);

  const lastMessageIdRef = useRef<Record<number, number>>({});
  const lastChannelRefreshRef = useRef(0);
  const userSentRef = useRef(false);
  const backgroundSeededRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!teamId) {
      setChannels([]);
      setMessagesByChannel({});
      setBackgroundMessagesByChannel({});
      setHydratedChannels(new Set());
      lastMessageIdRef.current = {};
      backgroundSeededRef.current = new Set();
      return;
    }
    const cached = readChatSessionCache(teamId);
    if (!cached) return;
    setChannels(cached.channels);
    setMessagesByChannel(cached.messagesByChannel);
    setHydratedChannels(hydratedFromMessages(cached.messagesByChannel));
    seedLastMessageIds(cached.messagesByChannel, lastMessageIdRef);
  }, [teamId]);

  useEffect(() => {
    if (activeChannelId == null) return;
    setBackgroundMessagesByChannel((prev) => {
      if (!(activeChannelId in prev)) return prev;
      const next = { ...prev };
      delete next[activeChannelId];
      return next;
    });
    backgroundSeededRef.current.delete(activeChannelId);
  }, [activeChannelId]);

  const messages = useMemo(
    () => (activeChannelId != null ? (messagesByChannel[activeChannelId] ?? []) : []),
    [activeChannelId, messagesByChannel],
  );

  const notificationMessages = useMemo(() => {
    const merged = [...messages];
    for (const [channelId, channelMessages] of Object.entries(backgroundMessagesByChannel)) {
      if (Number(channelId) === activeChannelId) continue;
      merged.push(...channelMessages);
    }
    return mergeMessages([], merged);
  }, [messages, backgroundMessagesByChannel, activeChannelId]);

  const setChannelMessages = useCallback((channelId: number, updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessagesByChannel((prev) => {
      const current = prev[channelId] ?? [];
      const next = typeof updater === "function" ? updater(current) : updater;
      return { ...prev, [channelId]: next };
    });
  }, []);

  const refreshChannels = useCallback(async () => {
    if (!teamId) {
      setChannels([]);
      return;
    }
    try {
      const list = await fetchChatChannels(teamId);
      setChannels(list);
      writeChatSessionCache(teamId, { channels: list });
    } catch {
      // keep last good channel list
    }
  }, [teamId]);

  const debouncedRefreshChannels = useCallback(() => {
    const now = Date.now();
    if (now - lastChannelRefreshRef.current < CHANNEL_REFRESH_DEBOUNCE_MS) return;
    lastChannelRefreshRef.current = now;
    void refreshChannels();
  }, [refreshChannels]);

  const loadInitialMessages = useCallback(
    async (channelId: number) => {
      if (!teamId) return;
      try {
        const result = await fetchChatMessages(teamId, channelId, {
          limit: 50,
          scope: "channel",
          includeThreadUnread: true,
        });
        setChannelMessages(channelId, (prev) => {
          const merged = mergeMessages(prev, result.messages);
          writeChatSessionCache(teamId, { messagesByChannel: { [channelId]: merged } });
          return merged;
        });
        setHydratedChannels((prev) => new Set(prev).add(channelId));
        if (result.threadsUnread) setThreadsUnread(result.threadsUnread);
        if (result.typingUsers) setTypingUsers(result.typingUsers);
        const mergedForCursor = mergeMessages([], result.messages);
        const lastId = mergedForCursor.length > 0 ? mergedForCursor[mergedForCursor.length - 1]!.id : 0;
        lastMessageIdRef.current[channelId] = lastId;
        if (lastId > 0) {
          await markChatChannelRead(teamId, channelId, lastId);
          debouncedRefreshChannels();
        }
      } catch {
        setHydratedChannels((prev) => new Set(prev).add(channelId));
      }
    },
    [teamId, setChannelMessages, debouncedRefreshChannels],
  );

  const pollMessages = useCallback(async () => {
    if (!teamId || !activeChannelId) return;
    const channelId = activeChannelId;
    const after = lastMessageIdRef.current[channelId] ?? 0;
    try {
      const result = await fetchChatMessages(teamId, channelId, {
        after,
        limit: 50,
        scope: "channel",
        includeThreadUnread: true,
      });
      if (result.messages.length > 0) {
        setChannelMessages(channelId, (prev) => {
          const merged = mergeMessages(prev, result.messages);
          writeChatSessionCache(teamId, { messagesByChannel: { [channelId]: merged } });
          return merged;
        });
        const lastId = result.messages.reduce((max, m) => Math.max(max, m.id), 0);
        lastMessageIdRef.current[channelId] = lastId;
        await markChatChannelRead(teamId, channelId, lastId);
        debouncedRefreshChannels();
      }
      if (result.threadsUnread) setThreadsUnread(result.threadsUnread);
      if (result.typingUsers) setTypingUsers(result.typingUsers);
    } catch {
      // silent
    }
  }, [teamId, activeChannelId, setChannelMessages, debouncedRefreshChannels]);

  const pollBackgroundChannels = useCallback(async () => {
    if (!teamId || activeChannelId == null) return;
    const candidates = channels.filter(
      (c) =>
        c.id !== activeChannelId &&
        ((c.unreadCount ?? 0) > 0 || (c.threadUnreadCount ?? 0) > 0),
    );
    for (const channel of candidates) {
      const channelId = channel.id;
      if (!backgroundSeededRef.current.has(channelId)) {
        try {
          const result = await fetchChatMessages(teamId, channelId, {
            limit: 50,
            scope: "channel",
          });
          lastMessageIdRef.current[channelId] =
            result.messages.length > 0 ? result.messages[result.messages.length - 1]!.id : 0;
          backgroundSeededRef.current.add(channelId);
        } catch {
          // silent
        }
        continue;
      }
      const after = lastMessageIdRef.current[channelId] ?? 0;
      try {
        const result = await fetchChatMessages(teamId, channelId, {
          after,
          limit: 50,
          scope: "channel",
        });
        if (result.messages.length > 0) {
          setBackgroundMessagesByChannel((prev) => ({
            ...prev,
            [channelId]: mergeMessages(prev[channelId] ?? [], result.messages),
          }));
          lastMessageIdRef.current[channelId] = result.messages[result.messages.length - 1]!.id;
          debouncedRefreshChannels();
        }
      } catch {
        // silent
      }
    }
  }, [teamId, activeChannelId, channels, debouncedRefreshChannels]);

  useEffect(() => {
    if (!enabled || !teamId) return;
    void refreshChannels();
  }, [enabled, teamId, refreshChannels]);

  useEffect(() => {
    if (!teamId || !activeChannelId) return;
    void loadInitialMessages(activeChannelId);
  }, [teamId, activeChannelId, loadInitialMessages]);

  const sendMessage = useCallback(
    async (bodyHtml: string, attachmentAssetIds: number[] = [], parentMessageId?: number) => {
      if (!teamId || !activeChannelId || sending) return false;
      setSending(true);
      userSentRef.current = true;
      try {
        const mentionedUserIds = extractMentionUserIds(bodyHtml);
        const result = await sendChatMessage(teamId, activeChannelId, bodyHtml, {
          attachmentAssetIds,
          parentMessageId,
          mentionedUserIds,
        });
        if (result.ok && result.message) {
          const channelId = activeChannelId;
          if (!parentMessageId) {
            setChannelMessages(channelId, (prev) => {
              let next = prev.some((m) => m.id === result.message!.id)
                ? prev
                : [...prev, result.message!];
              if (result.floReply) {
                const flo = result.floReply;
                if (flo.parentMessageId) {
                  next = next.map((m) =>
                    m.id === flo.parentMessageId
                      ? {
                          ...m,
                          threadReplyCount: (m.threadReplyCount ?? 0) + 1,
                          threadLastReplyAt: flo.createdAt,
                        }
                      : m,
                  );
                } else if (!next.some((m) => m.id === flo.id)) {
                  next = [...next, flo];
                }
              }
              return mergeMessages([], next);
            });
            const lastId = Math.max(
              result.message.id,
              result.floReply?.parentMessageId ? result.message.id : result.floReply?.id ?? 0,
            );
            lastMessageIdRef.current[channelId] = lastId;
          }
          debouncedRefreshChannels();
          void pollMessages();
          return true;
        }
        return false;
      } finally {
        setSending(false);
      }
    },
    [teamId, activeChannelId, sending, setChannelMessages, debouncedRefreshChannels, pollMessages],
  );

  const loadThread = useCallback(
    async (parentId: number): Promise<ChatMessage[]> => {
      if (!teamId || !activeChannelId) return [];
      const result = await fetchChatMessages(teamId, activeChannelId, {
        scope: "thread",
        parentId,
        limit: 100,
      });
      return result.messages;
    },
    [teamId, activeChannelId],
  );

  const markThreadRead = useCallback(
    async (threadRootId: number, messageId: number) => {
      if (!teamId || !activeChannelId) return;
      await markChatThreadRead(teamId, activeChannelId, threadRootId, messageId);
      debouncedRefreshChannels();
    },
    [teamId, activeChannelId, debouncedRefreshChannels],
  );

  const pingTyping = useCallback(() => {
    if (!teamId || !activeChannelId) return;
    void postChatTyping(teamId, activeChannelId);
  }, [teamId, activeChannelId]);

  const upsertChannel = useCallback((channel: ChatChannel) => {
    setChannels((prev) => {
      const idx = prev.findIndex((c) => c.id === channel.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = channel;
        return next;
      }
      return [...prev, channel];
    });
  }, []);

  const setMessages = useCallback(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      if (!activeChannelId) return;
      setChannelMessages(activeChannelId, updater);
    },
    [activeChannelId, setChannelMessages],
  );

  const isChannelHydrated =
    activeChannelId != null ? hydratedChannels.has(activeChannelId) : false;

  return {
    channels,
    messages,
    notificationMessages,
    threadsUnread,
    typingUsers,
    sending,
    isChannelHydrated,
    userSentRef,
    refreshChannels,
    loadInitialMessages,
    loadThread,
    markThreadRead,
    pingTyping,
    sendMessage,
    upsertChannel,
    setMessages,
    setChannelMessages,
  };
}
