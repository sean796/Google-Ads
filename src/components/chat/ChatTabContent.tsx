import React from "react";
import { ChatPreferencesProvider } from "@/contexts/ChatPreferencesProvider";
import { ChatShell } from "@/components/chat/ChatShell";

export function ChatTabContent(): React.ReactElement {
  return (
    <ChatPreferencesProvider>
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <ChatShell />
      </div>
    </ChatPreferencesProvider>
  );
}
