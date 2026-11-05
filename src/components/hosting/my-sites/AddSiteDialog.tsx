import { useEffect, useState } from "react";
import { ActionButton, Button, DialogShell, Field, SelectField } from "@/ui";
import { createHostedEnvironment, type HostedEnvironmentKind, type HostedSiteGroup } from "@/lib/hosting-api";

export type AddSiteDialogProps = {
  open: boolean;
  /** When set, adds an environment to this existing site instead of creating a new one. */
  group: HostedSiteGroup | null;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

const KINDS: Array<{ value: HostedEnvironmentKind; label: string }> = [
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "development", label: "Development" },
];

const SUBMIT_STATES = ["Create site", "Add environment", "Creating"] as const;

export function AddSiteDialog({ open, group, onOpenChange, onCreated }: AddSiteDialogProps) {
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<HostedEnvironmentKind | "">("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setDomain("");
    setError("");
    const used = new Set(group?.environments.map((e) => e.environment) ?? []);
    setEnvironment(group ? (KINDS.find((k) => !used.has(k.value))?.value ?? "") : "production");
  }, [open, group]);

  const taken = new Set(group?.environments.map((e) => e.environment) ?? []);
  const canSubmit = Boolean(environment) && (group ? true : name.trim().length > 0) && !busy;

  async function submit() {
    if (!environment) return;
    setBusy(true);
    setError("");
    const res = await createHostedEnvironment({
      name: group ? undefined : name.trim(),
      groupId: group?.id,
      environment,
      primaryDomain: domain.trim() || undefined,
    });
    setBusy(false);
    if (res.ok === false) {
      setError(res.error);
      return;
    }
    onOpenChange(false);
    onCreated();
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={group ? `Add environment to ${group.name}` : "Add site"}
      actions={
        <>
          <Button variant="tool" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <ActionButton
            states={SUBMIT_STATES}
            state={busy ? "Creating" : group ? "Add environment" : "Create site"}
            disabled={!canSubmit}
            onClick={() => void submit()}
          />
        </>
      }
    >
      {group ? null : (
        <Field placeholder="Site name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      )}
      <SelectField
        placeholder="Environment"
        value={environment}
        options={KINDS.map((k) => ({ ...k, disabled: taken.has(k.value) }))}
        onValueChange={(v) => setEnvironment(v as HostedEnvironmentKind)}
      />
      <Field
        placeholder="Custom domain (optional)"
        aria-label="Custom domain"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
      />
      <p className="h-6 text-ui-danger" title={error || undefined}>
        {error}
      </p>
    </DialogShell>
  );
}
