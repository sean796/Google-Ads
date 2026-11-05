import React, { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ChatThemeId } from "@/lib/chat-preferences-types";
import { Trash2 } from "lucide-react";
import { deleteChatFile, searchChatShared, chatFileDownloadUrl } from "@/lib/chat-api";
import type { ChatActivityLogEntry } from "@/lib/chat-activity-log";
import { activityLabel, isFileActivity, isLinkActivity } from "@/lib/chat-activity-log";
import type { ChatChannel } from "@/lib/chat-types";
import type { TeamMember } from "@/lib/teams-types";
import { CHAT_TEXT_MUTED, CHAT_TEXT_PRIMARY, CHAT_HEADING_TEXT, CHAT_RIGHT_RAIL_CLASS, CHAT_BORDER_CLASS } from "@/components/chat/chat-theme";
import { cn } from "@/lib/utils";
import { Button, Field, SelectField } from "@/ui";

type Tab = "all" | "links" | "files" | "myLinks" | "myFiles";

export type ChatSharedBrowserProps = {
  teamId: number;
  channelId: number;
  channels: ChatChannel[];
  members: TeamMember[];
  currentUserId: number;
  isTeamAdmin: boolean;
  canWrite: boolean;
  refreshKey?: number;
  onJumpToMessage: (messageId: number) => void;
  onOpenThread: (threadRootId: number, messageId: number) => void;
  zoneClassName?: string;
  zoneStyle?: CSSProperties;
  zoneTheme?: ChatThemeId;
};

function tabKind(tab: Tab): "link_shared" | "file_shared" | undefined {
  if (tab === "links" || tab === "myLinks") return "link_shared";
  if (tab === "files" || tab === "myFiles") return "file_shared";
  return undefined;
}

function canDeleteFile(entry: ChatActivityLogEntry, currentUserId: number, isTeamAdmin: boolean): boolean {
  if (!isFileActivity(entry) || !entry.assetId) return false;
  return isTeamAdmin || entry.userId === currentUserId;
}

export function ChatSharedBrowser({
  teamId,
  channels,
  members,
  currentUserId,
  isTeamAdmin,
  canWrite,
  refreshKey = 0,
  onJumpToMessage,
  onOpenThread,
  zoneClassName,
  zoneStyle,
  zoneTheme,
}: ChatSharedBrowserProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [filterChannel, setFilterChannel] = useState<number>(0);
  const [filterUser, setFilterUser] = useState<number>(0);
  const [scope, setScope] = useState<"all" | "channel" | "thread">("all");
  const [items, setItems] = useState<ChatActivityLogEntry[]>([]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const kind = tabKind(tab);
      const userId = tab === "myLinks" || tab === "myFiles" ? currentUserId : filterUser || undefined;
      const list = await searchChatShared(teamId, {
        q: debounced,
        channelId: filterChannel || undefined,
        userId,
        kind,
        scope,
        limit: 50,
      });
      if (!cancelled) setItems(list);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [teamId, debounced, tab, filterChannel, filterUser, scope, currentUserId, refreshKey]);

  const tabs: { id: Tab; label: string }[] = useMemo(
    () => [
      { id: "all", label: "All" },
      { id: "links", label: "Links" },
      { id: "files", label: "Files" },
      { id: "myLinks", label: "My links" },
      { id: "myFiles", label: "My files" },
    ],
    [],
  );

  const handleClick = (entry: ChatActivityLogEntry) => {
    const threadRoot = entry.threadRootMessageId;
    if (threadRoot) {
      onOpenThread(threadRoot, entry.messageId);
    } else {
      onJumpToMessage(entry.messageId);
    }
  };

  const handleDeleteFile = (entry: ChatActivityLogEntry) => {
    if (!entry.assetId) return;
    setItems((prev) => prev.filter((item) => item.id !== entry.id));
    void deleteChatFile(teamId, entry.channelId, entry.assetId);
  };

  return (
    <aside
      className={cn(CHAT_RIGHT_RAIL_CLASS, "h-full", zoneClassName)}
      style={zoneStyle}
      data-zone-theme={zoneTheme}
    >
      <div className={cn("border-b px-4 py-3", CHAT_BORDER_CLASS)}>
        <h3 className={cn("text-base font-bold", CHAT_HEADING_TEXT)}>Files &amp; links</h3>
      </div>
      <div className={cn("space-y-2 border-b px-4 py-3", CHAT_BORDER_CLASS)}>
        <Field value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <Button
              pressed={tab === t.id}
              variant="quiet"
              key={t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <SelectField
            placeholder="Channel"
            value={String(filterChannel)}
            onValueChange={(v) => setFilterChannel(Number(v))}
            options={[{ value: "0", label: "All channels" }, ...channels.map((c) => ({ value: String(c.id), label: c.slug ?? c.name }))]}
          />
          <SelectField
            placeholder="Scope"
            value={scope}
            onValueChange={(v) => setScope(v as "all" | "channel" | "thread")}
            options={[
              { value: "all", label: "All" },
              { value: "channel", label: "Channel" },
              { value: "thread", label: "In threads" },
            ]}
          />
          {tab !== "myLinks" && tab !== "myFiles" ? (
            <SelectField
              placeholder="Member"
              value={String(filterUser)}
              onValueChange={(v) => setFilterUser(Number(v))}
              options={[{ value: "0", label: "All members" }, ...members.map((m) => ({ value: String(m.userId), label: m.displayName }))]}
            />
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className={cn("px-4 py-8 text-center text-base", CHAT_TEXT_MUTED)}>No shared items found.</p>
        ) : (
          items.map((entry) => {
            const isImage = isFileActivity(entry) && entry.mime?.startsWith("image/");
            const thumbUrl =
              isImage && entry.assetId
                ? chatFileDownloadUrl(teamId, entry.channelId, entry.assetId, true)
                : null;
            const showDelete = canWrite && canDeleteFile(entry, currentUserId, isTeamAdmin);
            return (
              <div key={entry.id} className="group chat-row-hover flex w-full items-center gap-3 px-4 py-3">
                <Button
                  variant="quiet"
                  onClick={() => handleClick(entry)}
                >
                  {thumbUrl ? (
                    <img src={thumbUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                  ) : (
                    <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded chat-chip text-base font-semibold", CHAT_TEXT_MUTED)}>
                      {isLinkActivity(entry) ? "URL" : "File"}
                    </div>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block break-words text-base font-medium", CHAT_TEXT_PRIMARY)}>
                      {activityLabel(entry)}
                    </span>
                    <span className={cn("block break-words text-base", CHAT_TEXT_MUTED)}>
                      {entry.sharerDisplayName ?? "Unknown"} · #{entry.channelName ?? "channel"}
                      {entry.threadRootMessageId ? " · In thread" : ""}
                    </span>
                  </span>
                </Button>
                {showDelete ? (
                  <Button
                    size="icon" icon={Trash2}
                    variant="quiet"
                    type="button"
                    aria-label="Delete file"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(entry);
                    }}
                  ></Button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
