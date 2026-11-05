import { useCallback, useState } from "react";
import { DASHBOARD_SETTINGS_GROUP_CLASS, DASHBOARD_SETTINGS_FIELD_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { useTeam } from "@/contexts/TeamContext";
import { addJobTitlePreset, addTeamMember } from "@/lib/teams-api";
import { useTeamPermission } from "@/hooks/use-team-permission";
import { ACCESS_ROLE_OPTIONS, DEFAULT_OWNER_JOB_TITLE } from "@/lib/teams-types";
import { TeamJobTitleField } from "@/components/manager/teams/TeamJobTitleField";
import { Button, Field, SelectField } from "@/ui";

const INPUT_CLASS = `${DASHBOARD_SETTINGS_FIELD_CLASS} min-w-0 flex-1 h-12`;

export function TeamInvitePanel() {
  const { activeTeam, jobTitlePresets, refreshMembers } = useTeam();
  const { canWrite } = useTeamPermission();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [accessRole, setAccessRole] = useState<(typeof ACCESS_ROLE_OPTIONS)[number]["value"]>("admin");
  const [jobTitle, setJobTitle] = useState(DEFAULT_OWNER_JOB_TITLE);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const handleAdd = useCallback(async () => {
    if (!activeTeam) return;
    setSaving(true);
    setStatus(null);
    try {
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();
      const trimmedJobTitle = jobTitle.trim();
      const r = await addTeamMember(activeTeam.id, {
        email: trimmedEmail,
        accessRole,
        jobTitle: trimmedJobTitle,
        displayName: displayName.trim() || undefined,
        password: trimmedPassword,
      });
      if (!r.ok) {
        setStatus({ ok: false, message: r.error || "Could not add member." });
        return;
      }
      if (!jobTitlePresets.some((p) => p.title === trimmedJobTitle)) {
        await addJobTitlePreset(activeTeam.id, trimmedJobTitle);
      }
      setEmail("");
      setDisplayName("");
      setPassword("");
      setStatus({ ok: true, message: `Added ${trimmedEmail} as ${accessRole}.` });
      await refreshMembers();
    } catch {
      setStatus({ ok: false, message: "Request failed." });
    } finally {
      setSaving(false);
    }
  }, [activeTeam, email, displayName, password, accessRole, jobTitle, jobTitlePresets, refreshMembers]);

  if (!activeTeam || !canWrite("teams")) return null;

  return (
    <div className={DASHBOARD_SETTINGS_GROUP_CLASS}>
      <div className="space-y-2">
        <p className="font-semibold text-white">Add member</p>
        <p className="text-base text-white">Creates the account and adds them to the team. No email is sent.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="font-semibold text-white">Email</p>
          <Field
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
            placeholder="you@agency.com"
          />
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-white">Display name</p>
          <Field
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-label="Display name"
            placeholder="Display name"
          />
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-white">Password</p>
          <Field
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
            placeholder="Password"
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-white">Access role</p>
          <SelectField
            placeholder="Access role"
            value={accessRole}
            onValueChange={(v) => setAccessRole(v as typeof accessRole)}
            options={ACCESS_ROLE_OPTIONS}
            width="full"
          />
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-white">Job title</p>
          <TeamJobTitleField
            value={jobTitle}
            onChange={setJobTitle}
            presets={jobTitlePresets}
          />
        </div>
        <Button
          variant="run"
          type="button"
          disabled={saving || !email.trim() || !password.trim() || !jobTitle.trim()}
          onClick={() => void handleAdd()}
        >
          {saving ? "Adding…" : "Add member"}
        </Button>
      </div>
      {status ? (
        <p className={`text-base ${status.ok ? "text-white" : "text-ui-danger-hover"}`}>{status.message}</p>
      ) : null}
    </div>
  );
}
