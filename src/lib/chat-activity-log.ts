export type ChatActivityKind = "link_shared" | "file_shared" | "file_removed" | "link_removed";

export type ChatActivityLogEntry = {
  id: number;
  kind: ChatActivityKind;
  channelId: number;
  messageId: number;
  userId: number;
  ts: string;
  createdAt: string;
  url?: string;
  previewId?: number;
  previewTitle?: string;
  assetId?: number;
  fileName?: string;
  mime?: string;
  bytes?: number;
  threadRootMessageId?: number | null;
  channelName?: string;
  sharerDisplayName?: string;
  threadPreviewPlain?: string;
};

export function isLinkActivity(entry: ChatActivityLogEntry): boolean {
  return entry.kind === "link_shared";
}

export function isFileActivity(entry: ChatActivityLogEntry): boolean {
  return entry.kind === "file_shared" || entry.kind === "file_removed";
}

export function activityLabel(entry: ChatActivityLogEntry): string {
  if (entry.kind === "file_shared" || entry.kind === "file_removed") {
    return entry.fileName ?? "File";
  }
  if (entry.url) {
    try {
      return new URL(entry.url).hostname;
    } catch {
      return entry.url;
    }
  }
  return "Link";
}

import { appNavigate } from "@/lib/app-navigation";

export function chatMessagePath(messageId: number): string {
  return `/chat?message=${messageId}`;
}

export function writeChatMessagePath(messageId: number): void {
  appNavigate(chatMessagePath(messageId), { replace: true });
}

export function parseChatMessageQuery(search: string): number | null {
  const raw = new URLSearchParams(search).get("message");
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
