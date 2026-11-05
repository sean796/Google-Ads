import React, { useCallback, useEffect, useState } from "react";
import { ActionButton, Button, DialogShell, Field, FilterRow, Pill } from "@/ui";
import type { TaskSection } from "@/lib/tasks-types";

const SECTION_PRESETS = ["To do", "In progress", "Review", "Done"] as const;

const SAVE_STATES = ["Create", "Creating", "Save", "Saving"] as const;

export type AddSectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editSection?: TaskSection | null;
  onCreate: (payload: { keyword: string; title: string }) => Promise<boolean>;
  onUpdate?: (sectionId: number, payload: { keyword: string; title: string }) => Promise<boolean>;
};

export function AddSectionDialog({
  open,
  onOpenChange,
  editSection = null,
  onCreate,
  onUpdate,
}: AddSectionDialogProps): React.ReactElement {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = editSection != null;

  const reset = useCallback(() => {
    setTitle("");
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (editSection) {
      setTitle(editSection.title);
      setError(null);
    } else {
      reset();
    }
  }, [editSection, open, reset]);

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Section name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      keyword: trimmedTitle.toLowerCase().replace(/\s+/g, "-"),
      title: trimmedTitle,
    };
    let ok = false;
    if (isEdit && editSection && onUpdate) {
      ok = await onUpdate(editSection.id, payload);
      if (!ok) setError("Could not update section.");
    } else {
      ok = await onCreate(payload);
      if (!ok) setError("Could not create section.");
    }
    setSaving(false);
    if (!ok) return;
    reset();
    onOpenChange(false);
  }, [editSection, isEdit, onCreate, onOpenChange, onUpdate, reset, title]);

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      size="md"
      title={isEdit ? "Edit section" : "Add section"}
      actions={
        <>
          <Button variant="tool" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <ActionButton
            states={SAVE_STATES}
            state={saving ? (isEdit ? "Saving" : "Creating") : isEdit ? "Save" : "Create"}
            disabled={saving}
            onClick={() => void handleSubmit()}
          />
        </>
      }
    >
      <FilterRow aria-label="Section presets">
        {SECTION_PRESETS.map((preset) => (
          <Pill
            key={preset}
            label={preset}
            square
            active={title === preset}
            disabled={saving}
            onClick={() => setTitle(preset)}
          />
        ))}
      </FilterRow>
      <Field
        placeholder="Section name"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={saving}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleSubmit();
        }}
      />
      <p className="h-6 text-ui-danger">{error}</p>
    </DialogShell>
  );
}
