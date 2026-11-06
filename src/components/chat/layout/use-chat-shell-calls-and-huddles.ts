import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { useAuth } from "@/contexts/AuthContext";
import type { useTeam } from "@/contexts/TeamContext";
import type { useChatPoll } from "@/components/chat/use-chat-poll";
import type { useChatPreferences } from "@/hooks/use-chat-preferences";
import type { ChatUserPreferences } from "@/lib/chat-preferences-types";
import { useChatCall } from "@/hooks/use-chat-call";
import { useChatCallTranscription } from "@/hooks/use-chat-call-transcription";
import { useChatFloCallTranscription } from "@/hooks/use-chat-neo-pulse-call-transcription";
import { useChatScreenShare } from "@/hooks/use-chat-screen-share";
import { isNeoPulseBotMember, NEO_PULSE_BOT_DISPLAY_NAME } from "@/lib/chat-neo-pulse";
import { fetchChatCallTranscript, fetchActiveHuddles, fetchIncomingChatCalls } from "@/lib/chat-call-api";
import { summarizeChatCall } from "@/lib/chat-call-summary";
import { sendChatMessage } from "@/lib/chat-api";
import { streamHasLiveAudio } from "@/components/chat/layout/chat-shell-utils";
import type { HuddleParticipantAvatar } from "@/components/chat/calls/ChatHuddleSidebar";
import type { ActiveHuddleSummary } from "@/lib/chat-call-types";

type ChatShellCallsAndHuddlesArgs = {
  teamId: number | null;
  user: ReturnType<typeof useAuth>["user"];
  members: ReturnType<typeof useTeam>["members"];
  channels: ReturnType<typeof useChatPoll>["channels"];
  activeChannel: ReturnType<typeof useChatPoll>["channels"][number] | null;
  activeChannelId: number | null;
  canWrite: boolean;
  prefs: ChatUserPreferences;
  savePrefs: ReturnType<typeof useChatPreferences>["savePrefs"];
  refreshChannels: ReturnType<typeof useChatPoll>["refreshChannels"];
};

export function useChatShellCallsAndHuddles({
  teamId,
  user,
  members,
  channels,
  activeChannel,
  activeChannelId,
  canWrite,
  prefs,
  savePrefs,
  refreshChannels,
}: ChatShellCallsAndHuddlesArgs) {
  const summaryPostedRef = useRef<number | null>(null);
  const [activeHuddles, setActiveHuddles] = useState<ActiveHuddleSummary[]>([]);
  const [joinDismissedCallId, setJoinDismissedCallId] = useState<number | null>(null);
  const [huddleSidebarOpen, setHuddleSidebarOpen] = useState(false);
  const [noiseCancellationStrength, setNoiseCancellationStrength] = useState(
    () => prefs.behavior.noiseCancellationStrength ?? 75,
  );

  useEffect(() => {
    setNoiseCancellationStrength(prefs.behavior.noiseCancellationStrength ?? 75);
  }, [prefs.behavior.noiseCancellationStrength]);

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

  return {
    activeHuddles,
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
    joinDismissedCallId,
    setJoinDismissedCallId,
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
    joinHuddle,
    openHuddleSidebar,
  };
}
