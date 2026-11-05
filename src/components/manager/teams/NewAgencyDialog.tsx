import { useCallback, useState } from "react";
import { ActionButton, Button, DialogShell, Field } from "@/ui";
import { useTeam } from "@/contexts/TeamContext";
import { createTeam } from "@/lib/teams-api";
import {
  DEFAULT_OWNER_JOB_TITLE,
  DEFAULT_TEAM_NAME,
} from "@/lib/teams-types";

const CREATE_STATES = ["Create", "Creating"] as const;

export type NewAgencyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewAgencyDialog({ open, onOpenChange }: NewAgencyDialogProps) {
  const { refresh } = useTeam();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Agency name is required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const r = await createTeam({
        name: trimmed,
        jobTitle: DEFAULT_OWNER_JOB_TITLE,
      });
      if (!r.ok) {
        setError(r.error || "Could not create agency.");
        return;
      }
      setName("");
      onOpenChange(false);
      await refresh();
    } finally {
      setCreating(false);
    }
  }, [name, onOpenChange, refresh]);

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="New agency"
      actions={
        <>
          <Button variant="tool" disabled={creating} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <ActionButton
            states={CREATE_STATES}
            state={creating ? "Creating" : "Create"}
            disabled={creating}
            onClick={() => void handleCreate()}
          />
        </>
      }
    >
      <Field
        placeholder={DEFAULT_TEAM_NAME}
        aria-label="Agency name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={creating}
      />
      <p className="h-6 text-ui-danger">{error}</p>
    </DialogShell>
  );
}
