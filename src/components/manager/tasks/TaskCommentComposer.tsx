import React, { useMemo, useState } from "react";
import { DASHBOARD_SETTINGS_FIELD_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import type { TeamMember } from "@/lib/teams-types";
import { Button, RowButton, TextareaField } from "@/ui";

export type TaskCommentComposerProps = {
  members: TeamMember[];
  disabled?: boolean;
  onSubmit: (body: string, mentionUserIds: number[]) => void;
};

export function TaskCommentComposer({
  members,
  disabled,
  onSubmit,
}: TaskCommentComposerProps): React.ReactElement {
  const [body, setBody] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");

  const mentionCandidates = useMemo(() => {
    const q = mentionFilter.toLowerCase();
    return members.filter((m) => {
      const name = (m.displayName || m.email).toLowerCase();
      return !q || name.includes(q);
    });
  }, [members, mentionFilter]);

  const insertMention = (member: TeamMember) => {
    const name = member.displayName || member.email;
    setBody((prev) => `${prev.replace(/@\S*$/, "")}@${name} `);
    setMentionOpen(false);
    setMentionFilter("");
  };

  const handleChange = (value: string) => {
    setBody(value);
    const match = value.match(/@(\S*)$/);
    if (match) {
      setMentionOpen(true);
      setMentionFilter(match[1] ?? "");
    } else {
      setMentionOpen(false);
      setMentionFilter("");
    }
  };

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    const mentionUserIds: number[] = [];
    for (const member of members) {
      const name = member.displayName || member.email;
      if (trimmed.includes(`@${name}`)) {
        mentionUserIds.push(member.userId);
      }
    }
    onSubmit(trimmed, mentionUserIds);
    setBody("");
    setMentionOpen(false);
  };

  return (
    <div className="relative flex flex-col gap-2">
      <TextareaField
        value={body}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Add a comment. Type @ to mention"
        disabled={disabled}
      />
      {mentionOpen && mentionCandidates.length > 0 ? (
        <ul className="absolute bottom-full left-0 z-10 mb-1 max-h-40 w-full overflow-y-auto bg-ui-field">
          {mentionCandidates.map((member) => (
            <li key={member.userId}>
              <RowButton
                type="button"
                onClick={() => insertMention(member)}
              >
                {member.displayName || member.email}
              </RowButton>
            </li>
          ))}
        </ul>
      ) : null}
      <Button variant="run" type="button" disabled={disabled || !body.trim()} onClick={handleSubmit}>
        Comment
      </Button>
    </div>
  );
}
