import React, { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { Headphones, Mic, MicOff, Monitor, MonitorOff, Video, VideoOff, X } from "lucide-react";
import { NeoPulseAvatar } from "@/components/chat/NeoPulseAvatar";
import { ChatVideoTile } from "@/components/chat/calls/ChatVideoTile";
import {
  CHAT_HEADING_TEXT,
  CHAT_RIGHT_RAIL_THEMED_CLASS,
  CHAT_SURFACE_ELEVATED_CLASS,
  CHAT_TEXT_MUTED,
  CHAT_TEXT_PRIMARY,
} from "@/components/chat/chat-theme";
import type { ChatThemeId } from "@/lib/chat-preferences-types";
import { NEO_PULSE_BOT_DISPLAY_NAME } from "@/lib/chat-neo-pulse";
import { useMicAudioLevel } from "@/hooks/use-mic-audio-level";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export type HuddleParticipantAvatar = {
  userId: number;
  displayName: string;
  avatarUrl?: string | null;
  isFlo?: boolean;
  micActive?: boolean;
};

export type ChatHuddleSidebarProps = {
  channelLabel: string;
  participantAvatars: HuddleParticipantAvatar[];
  participantCount: number;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  micReady: boolean;
  peerConnected: boolean;
  presenting: boolean;
  screenStream: MediaStream | null;
  callError: string | null;
  remotePeerLabel: string;
  currentUserId: number;
  zoneClassName?: string;
  zoneStyle?: CSSProperties;
  zoneTheme?: ChatThemeId;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onTogglePresent: () => void;
  onLeave: () => void;
  onClose: () => void;
  noiseCancellationStrength: number;
  onNoiseCancellationStrengthChange: (value: number) => void;
};

function ConnectionStatus({
  callError,
  micReady,
  peerConnected,
  muted,
}: {
  callError: string | null;
  micReady: boolean;
  peerConnected: boolean;
  muted: boolean;
}): React.ReactElement {
  if (callError) {
    return <p className="text-base text-ui-danger-hover">{callError}</p>;
  }
  if (muted) {
    return <p className={cn("text-base", CHAT_TEXT_MUTED)}>Mic muted</p>;
  }
  if (peerConnected) {
    return <p className="text-base text-[hsl(var(--chat-accent))]">Connected. You can talk.</p>;
  }
  if (micReady) {
    return <p className={cn("text-base", CHAT_TEXT_MUTED)}>Mic ready. Waiting for others to join.</p>;
  }
  return <p className={cn("text-base", CHAT_TEXT_MUTED)}>Connecting mic…</p>;
}

function ScreenPreview({ stream }: { stream: MediaStream | null }): React.ReactElement | null {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
  }, [stream]);

  if (!stream) return null;

  return (
    <div className={cn("relative mb-3 aspect-video w-full overflow-hidden rounded-md", CHAT_SURFACE_ELEVATED_CLASS)}>
      <video ref={ref} autoPlay playsInline muted className="h-full w-full object-contain" />
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-base text-white">Presenting</span>
    </div>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream | null }): React.ReactElement {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);

  return <audio ref={ref} autoPlay playsInline className="hidden" aria-hidden />;
}

function ParticipantChip({
  participant,
  speaking,
}: {
  participant: HuddleParticipantAvatar;
  speaking?: boolean;
}): React.ReactElement {
  const initial = participant.displayName.slice(0, 1).toUpperCase();
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div
        className={cn(
          "relative h-12 w-12 overflow-hidden rounded-md",
          CHAT_SURFACE_ELEVATED_CLASS,
          speaking && "ring-2 ring-[hsl(var(--chat-accent))]",
        )}
      >
        {participant.isFlo ? (
          <NeoPulseAvatar className="h-full w-full rounded-md" />
        ) : participant.avatarUrl ? (
          <img src={participant.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className={cn("flex h-full w-full items-center justify-center text-base font-semibold", CHAT_TEXT_PRIMARY)}>
            {initial}
          </div>
        )}
      </div>
      <span className={cn("max-w-[4.5rem] break-words text-base", CHAT_TEXT_MUTED)}>{participant.displayName}</span>
    </div>
  );
}

