import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { ChatRichEditor, type ChatRichEditorHandle } from "@/components/chat/editor/ChatRichEditor";
import type { MentionMember } from "@/components/chat/editor/chat-editor-extensions";
import { PendingAttachmentChip } from "@/components/chat/thread/ChatAttachmentChip";
import { ChatDraftLinkPreviews } from "@/components/chat/editor/ChatDraftLinkPreviews";
import { uploadChatFile } from "@/lib/chat-api";
import { CHAT_COMPOSER_BOX_CLASS, CHAT_COMPOSER_WRAP_CLASS, CHAT_ICON_BTN_CLASS } from "@/components/chat/chat-theme";
import { cn } from "@/lib/utils";
import { Button, FileInput } from "@/ui";

export type ChatComposerHandle = {
  setHtml: (html: string) => void;
};

export type ChatComposerProps = {
  teamId: number | null;
  channelId: number | null;
  members: MentionMember[];
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
  onSend: (html: string, attachmentAssetIds: number[]) => void;
  onTyping?: () => void;
  enterToSend?: boolean;
  showLinkPreviews?: boolean;
  compactToolbar?: boolean;
};

type PendingFile = {
  assetId: number;
  fileName: string;
  bytes: number;
  mime?: string;
  previewUrl?: string;
};

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
  {
    teamId,
    channelId,
    members,
    disabled,
    sending,
    placeholder,
    onSend,
    onTyping,
    enterToSend = true,
    showLinkPreviews = true,
    compactToolbar = false,
  },
  ref,
) {
  const editorRef = useRef<ChatRichEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [draftHtml, setDraftHtml] = useState("");
  const lastTypingRef = useRef(0);

  useImperativeHandle(ref, () => ({
    setHtml: (html: string) => {
      editorRef.current?.setHtml(html);
      setDraftHtml(html);
    },
  }));

  const handleSend = (html: string) => {
    onSend(html, pending.map((p) => p.assetId));
    setPending([]);
    setDraftHtml("");
  };

  const handleChange = (html: string) => {
    setDraftHtml(html);
    if (!onTyping || disabled) return;
    const now = Date.now();
    if (now - lastTypingRef.current >= 2000) {
      lastTypingRef.current = now;
      onTyping();
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!teamId || !channelId || disabled || uploading) return;
    setUploading(true);
    try {
      const next: PendingFile[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadChatFile(teamId, channelId, file);
        if (result.ok && result.asset) {
          const isImage = file.type.startsWith("image/");
          next.push({
            assetId: result.asset.id,
            fileName: result.asset.fileName,
            bytes: result.asset.bytes,
            mime: result.asset.mime,
            previewUrl: isImage ? URL.createObjectURL(file) : undefined,
          });
        }
      }
      if (next.length > 0) {
        setPending((prev) => [...prev, ...next]);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={CHAT_COMPOSER_WRAP_CLASS}>
      {pending.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {pending.map((file) => (
            <PendingAttachmentChip
              key={file.assetId}
              fileName={file.fileName}
              bytes={file.bytes}
              previewUrl={file.previewUrl}
              onRemove={() => setPending((prev) => prev.filter((p) => p.assetId !== file.assetId))}
            />
          ))}
        </div>
      ) : null}
      <div
        className={CHAT_COMPOSER_BOX_CLASS}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files);
        }}
      >
        {!disabled ? (
          <FileInput
            ref={fileInputRef}
            multiple
            accept=".pdf,.txt,.csv,.json,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp"
            onChange={(e) => {
              if (e.target.files?.length) void uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        ) : null}
        {!disabled && !compactToolbar ? (
          <Button
            size="icon" icon={Paperclip}
            variant="quiet"
            type="button"
            disabled={uploading || sending}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach file"
          ></Button>
        ) : null}
        <ChatRichEditor
          ref={editorRef}
          members={members}
          disabled={disabled || sending || uploading}
          placeholder={placeholder ?? (disabled ? "Read-only" : enterToSend ? "Message… (Enter to send, Shift+Enter for newline)" : "Message… (Ctrl+Enter to send)")}
          onChange={handleChange}
          onSubmit={handleSend}
          showAiToolbar={!disabled && !sending}
          allowEmptySubmit={pending.length > 0}
          submitOnEnter={enterToSend}
          compactToolbar={compactToolbar}
          toolbarStart={
            !disabled && compactToolbar ? (
              <Button
                size="icon" icon={Paperclip}
                variant="quiet"
                type="button"
                disabled={uploading || sending}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach file"
              ></Button>
            ) : undefined
          }
        />
        {showLinkPreviews ? <ChatDraftLinkPreviews teamId={teamId} html={draftHtml} /> : null}
      </div>
    </div>
  );
});
