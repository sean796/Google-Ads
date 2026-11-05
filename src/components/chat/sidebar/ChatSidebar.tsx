import React, { useMemo, useState } from "react";

import { Hash, Lock, MessageCircle, Plus, Radio, Star } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ChatChannel, ChatMentionInboxItem } from "@/lib/chat-types";

import { ChannelCreateDialog } from "@/components/chat/sidebar/ChannelCreateDialog";

import { DmMemberPicker } from "@/components/chat/sidebar/DmMemberPicker";

import { ChatMentionsList } from "@/components/chat/sidebar/ChatMentionsList";

import { ChatAlertsList } from "@/components/chat/sidebar/ChatAlertsList";

import type { ChatAlertItem, ChatLayoutMode, ChatSidebarSections, ChatThemeId } from "@/lib/chat-preferences-types";

import type { ActiveHuddleSummary } from "@/lib/chat-call-types";

import { isChannelStarred } from "@/lib/chat-starred-channels";

import {

  CHAT_SIDEBAR_CLASS,

  CHAT_SIDEBAR_ROW,

  CHAT_SIDEBAR_ROW_ACTIVE,

  CHAT_SIDEBAR_SECTION_LABEL,

  CHAT_UNREAD_BADGE,

  CHAT_TEXT_MUTED,

  CHAT_ICON_BTN_CLASS,

  CHAT_ACCENT_PILL_CLASS,

  CHAT_SCROLL_CLASS,

} from "@/components/chat/chat-theme";
import { Button } from "@/ui";



function channelIcon(type: ChatChannel["type"]) {

  if (type === "private") return Lock;

  if (type === "dm") return MessageCircle;

  return Hash;

}



export type ChatSidebarProps = {

  channels: ChatChannel[];

  activeChannelId: number | null;

  canWrite: boolean;

  onSelectChannel: (channelId: number) => void;

  onChannelCreated: (channel: ChatChannel) => void;

  onDmOpened: (channel: ChatChannel) => void;

  mentions: ChatMentionInboxItem[];

  mentionUnreadCount: number;

  activeMentionMessageId: number | null;

  onOpenMention: (item: ChatMentionInboxItem) => void;

  alerts?: ChatAlertItem[];

  activeAlertId?: string | null;

  onOpenAlert?: (alert: ChatAlertItem) => void;

  onDismissAlert?: (alertId: string) => void;

  sidebarSections: ChatSidebarSections;

  activeHuddles?: ActiveHuddleSummary[];

  layoutMode?: ChatLayoutMode;

  starredChannelIds?: number[];

  onToggleStarred?: (channelId: number) => void;

  zoneClassName?: string;

  zoneStyle?: React.CSSProperties;

  zoneTheme?: ChatThemeId;

};