export function ChatHuddleSidebar({
  channelLabel,
  participantAvatars,
  participantCount,
  localStream,
  remoteStream,
  muted,
  cameraOff,
  micReady,
  peerConnected,
  presenting,
  screenStream,
  callError,
  remotePeerLabel,
  currentUserId,
  zoneClassName,
  zoneStyle,
  zoneTheme,
  onToggleMute,
  onToggleCamera,
  onTogglePresent,
  onLeave,
  onClose,
  noiseCancellationStrength,
  onNoiseCancellationStrengthChange,
}: ChatHuddleSidebarProps): React.ReactElement {
  const localVideoStream = cameraOff ? null : localStream;
  const micMonitorActive = micReady && !muted;
  const { speaking: localSpeaking } = useMicAudioLevel(localStream, micMonitorActive);

  return (
    <aside
      className={cn(CHAT_RIGHT_RAIL_THEMED_CLASS, zoneClassName)}
      style={zoneStyle}
      data-zone-theme={zoneTheme}
    >
      <RemoteAudio stream={remoteStream} />

      <div className="flex items-center gap-2 px-4 py-3">
        <Headphones className="h-5 w-5 shrink-0" aria-hidden />
        <p className={cn("min-w-0 flex-1 break-words text-base font-semibold", CHAT_HEADING_TEXT)}>
          Huddle in {channelLabel}
          {participantCount > 1 ? ` · ${participantCount}` : ""}
        </p>
        <Button
          size="icon" icon={X}
          variant="quiet"
          type="button"
          aria-label="Close huddle panel"
          onClick={onClose}
        ></Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-3">
        <ScreenPreview stream={screenStream} />

        <ChatVideoTile
          stream={remoteStream}
          label={remotePeerLabel}
          placeholder="Waiting for peer"
          minHeight="min-h-[140px]"
          className="flex-1"
        />

        <ChatVideoTile
          stream={localVideoStream}
          label="You"
          mirrored
          placeholder="Camera off"
          minHeight="min-h-[100px]"
        />

        <div className={cn("flex items-center gap-2 rounded-md px-3 py-2", CHAT_SURFACE_ELEVATED_CLASS)}>
          <NeoPulseAvatar className="h-10 w-10 shrink-0 rounded-md" />
          <div className="min-w-0">
            <p className={cn("text-base font-semibold", CHAT_TEXT_PRIMARY)}>{NEO_PULSE_BOT_DISPLAY_NAME}</p>
            <p className={cn("text-base", CHAT_TEXT_MUTED)}>In this huddle</p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {participantAvatars.map((participant) => (
            <ParticipantChip
              key={participant.userId}
              participant={participant}
              speaking={participant.userId === currentUserId && localSpeaking && !muted}
            />
          ))}
        </div>

        <ConnectionStatus
          callError={callError}
          micReady={micReady}
          peerConnected={peerConnected}
          muted={muted}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("text-base", CHAT_TEXT_PRIMARY)}>Noise cancellation</span>
            <span className={cn("text-base tabular-nums", CHAT_TEXT_MUTED)}>{noiseCancellationStrength}%</span>
          </div>
          <Slider
            value={[noiseCancellationStrength]}
            min={0}
            max={100}
            step={5}
            aria-label="Noise cancellation strength"
            onValueChange={(value) => onNoiseCancellationStrengthChange(value[0] ?? 0)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-4">
        <Button
          variant="quiet"
          type="button"
          aria-label={muted ? "Unmute" : "Mute"}
          onClick={onToggleMute}
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>
        <Button
          variant="quiet"
          type="button"
          aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
          onClick={onToggleCamera}
        >
          {cameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
        </Button>
        <Button
          variant="quiet"
          type="button"
          aria-label={presenting ? "Stop presenting" : "Present screen"}
          onClick={onTogglePresent}
        >
          {presenting ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
        </Button>
        <Button
          variant="danger"
          type="button"
          aria-label="Leave huddle"
          onClick={onLeave}
        >
          Leave
        </Button>
      </div>
    </aside>
  );
}
