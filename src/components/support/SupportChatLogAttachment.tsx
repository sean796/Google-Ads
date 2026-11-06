import { Paperclip } from "lucide-react";
import { supportChatLogByteSize } from "@/components/support/support-chat-log-helpers";

type SupportChatLogAttachmentProps = {
  chatLog?: Record<string, unknown> | null;
  fileName?: string;
  sizeLabel?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function SupportChatLogAttachment({
  chatLog = null,
  fileName = "pulse-assist-chat-log.json",
  sizeLabel,
}: SupportChatLogAttachmentProps) {
  const bytes = chatLog ? supportChatLogByteSize(chatLog) : 0;
  const size = sizeLabel ?? (bytes > 0 ? formatBytes(bytes) : "JSON attachment");

  return (
    <div className="flex items-center gap-3 bg-ui-field/70 px-3 py-3">
      <Paperclip className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="break-words text-base font-medium text-foreground">{fileName}</p>
        <p className="text-base text-muted-foreground">{size} · JSON attachment</p>
      </div>
    </div>
  );
}