export function ChatSidebar({

  channels,

  activeChannelId,

  canWrite,

  onSelectChannel,

  onChannelCreated,

  onDmOpened,

  mentions,

  mentionUnreadCount,

  activeMentionMessageId,

  onOpenMention,

  alerts = [],

  activeAlertId = null,

  onOpenAlert,

  onDismissAlert,

  sidebarSections,

  activeHuddles = [],

  layoutMode = "default",

  starredChannelIds = [],

  onToggleStarred,

  zoneClassName,

  zoneStyle,

  zoneTheme,

}: ChatSidebarProps): React.ReactElement {

  const [createOpen, setCreateOpen] = useState(false);

  const [dmOpen, setDmOpen] = useState(false);

  const isMinimal = layoutMode === "minimal";



  const publicChannels = channels.filter((c) => c.type === "public" || c.type === "private");

  const dms = channels.filter((c) => c.type === "dm");



  const starredChannels = useMemo(() => {

    if (!isMinimal || starredChannelIds.length === 0) return [];

    const byId = new Map(channels.map((c) => [c.id, c]));

    return starredChannelIds.map((id) => byId.get(id)).filter((c): c is ChatChannel => c != null);

  }, [channels, starredChannelIds, isMinimal]);



  const huddleByChannel = useMemo(() => {

    const map = new Map<number, ActiveHuddleSummary>();

    for (const h of activeHuddles) map.set(h.channelId, h);

    return map;

  }, [activeHuddles]);



  const renderRow = (channel: ChatChannel) => {

    const Icon = channelIcon(channel.type);

    const active = Number(channel.id) === Number(activeChannelId);

    const starred = isChannelStarred(starredChannelIds, channel.id);

    const huddle = huddleByChannel.get(channel.id);

    const label =

      channel.type === "public" || channel.type === "private"

        ? channel.slug ?? channel.name

        : channel.name;

    const rowActiveClass = isMinimal

      ? active

        ? "chat-minimal-row-active font-semibold"

        : ""

      : active

        ? CHAT_SIDEBAR_ROW_ACTIVE

        : "";



    return (

      <div key={channel.id} className="group flex items-center gap-0.5">

        <Button
          variant="quiet"

          onClick={() => onSelectChannel(channel.id)}

        >

          <span

            className={cn(

              "inline-flex shrink-0 items-center",

              !isMinimal && active && CHAT_ACCENT_PILL_CLASS,

            )}

          >

            <Icon
              className={cn(
                "h-4 w-4",
                active ? (isMinimal ? "text-white" : "text-[hsl(var(--chat-accent))]") : CHAT_TEXT_MUTED,
              )}
            />

          </span>

          <span className="min-w-0 flex-1 break-words">{label}</span>

          {huddle ? (

            <span className="chat-huddle-badge flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-base">

              <Radio className="h-3 w-3" />

              {huddle.participantCount}

            </span>

          ) : null}

          {(channel.unreadCount ?? 0) + (channel.threadUnreadCount ?? 0) > 0 ? (

            <span className={cn("shrink-0", CHAT_UNREAD_BADGE)}>

              {(channel.unreadCount ?? 0) + (channel.threadUnreadCount ?? 0)}

            </span>

          ) : null}

        </Button>

        {isMinimal && onToggleStarred ? (

          <Button
            size="icon" icon={Star}
            variant="quiet"

            type="button"

            aria-label={starred ? "Unstar channel" : "Star channel"}

            onClick={() => onToggleStarred(channel.id)}

          ></Button>

        ) : null}

      </div>

    );

  };



  const addBtnClass = cn("h-8 w-8", CHAT_ICON_BTN_CLASS);

  const starredSection =
    isMinimal && starredChannels.length > 0 ? (
      <>
        <div className="flex items-center justify-between px-3 py-3">
          <span className={CHAT_SIDEBAR_SECTION_LABEL}>Starred</span>
        </div>
        <div className="px-2 pb-2">{starredChannels.map(renderRow)}</div>
      </>
    ) : null;

  const channelsSection = sidebarSections.channels ? (
    <>
      <div className="flex items-center justify-between px-3 py-3">
        <span className={CHAT_SIDEBAR_SECTION_LABEL}>Channels</span>
        {canWrite ? (
          <Button
            size="icon" icon={Plus}
            variant="quiet"
            type="button"
            aria-label="New channel"
            onClick={() => setCreateOpen(true)}
          ></Button>
        ) : null}
      </div>
      <div className="px-2 pb-2">{publicChannels.map(renderRow)}</div>
    </>
  ) : null;

  const dmsSection = sidebarSections.dms ? (
    <div>
      <div className={cn("flex items-center justify-between px-1 py-2", !isMinimal && "mt-4")}>
        <span className={CHAT_SIDEBAR_SECTION_LABEL}>DMs</span>
        {canWrite ? (
          <Button
            size="icon" icon={Plus}
            variant="quiet"
            type="button"
            aria-label="New direct message"
            onClick={() => setDmOpen(true)}
          ></Button>
        ) : null}
      </div>
      {dms.map(renderRow)}
    </div>
  ) : null;

  const mentionsSection = sidebarSections.mentions ? (
    <div>
      <ChatMentionsList
        mentions={mentions}
        unreadCount={mentionUnreadCount}
        activeMentionMessageId={activeMentionMessageId}
        onOpenMention={onOpenMention}
      />
    </div>
  ) : null;

  const alertsSection =
    sidebarSections.alerts && onOpenAlert && onDismissAlert ? (
      <div>
        <ChatAlertsList
          alerts={alerts}
          activeAlertId={activeAlertId}
          onOpenAlert={onOpenAlert}
          onDismiss={onDismissAlert}
        />
      </div>
    ) : null;

  const lowerSections = (
    <>
      {dmsSection}
      {mentionsSection}
      {alertsSection}
    </>
  );

  return (
    <aside
      className={cn(CHAT_SIDEBAR_CLASS, "relative z-10 h-full min-h-0", zoneClassName)}
      style={zoneStyle}
      data-zone-theme={zoneTheme}
    >
      {isMinimal ? (
        <div className={cn(CHAT_SCROLL_CLASS, "min-h-0 flex-1 px-2 pb-2")}>
          {starredSection}
          {channelsSection}
          {lowerSections}
        </div>
      ) : (
        <>
          {starredSection}
          {channelsSection}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{lowerSections}</div>
        </>
      )}

      <ChannelCreateDialog

        open={createOpen}

        onOpenChange={setCreateOpen}

        onCreated={(channel) => {

          onChannelCreated(channel);

          onSelectChannel(channel.id);

        }}

      />

      <DmMemberPicker

        open={dmOpen}

        onOpenChange={setDmOpen}

        onOpened={(channel) => {

          onDmOpened(channel);

          onSelectChannel(channel.id);

        }}

      />

    </aside>

  );

}


