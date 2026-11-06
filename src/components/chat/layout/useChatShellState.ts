import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { useTeamPermission } from "@/hooks/use-team-permission";
import { useChatPoll } from "@/components/chat/use-chat-poll";
import { useChatNotificationAlerts } from "@/hooks/use-chat-notification-alerts";
import {
  deleteChatMessage,
  editChatMessage,
  patchChatChannel,
  searchChatMessages,
  fetchChatMentions,
  fetchMentionUnreadCount,
  markChatMentionRead,
  sendChatMessage,
} from "@/lib/chat-api";
import type { ChatAlertItem, ChatAppearancePrefs, ChatUserPreferences } from "@/lib/chat-preferences-types";
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
import type { HuddleParticipantAvatar } from "@/components/chat/calls/ChatHuddleSidebar";
import { useChatCall } from "@/hooks/use-chat-call";
import { useChatCallTranscription } from "@/hooks/use-chat-call-transcription";
import { useChatFloCallTranscription } from "@/hooks/use-chat-neo-pulse-call-transcription";
import { useChatScreenShare } from "@/hooks/use-chat-screen-share";
import { isNeoPulseBotMember, NEO_PULSE_BOT_DISPLAY_NAME } from "@/lib/chat-neo-pulse";
import { fetchChatCallTranscript, fetchActiveHuddles, fetchIncomingChatCalls } from "@/lib/chat-call-api";
import { summarizeChatCall } from "@/lib/chat-call-summary";
import type { ActiveHuddleSummary, ChatCallTranscriptLine } from "@/lib/chat-call-types";
import { readCachedActiveChannelId, readCachedMentionState, subscribeChatSessionCache, writeChatSessionCache } from "@/lib/chat-session-cache";
import { toggleStarredChannelId } from "@/lib/chat-starred-channels";
import { streamHasLiveAudio } from "@/components/chat/layout/chat-shell-utils";
import type { CSSProperties } from "react";
import type { ChatThemeId } from "@/lib/chat-preferences-types";

export type MinimalChannelTab = "messages" | "files";

export type ChatZoneVm = {
  className: string;
  style: CSSProperties;
  "data-zone-theme": ChatThemeId;
};

