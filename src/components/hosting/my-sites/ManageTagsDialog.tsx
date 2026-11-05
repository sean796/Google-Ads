import { useEffect, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button, CheckField, DialogShell, Field } from "@/ui";
import {
  assignHostedGroupTags,
  createHostedTag,
  deleteHostedTag,
  renameHostedTag,
  type HostedSiteGroup,
  type HostedTag,
} from "@/lib/hosting-api";

export type ManageTagsDialogProps = {
  open: boolean;
  tags: HostedTag[];
  /** When set, the dialog also assigns tags to this site. */
  group: HostedSiteGroup | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
};

export function ManageTagsDialog({ open, tags, group, onOpenChange, onChanged }: ManageTagsDialogProps) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setNewName("");
    setEditingId(null);
    setError("");
    setSelected(group?.tags.map((t) => t.id) ?? []);
  }, [open, group]);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError("");
    const res = await action();
    setBusy(false);
    if (res.ok === false) {
      setError(res.error ?? "Request failed.");
      return false;
    }
    onChanged();
    return true;
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    if (await run(() => createHostedTag(name))) setNewName("");
  }

  async function saveRename() {
    if (editingId === null) return;
    const name = editName.trim();
    if (!name) return;
    if (await run(() => renameHostedTag(editingId, name))) setEditingId(null);
  }

  async function saveAssignment() {
    if (!group) return;
    if (await run(() => assignHostedGroupTags(group.id, selected))) onOpenChange(false);
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={group ? `Tags for ${group.name}` : "Manage tags"}
      actions={
        <>
          <Button variant="tool" onClick={() => onOpenChange(false)}>
            {group ? "Cancel" : "Done"}
          </Button>
          {group ? (
            <Button variant="run" disabled={busy} onClick={() => void saveAssignment()}>
              Save tags
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex gap-1.5">
        <Field
          placeholder="New tag"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
        />
        <Button variant="run" disabled={busy || !newName.trim()} onClick={() => void create()}>
          Add
        </Button>
      </div>
      <ul className="flex max-h-64 flex-col gap-px overflow-y-auto">
        {tags.length === 0 ? (
          <li className="flex h-9 items-center bg-ui-field px-2 text-muted-foreground">No tags yet</li>
        ) : null}
        {tags.map((tag) => (
          <li key={tag.id} className="flex h-9 items-center gap-2 bg-ui-field px-2">
            {group ? (
              <CheckField
                aria-label={`Assign ${tag.name}`}
                checked={selected.includes(tag.id)}
                onCheckedChange={(v) =>
                  setSelected((prev) => (v ? [...prev, tag.id] : prev.filter((id) => id !== tag.id)))
                }
              />
            ) : null}
            {editingId === tag.id ? (
              <Field
                placeholder="Tag name"
                value={editName}
                autoFocus
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveRename();
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <span className="flex-1 whitespace-nowrap">{tag.name}</span>
            )}
            {editingId === tag.id ? (
              <>
                <Button variant="tool" size="icon" icon={Check} aria-label="Save" onClick={() => void saveRename()} />
                <Button variant="tool" size="icon" icon={X} aria-label="Cancel" onClick={() => setEditingId(null)} />
              </>
            ) : (
              <>
                <Button
                  variant="tool"
                  size="icon"
                  icon={Pencil}
                  aria-label={`Rename ${tag.name}`}
                  onClick={() => {
                    setEditingId(tag.id);
                    setEditName(tag.name);
                  }}
                />
                <Button
                  variant="tool"
                  size="icon"
                  icon={Trash2}
                  aria-label={`Delete ${tag.name}`}
                  disabled={busy}
                  onClick={() => void run(() => deleteHostedTag(tag.id))}
                />
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="h-6 text-ui-danger" title={error || undefined}>
        {error}
      </p>
    </DialogShell>
  );
}
