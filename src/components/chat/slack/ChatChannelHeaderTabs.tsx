import React from "react";
import { cn } from "@/lib/utils";
import type { MinimalChannelTab } from "@/components/chat/layout/chat-shell-types";
import { Button } from "@/ui";

type Props = {
  activeTab: MinimalChannelTab;
  onTabChange: (tab: MinimalChannelTab) => void;
};

export function ChatChannelHeaderTabs({ activeTab, onTabChange }: Props): React.ReactElement {
  const tabs: { id: MinimalChannelTab; label: string }[] = [
    { id: "messages", label: "Messages" },
    { id: "files", label: "Files" },
  ];

  return (
    <div className="flex shrink-0 items-center gap-4 px-1" role="tablist" aria-label="Channel views">
      {tabs.map((tab) => (
        <Button
          pressed={activeTab === tab.id}
          variant="quiet"
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}
