import React, { useState } from "react";
import { ActionButton, CheckField, DialogShell, Field, SelectField } from "@/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { addChatChannelMembers, createChatChannel } from "@/lib/chat-api";
import type { ChatChannel } from "@/lib/chat-types";

export type ChannelCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (channel: ChatChannel) => void;
};

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
] as const;

const CREATE_STATES = ["Create", "Creating"] as const;

export function ChannelCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: ChannelCreateDialogProps): React.ReactElement {
  const { user } = useAuth();
  const { activeTeam, members } = useTeam();
  const [name, setName] = useState("");
  const [type, setType] = useState<"public" | "private">("public");
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMember = (userId: number) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const handleCreate = async () => {
    if (!activeTeam || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createChatChannel(activeTeam.id, {
        name: name.trim(),
        type,
        memberUserIds: type === "private" ? selectedMemberIds : undefined,
      });
      if (result.ok && result.channel) {
        if (type === "private" && selectedMemberIds.length > 0) {
          await addChatChannelMembers(activeTeam.id, result.channel.id, selectedMemberIds);
        }
        onCreated(result.channel);
        setName("");
        setType("public");
        setSelectedMemberIds([]);
        onOpenChange(false);
      } else {
        setError(result.error ?? "Could not create channel");
      }
    } finally {
      setBusy(false);
    }
  };

  const inviteMembers = members.filter((m) => m.userId !== user?.id);

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="New channel"
      actions={
        <ActionButton
          states={CREATE_STATES}
          state={busy ? "Creating" : "Create"}
          disabled={busy || !name.trim()}
          onClick={() => void handleCreate()}
        />
      }
    >
      <Field placeholder="Channel name, for example project-updates" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <SelectField
        placeholder="Visibility"
        value={type}
        options={VISIBILITY_OPTIONS}
        onValueChange={(v) => setType(v as "public" | "private")}
      />
      {type === "private" ? (
        <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {inviteMembers.map((member) => (
            <CheckField
              key={member.userId}
              label={`${member.displayName} (${member.email})`}
              checked={selectedMemberIds.includes(member.userId)}
              onCheckedChange={() => toggleMember(member.userId)}
            />
          ))}
        </div>
      ) : null}
      <p className="h-6 text-ui-danger">{error}</p>
    </DialogShell>
  );
}
