import React from "react";
import { ResizableHandle } from "@/ui";

import { cn } from "@/lib/utils";

export function ChatPanelResizeHandle(): React.ReactElement {
  return (
    <ResizableHandle
      withHandle
      aria-label="Resize panel"
      className={cn(
        "w-2 bg-[hsl(var(--chat-border)/0.35)] after:w-2",
        "transition-colors hover:bg-[hsl(var(--chat-border)/0.6)]",
      )}
    />
  );
}
