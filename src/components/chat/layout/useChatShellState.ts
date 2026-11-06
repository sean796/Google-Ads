import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { useTeamPermission } from "@/hooks/use-team-permission";
import { useChatPoll } from "@/components/chat/use-chat-poll";
import { useChatNotificationAlerts } from "@/hooks/use-chat-notification-alerts";
import { deleteChatMessage, editChatMessage, patchChatChannel, searchChatMessages, fetchChatMentions, fetchMentionUnreadCount, markChatMentionRead } from "@/lib/chat-api";
import type { ChatAlertItem } from "@/lib/chat-preferences-types";
import type { ChatMessage, ChatMentionInboxItem } from "@/lib/chat-types";
import { extractMentionUserIds } from "@/lib/chat-mention-utils";
import type { ChatComposerHandle } from "@/components/chat/thread/ChatComposer";
import type { ChatRichEditorHandle } from "@/components/chat/editor/ChatRichEditor";
import { CHAT_MAIN_CLASS } from "@/components/chat/chat-theme";
import { cn } from "@/lib/utils";
import { chatZoneProps } from "@/lib/chat-theme-palettes";
import { useChatPreferences } from "@/hooks/use-chat-preferences";
import { writeChatMessagePath } from "@/lib/chat-activity-log";
import { transformChatHtml } from "@/lib/chat-ai-compose";
import { readCachedActiveChannelId, readCachedMentionState, subscribeChatSessionCache, writeChatSessionCache } from "@/lib/chat-session-cache";
import { toggleStarredChannelId } from "@/lib/chat-starred-channels";
import { useChatShellCallsAndHuddles } from "@/components/chat/layout/use-chat-shell-calls-and-huddles";
import type { ChatShellState, MinimalChannelTab } from "@/components/chat/layout/chat-shell-types";

