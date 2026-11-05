import React from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatAttachment } from "@/lib/chat-types";
import { CHAT_TEXT_MUTED, CHAT_TEXT_PRIMARY } from "@/components/chat/chat-theme";
import { ChatAuthenticatedImage } from "@/components/chat/thread/ChatAuthenticatedImage";
import { Button } from "@/ui";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type ChatAttachmentChipProps = {
  attachment: ChatAttachment;
  downloadUrl: string;
  inlineUrl?: string;
};

export function ChatAttachmentChip({
  attachment,
  downloadUrl,
  inlineUrl,
}: ChatAttachmentChipProps): React.ReactElement {
  const isImage = attachment.mime.startsWith("image/");
  if (isImage && inlineUrl) {
    return (
      <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block max-w-md">
        <ChatAuthenticatedImage
          src={inlineUrl}
          alt={attachment.fileName}
          className="max-h-60 rounded-lg object-contain"
        />
      </a>
    );
  }

  return (
    <a
      href={downloadUrl}
      download={attachment.fileName}
      className="chat-attachment-chip mt-2 inline-flex max-w-full items-center gap-2 rounded-lg bg-muted px-3 py-2 hover:bg-muted/80"
    >
      <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0">
        <span className={cn("block break-words text-base font-medium", CHAT_TEXT_PRIMARY)}>{attachment.fileName}</span>
        <span className={cn("text-base", CHAT_TEXT_MUTED)}>{formatBytes(attachment.bytes)}</span>
      </span>
    </a>
  );
}

export type PendingAttachmentChipProps = {
  fileName: string;
  bytes: number;
  previewUrl?: string;
  onRemove: () => void;
};

export function PendingAttachmentChip({
  fileName,
  bytes,
  previewUrl,
  onRemove,
}: PendingAttachmentChipProps): React.ReactElement {
  if (previewUrl) {
    return (
      <div className="relative inline-block max-w-[200px]">
        <img src={previewUrl} alt={fileName} className="max-h-24 rounded-lg object-cover" />
        <Button
          variant="quiet"
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
    );
  }

  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-lg bg-muted px-3 py-2">
      <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn("block break-words text-base font-medium", CHAT_TEXT_PRIMARY)}>{fileName}</span>
        <span className={cn("text-base", CHAT_TEXT_MUTED)}>{formatBytes(bytes)}</span>
      </span>
      <Button variant="quiet" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}