export type ChatShellViewModel = {
  ready: true;
  teamId: number;
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  isTeamAdmin: boolean;
  canWrite: boolean;
  appearance: ChatAppearancePrefs;
  themePrefs: ChatUserPreferences;
  layoutMode: "default" | "minimal";
  leftZone: ChatZoneVm;
  mainZone: ChatZoneVm;
  rightZone: ChatZoneVm;
  channels: ReturnType<typeof useChatPoll>["channels"];
  messages: ChatMessage[];
  liveDisplayMessages: ChatMessage[];
  activeChannelId: number | null;
  activeChannel: ReturnType<typeof useChatPoll>["channels"][number] | null;
  threadRoot: ChatMessage | null;
  highlightMessageId: number | null;
  editingTopic: boolean;
  topicDraft: string;
  messageSearchQuery: string;
  threadSearchQuery: string;
  messageSearchActive: boolean;
  mentions: ChatMentionInboxItem[];
  mentionUnreadCount: number;
  activeMentionMessageId: number | null;
  alerts: ChatAlertItem[];
  activeAlertId: string | null;
  typingUsers: ReturnType<typeof useChatPoll>["typingUsers"];
  sending: boolean;
  isChannelHydrated: boolean;
  userSentRef: ReturnType<typeof useChatPoll>["userSentRef"];
  threadUnreadMap: Map<number, number>;
  mentionMembers: { userId: number; displayName: string; email: string }[];
  members: ReturnType<typeof useTeam>["members"];
  sharedListEpoch: number;
  activeHuddles: ActiveHuddleSummary[];
  minimalChannelTab: MinimalChannelTab;
  setMinimalChannelTab: (tab: MinimalChannelTab) => void;
  starredChannelIds: number[];
  toggleStarredChannel: (channelId: number) => void;
  huddleSidebarOpen: boolean;
  setHuddleSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  inFloHuddle: boolean;
  showHuddleButton: boolean;
  channelActiveHuddle: ActiveHuddleSummary | null;
  joinPopupOpen: boolean;
  joinParticipantNames: string[];
  huddleChannelLabel: string;
  huddleRemoteLabel: string;
  huddleParticipantAvatars: HuddleParticipantAvatar[];
  huddleParticipantCount: number;
  callPhase: ReturnType<typeof useChatCall>["phase"];
  activeCall: ReturnType<typeof useChatCall>["call"];
  incomingCall: ReturnType<typeof useChatCall>["incomingCall"];
  incomingCallerName: string;
  callRemoteName: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callMuted: boolean;
  callCameraOff: boolean;
  callError: string | null;
  floCall: boolean;
  floTranscriptLines: ChatCallTranscriptLine[];
  micReady: boolean;
  peerConnected: boolean;
  presenting: boolean;
  screenStream: MediaStream | null;
  noiseCancellationStrength: number;
  isFloDm: boolean;
  canEditTopic: boolean;
  personalizationOpen: boolean;
  setPersonalizationOpen: (open: boolean) => void;
  editTarget: ChatMessage | null;
  editHtml: string;
  editBusy: boolean;
  setEditHtml: (html: string) => void;
  setEditTarget: (message: ChatMessage | null) => void;
  joinDismissedCallId: number | null;
  setJoinDismissedCallId: (id: number | null) => void;
  editEditorRef: React.RefObject<ChatRichEditorHandle | null>;
  mainComposerRef: React.RefObject<ChatComposerHandle | null>;
  threadComposerRef: React.RefObject<ChatComposerHandle | null>;
  rightPanelRef: React.RefObject<ImperativePanelHandle | null>;
  onSelectChannel: (channelId: number) => void;
  upsertChannel: ReturnType<typeof useChatPoll>["upsertChannel"];
  openThread: (message: ChatMessage) => void;
  closeThread: () => void;
  handleJumpToMessage: (messageId: number) => void;
  handleOpenThreadFromBrowser: (threadRootId: number, messageId: number) => void;
  handleOpenMention: (item: ChatMentionInboxItem) => void;
  handleOpenAlert: (alert: ChatAlertItem) => void;
  dismissAlert: (alertId: string) => void;
  handleEdit: (message: ChatMessage) => void;
  handleSaveEdit: () => Promise<void>;
  handleDeleteMessage: (message: ChatMessage) => Promise<void>;
  handleAiCorrect: (message: ChatMessage) => Promise<void>;
  handleSend: (html: string, attachmentAssetIds: number[], parentMessageId?: number) => Promise<boolean>;
  loadThread: ReturnType<typeof useChatPoll>["loadThread"];
  markThreadRead: ReturnType<typeof useChatPoll>["markThreadRead"];
  pingTyping: ReturnType<typeof useChatPoll>["pingTyping"];
  saveTopic: () => Promise<void>;
  setEditingTopic: (editing: boolean) => void;
  setTopicDraft: (draft: string) => void;
  setMessageSearchQuery: (query: string) => void;
  setThreadSearchQuery: (query: string) => void;
  setHighlightMessageId: (id: number | null) => void;
  handleEnableDesktopAlerts: () => Promise<boolean>;
  handleStartHuddle: () => Promise<void>;
  handleJoinChannelHuddle: () => Promise<void>;
  handleLeaveHuddle: () => Promise<void>;
  togglePresent: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  hangUp: () => Promise<void>;
  acceptIncoming: () => Promise<void>;
  declineIncoming: () => Promise<void>;
  dismissEnded: () => void;
  handleNoiseCancellationStrengthChange: (value: number) => void;
  setActiveChannelId: (id: number) => void;
};