export function useChatShellState(): ChatShellState {
  const { user } = useAuth();
  const { activeTeam, members, refreshMembers } = useTeam();
  const { canWrite: canWriteForArea } = useTeamPermission();
  const canWrite = canWriteForArea("communication");
  const teamId = activeTeam?.id ?? null;
  const isTeamAdmin = activeTeam?.accessRole === "owner" || activeTeam?.accessRole === "admin";
  const initialMentionState = teamId ? readCachedMentionState(teamId) : { mentions: [], mentionUnreadCount: 0 };
  const [activeChannelId, setActiveChannelId] = useState<number | null>(() =>
    teamId ? readCachedActiveChannelId(teamId) : null,
  );
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null);
  const [editHtml, setEditHtml] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [threadRoot, setThreadRoot] = useState<ChatMessage | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState<number | null>(null);
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState("");
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageSearchDebounced, setMessageSearchDebounced] = useState("");
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [sharedListEpoch, setSharedListEpoch] = useState(0);
  const [mentions, setMentions] = useState<ChatMentionInboxItem[]>(() => initialMentionState.mentions);
  const [mentionUnreadCount, setMentionUnreadCount] = useState(() => initialMentionState.mentionUnreadCount);
  const [activeMentionMessageId, setActiveMentionMessageId] = useState<number | null>(null);
  const [pendingMention, setPendingMention] = useState<ChatMentionInboxItem | null>(null);
  const [personalizationOpen, setPersonalizationOpen] = useState(false);
  const [minimalChannelTab, setMinimalChannelTab] = useState<MinimalChannelTab>("messages");
  const editEditorRef = useRef<ChatRichEditorHandle>(null);
  const mainComposerRef = useRef<ChatComposerHandle>(null);
  const threadComposerRef = useRef<ChatComposerHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);

  const {
    channels,
    messages,
    notificationMessages,
    threadsUnread,
    typingUsers,
    sending,
    isChannelHydrated,
    userSentRef,
    sendMessage,
    upsertChannel,
    setMessages,
    refreshChannels,
    loadThread,
    markThreadRead,
    pingTyping,
  } = useChatPoll({
    teamId,
    activeChannelId,
    enabled: true,
  });

  const { prefs, draft, savePrefs } = useChatPreferences();
  const themePrefs = personalizationOpen ? draft : prefs;
  const layoutMode = themePrefs.appearance.layoutMode;

  const handleEnableDesktopAlerts = useCallback(async () => {
    return savePrefs({ notifications: { desktopAlerts: true } });
  }, [savePrefs]);

  const toggleStarredChannel = useCallback(
    (channelId: number) => {
      const next = toggleStarredChannelId(themePrefs.appearance.starredChannelIds, channelId);
      void savePrefs({ appearance: { starredChannelIds: next } });
    },
    [themePrefs.appearance.starredChannelIds, savePrefs],
  );

  useEffect(() => {
    if (!teamId) return;
    void refreshMembers();
  }, [teamId, refreshMembers]);

  useEffect(() => {
    if (!teamId) {
      setActiveChannelId(null);
      setThreadRoot(null);
      setMessageSearchQuery("");
      setMessageSearchDebounced("");
      setSearchResults([]);
      setMinimalChannelTab("messages");
      return;
    }
    setActiveChannelId(readCachedActiveChannelId(teamId));
    const mentionState = readCachedMentionState(teamId);
    setMentions(mentionState.mentions);
    setMentionUnreadCount(mentionState.mentionUnreadCount);
    setThreadRoot(null);
    setMessageSearchQuery("");
    setMessageSearchDebounced("");
    setSearchResults([]);
    setMinimalChannelTab("messages");
  }, [teamId]);

  useEffect(() => {
    if (!teamId || activeChannelId == null) return;
    writeChatSessionCache(teamId, { activeChannelId });
  }, [teamId, activeChannelId]);

  useEffect(() => {
    if (!teamId) return;
    const applyMentionCache = () => {
      const state = readCachedMentionState(teamId);
      setMentions(state.mentions);
      setMentionUnreadCount(state.mentionUnreadCount);
    };
    return subscribeChatSessionCache((updatedTeamId) => {
      if (updatedTeamId !== teamId) return;
      applyMentionCache();
    });
  }, [teamId]);

  useEffect(() => {
    setMessageSearchQuery("");
    setMessageSearchDebounced("");
    setSearchResults([]);
  }, [activeChannelId]);

  useEffect(() => {
    const id = window.setTimeout(() => setMessageSearchDebounced(messageSearchQuery.trim()), 300);
    return () => window.clearTimeout(id);
  }, [messageSearchQuery]);

  useEffect(() => {
    if (!teamId || !activeChannelId || messageSearchDebounced === "") {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const list = await searchChatMessages(teamId, activeChannelId, messageSearchDebounced);
      if (!cancelled) setSearchResults(list);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [teamId, activeChannelId, messageSearchDebounced]);

  useEffect(() => {
    if (channels.length === 0) return;
    if (activeChannelId != null && channels.some((c) => c.id === activeChannelId)) return;
    const general = channels.find((c) => c.slug === "general" && c.type === "public");
    setActiveChannelId(general?.id ?? channels[0]!.id);
  }, [channels, activeChannelId]);

  const activeChannel = useMemo(
    () => channels.find((c) => Number(c.id) === Number(activeChannelId)) ?? null,
    [channels, activeChannelId],
  );

  const callsAndHuddles = useChatShellCallsAndHuddles({
    teamId, user, members, channels, activeChannel, activeChannelId,
    canWrite, prefs, savePrefs, refreshChannels,
  });
  const { inFloHuddle, joinHuddle, openHuddleSidebar, ...callsVm } = callsAndHuddles;

  const { alerts, activeAlertId, openAlert, dismissAlert } = useChatNotificationAlerts({
    teamId,
    prefs,
    channels,
    messages: notificationMessages,
    activeChannelId,
    currentUserId: user?.id ?? null,
    enabled: Boolean(teamId),
    mentions,
    incomingCall: callsAndHuddles.incomingCall,
    incomingCallerName: callsAndHuddles.incomingCallerName,
  });

  const huddleDeepLinkRef = useRef(false);
  useEffect(() => {
    if (!teamId || huddleDeepLinkRef.current || inFloHuddle) return;
    const params = new URLSearchParams(window.location.search);
    const callId = Number(params.get("huddleCallId") ?? params.get("callId") ?? 0);
    if (!callId) return;
    huddleDeepLinkRef.current = true;
    void (async () => {
      const call = await joinHuddle(callId);
      if (call) {
        setActiveChannelId(call.channelId);
        openHuddleSidebar();
      }
      params.delete("huddleCallId");
      params.delete("callId");
      params.delete("huddleTeamId");
      params.delete("teamId");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    })();
  }, [teamId, inFloHuddle, joinHuddle, openHuddleSidebar]);

  const mentionMembers = useMemo(
    () => members.map((m) => ({ userId: m.userId, displayName: m.displayName, email: m.email })),
    [members],
  );

  const threadUnreadMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const t of threadsUnread) map.set(t.threadRootId, t.unreadCount);
    return map;
  }, [threadsUnread]);

  const handleAiCorrect = useCallback(
    async (message: ChatMessage) => {
      const composer = threadRoot ? threadComposerRef : mainComposerRef;
      const result = await transformChatHtml(message.bodyHtml, "correct");
      if (result.ok) {
        composer.current?.setHtml(result.bodyHtml);
      }
    },
    [threadRoot],
  );

  const handleSend = async (html: string, attachmentAssetIds: number[], parentMessageId?: number) => {
    return sendMessage(html, attachmentAssetIds, parentMessageId);
  };

  const closeThread = useCallback(() => {
    setThreadRoot(null);
    setThreadSearchQuery("");
    setHighlightMessageId(null);
  }, []);

  const openThread = useCallback((message: ChatMessage) => {
    setMessageSearchQuery("");
    setMessageSearchDebounced("");
    setSearchResults([]);
    setThreadSearchQuery("");
    setThreadRoot(message);
  }, []);

  const handleJumpToMessage = useCallback(
    (messageId: number) => {
      closeThread();
      setHighlightMessageId(messageId);
      writeChatMessagePath(messageId);
    },
    [closeThread],
  );

  const handleOpenThreadFromBrowser = useCallback(
    (threadRootId: number, messageId: number) => {
      const root = messages.find((m) => m.id === threadRootId);
      if (root) {
        openThread(root);
        setHighlightMessageId(messageId);
      } else {
        handleJumpToMessage(messageId);
      }
    },
    [messages, openThread, handleJumpToMessage],
  );

  const refreshMentions = useCallback(async () => {
    if (!teamId) {
      setMentions([]);
      setMentionUnreadCount(0);
      return;
    }
    try {
      const [list, count] = await Promise.all([
        fetchChatMentions(teamId, { limit: 30 }),
        fetchMentionUnreadCount(teamId),
      ]);
      setMentions(list);
      setMentionUnreadCount(count);
      writeChatSessionCache(teamId, { mentions: list, mentionUnreadCount: count });
    } catch {
      // keep last good state
    }
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    void refreshMentions();
  }, [teamId, refreshMentions]);

  const handleOpenMention = useCallback(
    (item: ChatMentionInboxItem) => {
      setActiveMentionMessageId(item.messageId);
      setPendingMention(item);
      setActiveChannelId(item.channelId);
      setMessageSearchQuery("");
      setMessageSearchDebounced("");
      setSearchResults([]);
      closeThread();
      if (layoutMode === "minimal") {
        setMinimalChannelTab("messages");
      }
      if (teamId) void markChatMentionRead(teamId, item.messageId).then(() => refreshMentions());
    },
    [teamId, refreshMentions, closeThread, layoutMode],
  );

  const handleOpenAlert = useCallback(
    (alert: ChatAlertItem) => {
      openAlert(alert);
      setActiveChannelId(alert.channelId);
      setMessageSearchQuery("");
      setMessageSearchDebounced("");
      setSearchResults([]);
      closeThread();
      if (layoutMode === "minimal") {
        setMinimalChannelTab("messages");
      }
      if (alert.messageId > 0) {
        setHighlightMessageId(alert.messageId);
        writeChatMessagePath(alert.messageId);
      }
      dismissAlert(alert.id);
    },
    [openAlert, dismissAlert, closeThread, layoutMode],
  );

  useEffect(() => {
    if (!pendingMention || !teamId || activeChannelId !== pendingMention.channelId || !isChannelHydrated) {
      return;
    }
    const item = pendingMention;
    let cancelled = false;

    const finish = (messageId: number) => {
      if (cancelled) return;
      setHighlightMessageId(messageId);
      writeChatMessagePath(messageId);
      setPendingMention(null);
    };

    if (item.threadRootId) {
      void loadThread(item.threadRootId).then((threadMsgs) => {
        if (cancelled) return;
        const root = threadMsgs.find((m) => m.id === item.threadRootId) ?? messages.find((m) => m.id === item.threadRootId);
        if (root) openThread(root);
        finish(item.messageId);
      });
    } else {
      finish(item.messageId);
    }

    return () => {
      cancelled = true;
    };
  }, [pendingMention, teamId, activeChannelId, isChannelHydrated, loadThread, messages, openThread]);

  useEffect(() => {
    if (!teamId || highlightMessageId == null) return;
    void markChatMentionRead(teamId, highlightMessageId).then(() => refreshMentions());
  }, [teamId, highlightMessageId, refreshMentions]);

  const handleEdit = (message: ChatMessage) => {
    setEditTarget(message);
    setEditHtml(message.bodyHtml);
  };

  const handleSaveEdit = async () => {
    if (!teamId || !editTarget) return;
    setEditBusy(true);
    try {
      const html = editEditorRef.current?.getHtml() ?? editHtml;
      const mentionedUserIds = extractMentionUserIds(html);
      const result = await editChatMessage(teamId, editTarget.id, html, undefined, mentionedUserIds);
      if (result.ok && result.message) {
        setMessages((prev) => prev.map((m) => (m.id === result.message!.id ? result.message! : m)));
        setEditTarget(null);
      }
    } finally {
      setEditBusy(false);
    }
  };

  const messageSearchActive = messageSearchDebounced.length > 0;
  const displayedMessages = messageSearchActive ? searchResults : messages;

  const liveDisplayMessages = useMemo(() => {
    const byUser = new Map(members.map((m) => [m.userId, m.displayName]));
    const selfName = prefs.profile.displayName.trim() || user?.displayName || "";
    return displayedMessages.map((m) => {
      if (m.userId === user?.id && selfName) {
        return { ...m, displayName: selfName };
      }
      const live = byUser.get(m.userId);
      return live ? { ...m, displayName: live } : m;
    });
  }, [displayedMessages, members, prefs.profile.displayName, user?.id, user?.displayName]);

  const handleDeleteMessage = async (message: ChatMessage) => {
    if (!teamId) return;
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
    setSearchResults((prev) => prev.filter((m) => m.id !== message.id));
    setSharedListEpoch((n) => n + 1);
    const result = await deleteChatMessage(teamId, message.id);
    if (result.ok) {
      await refreshChannels();
    }
  };

  const saveTopic = async () => {
    if (!teamId || !activeChannelId || !canWrite) return;
    const result = await patchChatChannel(teamId, activeChannelId, { topic: topicDraft });
    if (result.ok && result.channel) upsertChannel(result.channel);
    setEditingTopic(false);
  };

  const onSelectChannel = useCallback(
    (id: number) => {
      setActiveChannelId(Number(id));
      closeThread();
      if (layoutMode === "minimal") {
        setMinimalChannelTab("messages");
      }
    },
    [closeThread, layoutMode],
  );

  const showRightRail = Boolean(teamId && activeChannelId);

  useEffect(() => {
    if (layoutMode === "minimal") return;
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (showRightRail) panel.expand();
    else panel.collapse();
  }, [showRightRail, layoutMode]);

  const canEditTopic =
    canWrite && activeChannel != null && (activeChannel.type === "public" || activeChannel.type === "private");

  if (!activeTeam || !user || teamId == null) {
    return { ready: false };
  }

  const appearance = themePrefs.appearance;
  const leftZone = chatZoneProps(appearance.zoneThemes.left, appearance.accentPreset, "chat-zone-left");
  const mainZone = chatZoneProps(
    appearance.zoneThemes.main,
    appearance.accentPreset,
    cn("chat-zone-main", CHAT_MAIN_CLASS),
  );
  const rightZone = chatZoneProps(appearance.zoneThemes.right, appearance.accentPreset, "chat-zone-right");

  return {
    ready: true, teamId, user, isTeamAdmin, canWrite,
    appearance, themePrefs, layoutMode, leftZone, mainZone, rightZone,
    channels, messages, liveDisplayMessages, activeChannelId, activeChannel,
    threadRoot, highlightMessageId, editingTopic, topicDraft,
    messageSearchQuery, threadSearchQuery, messageSearchActive,
    mentions, mentionUnreadCount, activeMentionMessageId, alerts, activeAlertId,
    typingUsers, sending, isChannelHydrated, userSentRef,
    threadUnreadMap, mentionMembers, members, sharedListEpoch,
    ...callsVm, inFloHuddle,
    minimalChannelTab, setMinimalChannelTab,
    starredChannelIds: appearance.starredChannelIds, toggleStarredChannel, canEditTopic,
    personalizationOpen, setPersonalizationOpen,
    editTarget, editHtml, editBusy, setEditHtml, setEditTarget,
    editEditorRef, mainComposerRef, threadComposerRef, rightPanelRef,
    onSelectChannel, upsertChannel, openThread, closeThread,
    handleJumpToMessage, handleOpenThreadFromBrowser, handleOpenMention, handleOpenAlert, dismissAlert,
    handleEdit, handleSaveEdit, handleDeleteMessage, handleAiCorrect, handleSend,
    loadThread, markThreadRead, pingTyping, saveTopic,
    setEditingTopic, setTopicDraft, setMessageSearchQuery, setThreadSearchQuery, setHighlightMessageId,
    handleEnableDesktopAlerts, setActiveChannelId,
  };
}
