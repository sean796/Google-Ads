import { useCallback, useEffect, useState } from "react";
import { Button, DialogShell, Field } from "@/ui";
import type { WordPressSite } from "@/components/integrations/types";
import {
  wordpressSiteCanonicalName,
  wordpressSiteMenuDisplayName,
} from "@/lib/wordpress-site-display-name";

export type SiteDisplayNameDialogProps = {
  open: boolean;
  site: WordPressSite | null;
  onOpenChange: (open: boolean) => void;
  onSave: (siteId: string, name: string) => void;
  /** Menu label (header) vs stored property name (Integrations list). */
  variant?: "menu" | "canonical";
};

export function SiteDisplayNameDialog({
  open,
  site,
  onOpenChange,
  onSave,
  variant = "menu",
}: SiteDisplayNameDialogProps) {
  const [name, setName] = useState("");
  const title = variant === "canonical" ? "Property name" : "Display name";

  useEffect(() => {
    if (!open || !site) return;
    setName(
      variant === "canonical" ? wordpressSiteCanonicalName(site) : wordpressSiteMenuDisplayName(site),
    );
  }, [open, site, variant]);

  const trimmedName = name.trim();
  const canSave = Boolean(site && trimmedName);

  const handleSave = useCallback(() => {
    if (!site || !trimmedName) return;
    onSave(site.id, trimmedName);
    onOpenChange(false);
  }, [onOpenChange, onSave, site, trimmedName]);

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={title}
      actions={
        <>
          <Button variant="tool" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="run" disabled={!canSave} onClick={handleSave}>
            Save
          </Button>
        </>
      }
    >
      <Field
        placeholder={title}
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Enter" && canSave) {
            event.preventDefault();
            handleSave();
          }
        }}
      />
    </DialogShell>
  );
}
