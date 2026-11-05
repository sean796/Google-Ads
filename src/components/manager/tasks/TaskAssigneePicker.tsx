import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { isNeoPulseBotMember, sortMembersWithNeoPulseBotFirst } from "@/lib/chat-neo-pulse";
import type { TeamMember } from "@/lib/teams-types";
import { Button, RowButton } from "@/ui";

export type TaskAssigneePickerProps = {
  members: TeamMember[];
  assigneeIds: number[];
  onChange: (assigneeIds: number[]) => void;
  variant?: "list" | "inline";
  humansOnly?: boolean;
};

export function TaskAssigneePicker({
  members,
  assigneeIds,
  onChange,
  variant = "list",
  humansOnly = false,
}: TaskAssigneePickerProps): React.ReactElement {
  const sortedMembers = useMemo(() => {
    const filtered = humansOnly ? members.filter((m) => !isNeoPulseBotMember(m)) : members;
    return humansOnly ? filtered : sortMembersWithNeoPulseBotFirst(filtered);
  }, [humansOnly, members]);

  const toggle = (userId: number) => {
    if (assigneeIds.includes(userId)) {
      onChange(assigneeIds.filter((id) => id !== userId));
    } else {
      onChange([...assigneeIds, userId]);
    }
  };

  if (variant === "inline") {
    return (
      <div className="flex min-w-0 flex-wrap gap-1">
        {sortedMembers.map((member) => {
          const active = assigneeIds.includes(member.userId);
          const isBot = isNeoPulseBotMember(member);
          const label = isBot ? "NEO Pulse" : member.displayName || member.email;
          return (
            <Button
              pressed={Boolean(active)}
              variant="quiet"
              key={member.userId}
              onClick={() => toggle(member.userId)}
            >
              {label}
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-base font-semibold text-white">Assignees</p>
      <ul className="flex flex-col gap-1">
        {sortedMembers.map((member) => {
          const active = assigneeIds.includes(member.userId);
          const isBot = isNeoPulseBotMember(member);
          const label = isBot ? "NEO Pulse" : member.displayName || member.email;
          return (
            <li key={member.userId}>
              <RowButton
                selected={Boolean(active)}
                type="button"
                onClick={() => toggle(member.userId)}
              >
                {label}
              </RowButton>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