export type ChatShellState = ChatShellViewModel | { ready: false };

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
  const summaryPostedRef = useRef<number | null>(null);
  const [activeHuddles, setActiveHuddles] = useState<ActiveHuddleSummary[]>([]);
  const [joinDismissedCallId, setJoinDismissedCallId] = useState<number | null>(null);
  const [huddleSidebarOpen, setHuddleSidebarOpen] = useState(false);
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

  const [noiseCancellationStrength, setNoiseCancellationStrength] = useState(
    () => prefs.behavior.noiseCancellationStrength ?? 75,
  );

  useEffect(() => {
    setNoiseCancellationStrength(prefs.behavior.noiseCancellationStrength ?? 75);
  }, [prefs.behavior.noiseCancellationStrength]);

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

  const floMember = useMemo(() => members.find(isNeoPulseBotMember) ?? null, [members]);
  const floUserId = floMember?.userId ?? null;
  const isFloDm =
    activeChannel?.type === "dm" && floUserId != null && activeChannel.dmUserId === floUserId;

  const {
    call: activeCall,
    phase: callPhase,
    incomingCall,
    setIncomingCall,
    localStream,
    remoteStream,
    muted: callMuted,
    cameraOff: callCameraOff,
    error: callError,
    callStartMs,
    floCall,
    isCaller,
    startHuddle,
    joinHuddle,
    acceptIncoming,
    declineIncoming,
    hangUp,
    toggleMute,
    toggleCamera,
    dismissEnded,
    pcRef,
    maybeSendOffer,
    attachLocalTracks,
  } = useChatCall({
    teamId,
    currentUserId: user?.id ?? 0,
    floUserId,
    noiseCancellationStrength,
  });

  const incomingCallerName = useMemo(() => {
    if (!incomingCall) return "";
    const member = members.find((m) => m.userId === incomingCall.callerUserId);
    return member?.displayName ?? "Team member";
  }, [incomingCall, members]);

  const { alerts, activeAlertId, openAlert, dismissAlert } = useChatNotificationAlerts({
    teamId,
    prefs,
    channels,
    messages: notificationMessages,
    activeChannelId,
    currentUserId: user?.id ?? null,
    enabled: Boolean(teamId),
    mentions,
    incomingCall,
    incomingCallerName,
  });

  const callRemoteName = useMemo(() => {
    if (activeChannel?.type === "dm") return activeChannel.name;
    if (incomingCall) return incomingCallerName;
    const ch = activeCall ? channels.find((c) => c.id === activeCall.channelId) : null;
    return ch?.type === "dm" ? ch.name : "Team member";
  }, [activeChannel, incomingCall, incomingCallerName, activeCall, channels]);

  useChatCallTranscription({
    teamId,
    callId: activeCall?.id ?? null,
    active: callPhase === "active" && !floCall,
    muted: callMuted,
    userId: user?.id ?? 0,
    displayName: user?.displayName ?? user?.email ?? "You",
    callStartMs,
  });

  const inFloHuddle = callPhase === "active" && activeCall?.isFloHuddle === true;
  const huddleParticipantCount = activeCall?.participantCount ?? 1;
  const micReady = streamHasLiveAudio(localStream);
  const peerConnected = streamHasLiveAudio(remoteStream);

  const { screenStream, presenting, startPresent, stopPresent } = useChatScreenShare({
    pc: pcRef.current,
    enabled: inFloHuddle && huddleParticipantCount > 1,
    onRenegotiate: () => void maybeSendOffer(),
  });

  useEffect(() => {
    if (!inFloHuddle || localStream) return;
    void attachLocalTracks(true);
  }, [inFloHuddle, localStream, attachLocalTracks]);

  useEffect(() => {
    if (callPhase === "ended" || callPhase === "idle") {
      setHuddleSidebarOpen(false);
    }
  }, [callPhase]);

  const showHuddleButton =
    canWrite &&
    callPhase === "idle" &&
    activeChannel != null &&
    (activeChannel.type !== "dm" || isFloDm);

  const channelActiveHuddle = useMemo(
    () => activeHuddles.find((h) => h.channelId === activeChannelId) ?? null,
    [activeHuddles, activeChannelId],
  );

  const openHuddleSidebar = useCallback(() => {
    setHuddleSidebarOpen(true);
  }, []);

  const handleStartHuddle = useCallback(async () => {
    if (!activeChannelId) return;
    const call = await startHuddle(activeChannelId);
    if (call) {
      openHuddleSidebar();
    }
  }, [activeChannelId, startHuddle, openHuddleSidebar]);

  const handleJoinChannelHuddle = useCallback(async () => {
    if (!channelActiveHuddle || !teamId) return;
    const call = await joinHuddle(channelActiveHuddle.callId);
    if (call) {
      openHuddleSidebar();
    }
  }, [channelActiveHuddle, teamId, joinHuddle, openHuddleSidebar]);

  const handleLeaveHuddle = useCallback(async () => {
    await hangUp();
    setHuddleSidebarOpen(false);
  }, [hangUp]);

  const togglePresent = useCallback(() => {
    if (presenting) stopPresent();
    else void startPresent();
  }, [presenting, startPresent, stopPresent]);

  const handleNoiseCancellationStrengthChange = useCallback(
    (value: number) => {
      setNoiseCancellationStrength(value);
      void savePrefs({ behavior: { noiseCancellationStrength: value } });
    },
    [savePrefs],
  );

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

  useEffect(() => {
    if (!teamId) {
      setActiveHuddles([]);
      return;
    }
    const poll = async () => {
      const huddles = await fetchActiveHuddles(teamId);
      setActiveHuddles(huddles);
    };
    void poll();
  }, [teamId]);

  const joinPopupOpen = Boolean(
    channelActiveHuddle &&
      !channelActiveHuddle.joinedByMe &&
      joinDismissedCallId !== channelActiveHuddle.callId &&
      callPhase === "idle",
  );

  const joinParticipantNames = useMemo(() => {
    if (!channelActiveHuddle) return [];
    return channelActiveHuddle.participantUserIds
      .map((id) => members.find((m) => m.userId === id)?.displayName ?? "Member")
      .filter(Boolean);
  }, [channelActiveHuddle, members]);

  const huddleChannelLabel = useMemo(() => {
    const ch = activeCall ? channels.find((c) => c.id === activeCall.channelId) : activeChannel;
    if (!ch) return "channel";
    if (ch.type === "dm") return ch.name;
    return ch.slug ? `#${ch.slug}` : ch.name;
  }, [activeCall, channels, activeChannel]);

  const huddleRemoteLabel = useMemo(() => {
    if (!activeCall?.participantUserIds) return "Peer";
    const floId = floUserId ?? 0;
    for (const id of activeCall.participantUserIds) {
      if (id === user?.id || id === floId) continue;
      return members.find((m) => m.userId === id)?.displayName ?? "Peer";
    }
    return "Peer";
  }, [activeCall?.participantUserIds, floUserId, members, user?.id]);

  const huddleParticipantAvatars = useMemo((): HuddleParticipantAvatar[] => {
    const ids = activeCall?.participantUserIds ?? (user?.id ? [user.id] : []);
    const floId = floUserId ?? 0;
    const seen = new Set<number>();
    const out: HuddleParticipantAvatar[] = [];

    const pushMember = (userId: number, isFlo = false) => {
      if (seen.has(userId)) return;
      seen.add(userId);
      const isSelf = userId === user?.id;
      const micActive = isSelf ? micReady && !callMuted : peerConnected;
      if (isFlo) {
        out.push({ userId, displayName: NEO_PULSE_BOT_DISPLAY_NAME, isFlo: true });
        return;
      }
      const member = members.find((m) => m.userId === userId);
      out.push({
        userId,
        displayName: member?.displayName ?? "Member",
        avatarUrl: member?.avatarUrl ?? null,
        micActive,
      });
    };

    for (const id of ids) pushMember(id);
    if (floId) pushMember(floId, true);
    if (user?.id) pushMember(user.id);

    return out;
  }, [activeCall?.participantUserIds, floUserId, members, user?.id, micReady, callMuted, peerConnected]);

  const { lines: floTranscriptLines } = useChatFloCallTranscription({
    teamId,
    callId: activeCall?.id ?? null,
    active: callPhase === "active" && floCall && activeCall?.isFloHuddle !== true,
    muted: callMuted,
    displayName: user?.displayName ?? user?.email ?? "You",
    callStartMs,
    floCall,
  });

  useEffect(() => {
    if (!teamId || callPhase !== "idle") return;
    const poll = async () => {
      const incoming = await fetchIncomingChatCalls(teamId);
      if (incoming.length === 0) return;
      const next = incoming[0]!;
      if (!activeCall) {
        setIncomingCall(next);
      }
    };
    void poll();
  }, [teamId, callPhase, activeCall, setIncomingCall]);

  useEffect(() => {
    if (!teamId || !activeCall || callPhase !== "ended" || !isCaller) return;
    if (summaryPostedRef.current === activeCall.id) return;
    summaryPostedRef.current = activeCall.id;

    const run = async () => {
      const channelId = activeCall.channelId;
      const started = new Date(activeCall.startedAt).getTime();
      const ended = activeCall.endedAt ? new Date(activeCall.endedAt).getTime() : Date.now();
      const durationSec = Math.max(1, Math.round((ended - started) / 1000));
      const transcript = await fetchChatCallTranscript(teamId, activeCall.id);
      const callerMember = members.find((m) => m.userId === activeCall.callerUserId);
      const calleeMember = members.find((m) => m.userId === activeCall.calleeUserId);
      const names = [
        callerMember?.displayName ?? "Caller",
        calleeMember?.displayName ?? "Callee",
      ];
      const summary = await summarizeChatCall(transcript, names, durationSec);
      if (summary.ok) {
        await sendChatMessage(teamId, channelId, summary.bodyHtml);
        await refreshChannels();
      }
    };
    void run();
  }, [teamId, activeCall, callPhase, isCaller, members, refreshChannels]);

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
    ready: true,
    teamId,
    user,
    isTeamAdmin,
    canWrite,
    appearance,
    themePrefs,
    layoutMode,
    leftZone,
    mainZone,
    rightZone,
    channels,
    messages,
    liveDisplayMessages,
    activeChannelId,
    activeChannel,
    threadRoot,
    highlightMessageId,
    editingTopic,
    topicDraft,
    messageSearchQuery,
    threadSearchQuery,
    messageSearchActive,
    mentions,
    mentionUnreadCount,
    activeMentionMessageId,
    alerts,
    activeAlertId,
    typingUsers,
    sending,
    isChannelHydrated,
    userSentRef,
    threadUnreadMap,
    mentionMembers,
    members,
    sharedListEpoch,
    activeHuddles,
    minimalChannelTab,
    setMinimalChannelTab,
    starredChannelIds: appearance.starredChannelIds,
    toggleStarredChannel,
    huddleSidebarOpen,
    setHuddleSidebarOpen,
    inFloHuddle,
    showHuddleButton,
    channelActiveHuddle,
    joinPopupOpen,
    joinParticipantNames,
    huddleChannelLabel,
    huddleRemoteLabel,
    huddleParticipantAvatars,
    huddleParticipantCount,
    callPhase,
    activeCall,
    incomingCall,
    incomingCallerName,
    callRemoteName,
    localStream,
    remoteStream,
    callMuted,
    callCameraOff,
    callError,
    floCall,
    floTranscriptLines,
    micReady,
    peerConnected,
    presenting,
    screenStream,
    noiseCancellationStrength,
    isFloDm,
    canEditTopic,
    personalizationOpen,
    setPersonalizationOpen,
    editTarget,
    editHtml,
    editBusy,
    setEditHtml,
    setEditTarget,
    joinDismissedCallId,
    setJoinDismissedCallId,
    editEditorRef,
    mainComposerRef,
    threadComposerRef,
    rightPanelRef,
    onSelectChannel,
    upsertChannel,
    openThread,
    closeThread,
    handleJumpToMessage,
    handleOpenThreadFromBrowser,
    handleOpenMention,
    handleOpenAlert,
    dismissAlert,
    handleEdit,
    handleSaveEdit,
    handleDeleteMessage,
    handleAiCorrect,
    handleSend,
    loadThread,
    markThreadRead,
    pingTyping,
    saveTopic,
    setEditingTopic,
    setTopicDraft,
    setMessageSearchQuery,
    setThreadSearchQuery,
    setHighlightMessageId,
    handleEnableDesktopAlerts,
    handleStartHuddle,
    handleJoinChannelHuddle,
    handleLeaveHuddle,
    togglePresent,
    toggleMute,
    toggleCamera,
    hangUp,
    acceptIncoming,
    declineIncoming,
    dismissEnded,
    handleNoiseCancellationStrengthChange,
    setActiveChannelId,
  };
}
