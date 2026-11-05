import React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatLinkPreview } from "@/lib/chat-types";
import { CHAT_TEXT_MUTED, CHAT_TEXT_PRIMARY } from "@/components/chat/chat-theme";

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type ChatLinkPreviewCardProps = {
  preview: ChatLinkPreview;
};

export function ChatLinkPreviewCard({ preview }: ChatLinkPreviewCardProps): React.ReactElement {
  const title = preview.title?.trim() || domainFromUrl(preview.url);
  const site = preview.siteName?.trim() || domainFromUrl(preview.url);

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="chat-link-preview mt-2 flex max-w-md overflow-hidden rounded-lg"
    >
      {preview.imageUrl ? (
        <img
          src={preview.imageUrl}
          alt=""
          className="h-20 w-20 shrink-0 object-cover"
        />
      ) : null}
      <div className="min-w-0 flex-1 p-3">
        <div className={cn("flex items-start gap-1 text-base font-semibold", CHAT_TEXT_PRIMARY)}>
          <span className="">{title}</span>
          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 opacity-60" aria-hidden />
        </div>
        {preview.description ? (
          <p className={cn("mt-1 text-base", CHAT_TEXT_MUTED)}>{preview.description}</p>
        ) : null}
        <p className={cn("mt-1 text-base", CHAT_TEXT_MUTED)}>{site}</p>
      </div>
    </a>
  );
}
