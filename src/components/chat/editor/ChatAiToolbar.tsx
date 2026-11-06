import React, { useCallback, useRef, useState } from "react";
import { Sparkles, SpellCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { transformChatHtml, type ChatAiMode } from "@/lib/chat-ai-compose";
import type { ChatRichEditorHandle } from "@/components/chat/editor/ChatRichEditor";
import { CHAT_ICON_BTN_CLASS } from "@/components/chat/chat-theme";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui";

const AI_MENU: Array<{ mode: ChatAiMode; label: string }> = [
  { mode: "correct", label: "Correct" },
  { mode: "enhance", label: "Enhance" },
  { mode: "professional", label: "Professional" },
  { mode: "shorter", label: "Shorter" },
  { mode: "clearer", label: "Clearer" },
];

export type ChatAiToolbarProps = {
  editorRef: React.RefObject<ChatRichEditorHandle | null>;
  disabled?: boolean;
  onHtmlChange?: (html: string) => void;
  inline?: boolean;
  variant?: "buttons" | "spark-dropdown";
};

export function ChatAiToolbar({
  editorRef,
  disabled,
  onHtmlChange,
  inline = false,
  variant = "buttons",
}: ChatAiToolbarProps): React.ReactElement {
  const [activeMode, setActiveMode] = useState<ChatAiMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runTransform = useCallback(
    async (mode: ChatAiMode) => {
      const editor = editorRef.current;
      if (!editor || disabled) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setActiveMode(mode);
      setError(null);

      const html = editor.getHtml();
      const result = await transformChatHtml(html, mode, controller.signal);

      if (controller.signal.aborted) return;

      setActiveMode(null);
      if (result.ok === true) {
        editor.setHtml(result.bodyHtml);
        onHtmlChange?.(result.bodyHtml);
      } else if (result.error !== "Cancelled") {
        setError(result.error);
      }
    },
    [disabled, editorRef, onHtmlChange],
  );

  const busy = activeMode != null;
  const btnClass = "h-8 gap-1.5 px-2 text-base text-muted-foreground hover:bg-muted hover:text-black";

  if (variant === "spark-dropdown") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="quiet"
            type="button"
            disabled={disabled || busy}
            aria-label="AI options"
          >
            {busy ? (
              null
            ) : (
              <Sparkles className="h-4 w-4 text-primary" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-base">
          {AI_MENU.map(({ mode, label }) => (
            <DropdownMenuItem key={mode} className="text-base gap-2" onClick={() => void runTransform(mode)}>
              {mode === "correct" ? <SpellCheck className="h-4 w-4" /> : null}
              {mode === "enhance" ? <Sparkles className="h-4 w-4" /> : null}
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className={cn("flex shrink-0 items-center gap-0.5", !inline && "border-b border-border px-2 py-1")}>
      <Button
        variant="quiet"
        type="button"
        disabled={disabled || busy}
        onClick={() => void runTransform("correct")}
      >
        {activeMode === "correct" ? (
          null
        ) : (
          <SpellCheck className="h-4 w-4" />
        )}
        Correct
      </Button>
      <Button
        variant="quiet"
        type="button"
        disabled={disabled || busy}
        onClick={() => void runTransform("enhance")}
      >
        {activeMode === "enhance" ? (
          null
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Enhance
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="quiet" type="button" disabled={disabled || busy}>
            More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="text-base">
          <DropdownMenuItem className="text-base" onClick={() => void runTransform("professional")}>
            Professional
          </DropdownMenuItem>
          <DropdownMenuItem className="text-base" onClick={() => void runTransform("shorter")}>
            Shorter
          </DropdownMenuItem>
          <DropdownMenuItem className="text-base" onClick={() => void runTransform("clearer")}>
            Clearer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? <span className="max-w-[8rem] break-words text-base text-ui-danger">{error}</span> : null}
    </div>
  );
}
