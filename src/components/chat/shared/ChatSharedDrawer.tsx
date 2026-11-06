import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Link2, X } from "lucide-react";
import { fetchChatActivityLog } from "@/lib/chat-api";
import {
  activityLabel,
  writeChatMessagePath,
  isFileActivity,
  isLinkActivity,
  type ChatActivityLogEntry,
} from "@/lib/chat-activity-log";
import type { TeamMember } from "@/lib/teams-types";
import { CHAT_TEXT_MUTED, CHAT_TEXT_PRIMARY } from "@/components/chat/chat-theme";
import { cn } from "@/lib/utils";
import { Button, RowButton, SelectField } from "@/ui";

type SharedTab = "all" | "links" | "files";

export type ChatSharedDrawerProps = {
  open: boolean;
  teamId: number;
  channelId: number;
  members: TeamMember[];
  onClose: () => void;
  onJumpToMessage: (messageId: number) => void;
};

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function ChatSharedDrawer({
  open,
  teamId,
  channelId,
  members,
  onClose,
  onJumpToMessage,
}: ChatSharedDrawerProps): React.ReactElement | null {
  const [tab, setTab] = useState<SharedTab>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [items, setItems] = useState<ChatActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const memberNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of members) map.set(m.userId, m.displayName);
    return map;
  }, [members]);

  const loadLog = useCallback(async () => {
    if (!open || !teamId || !channelId) return;
    setLoading(true);
    try {
      const list = await fetchChatActivityLog(teamId, channelId, {
        limit: 100,
        userId: userFilter !== "all" ? Number(userFilter) : undefined,
      });
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [open, teamId, channelId, userFilter]);

  useEffect(() => {
    void loadLog();
  }, [loadLog]);

  const filtered = useMemo(() => {
    return items.filter((entry) => {
      if (entry.kind === "file_removed" || entry.kind === "link_removed") return false;
      if (tab === "links") return isLinkActivity(entry);
      if (tab === "files") return isFileActivity(entry);
      return true;
    });
  }, [items, tab]);

  if (!open) return null;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-muted">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className={cn("text-base font-bold", CHAT_TEXT_PRIMARY)}>Shared</h3>
        <Button size="icon" icon={X} variant="quiet" type="button" onClick={onClose} aria-label="Close shared panel"></Button>
      </div>
      <div className="flex gap-1 px-4 pb-2">
        {(["all", "links", "files"] as SharedTab[]).map((t) => (
          <Button
            pressed={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      <div className="px-4 pb-3">
        <SelectField placeholder="All members" value={userFilter} onValueChange={setUserFilter} options={[{ value: "all", label: "All members" }, ...members.map((m) => ({ value: String(m.userId), label: m.displayName }))]} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {loading && items.length === 0 ? (
          <div className={cn("flex items-center justify-center py-8 text-base", CHAT_TEXT_MUTED)}>
            
            Loading
          </div>
        ) : null}
        {!loading && filtered.length === 0 ? (
          <p className={cn("px-2 py-8 text-center text-base", CHAT_TEXT_MUTED)}>No shared links or files yet.</p>
        ) : null}
        {filtered.map((entry) => (
          <RowButton
            key={entry.id}
            type="button"
            onClick={() => {
              writeChatMessagePath(entry.messageId);
              onJumpToMessage(entry.messageId);
            }}
          >
            {isLinkActivity(entry) ? (
              <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            ) : (
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            )}
            <span className="min-w-0 flex-1">
              <span className={cn("block break-words text-base font-medium", CHAT_TEXT_PRIMARY)}>{activityLabel(entry)}</span>
              <span className={cn("block text-base", CHAT_TEXT_MUTED)}>
                {memberNameById.get(entry.userId) ?? "Unknown"} · {formatTime(entry.ts || entry.createdAt)}
              </span>
            </span>
          </RowButton>
        ))}
      </div>
    </aside>
  );
}
