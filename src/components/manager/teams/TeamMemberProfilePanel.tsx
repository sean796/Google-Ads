import { useCallback, useEffect, useState } from "react";

import { notify } from "@/lib/app-notifications";
import { DASHBOARD_SETTINGS_FIELD_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { useTeam } from "@/contexts/TeamContext";
import { addJobTitlePreset, updateTeamMember } from "@/lib/teams-api";
import { useTeamPermission } from "@/hooks/use-team-permission";
import { ACCESS_ROLE_OPTIONS, type TeamMember } from "@/lib/teams-types";
import { useAuth } from "@/contexts/AuthContext";
import { TeamJobTitleField } from "@/components/manager/teams/TeamJobTitleField";
import { Button, Field, SelectField, FloatingLabelTextarea } from "@/ui";

const INPUT_CLASS = `${DASHBOARD_SETTINGS_FIELD_CLASS} min-w-0 flex-1 h-12`;

export type TeamMemberProfilePanelProps = {
  member: TeamMember;
  onClose: () => void;
  onSaved: () => void;
};

export function TeamMemberProfilePanel({ member, onClose, onSaved }: TeamMemberProfilePanelProps) {
  const { activeTeam, jobTitlePresets } = useTeam();
  const { canWrite, isOwner } = useTeamPermission();
  const { user } = useAuth();
  const isSelf = user?.id === member.userId;
  const canManageRoles = isOwner || activeTeam?.accessRole === "admin";
  const canEditRole = canManageRoles && member.accessRole !== "owner";
  const canEdit = canWrite("teams") || isSelf;

  const [displayName, setDisplayName] = useState(member.displayName);
  const [jobTitle, setJobTitle] = useState(member.jobTitle);
  const [accessRole, setAccessRole] = useState(member.accessRole);
  const [bio, setBio] = useState(member.profile?.bio ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const canSetPassword = (canWrite("teams") || isSelf) && !member.isBot;

  useEffect(() => {
    setDisplayName(member.displayName);
    setJobTitle(member.jobTitle);
    setAccessRole(member.accessRole);
    setBio(member.profile?.bio ?? "");
    setPassword("");
  }, [member]);

  const handleSave = useCallback(async () => {
    if (!activeTeam) return;
    setSaving(true);
    try {
      const trimmedPassword = password.trim();
      const trimmedJobTitle = jobTitle.trim();
      const r = await updateTeamMember(activeTeam.id, member.userId, {
        displayName: isSelf ? displayName.trim() : undefined,
        jobTitle: trimmedJobTitle,
        accessRole: canEditRole ? accessRole : undefined,
        profile: { bio: bio.trim() },
        password: trimmedPassword || undefined,
      });
      if (!r.ok) {
        notify.error(r.error || "Save failed");
        return;
      }
      if (trimmedJobTitle && !jobTitlePresets.some((p) => p.title === trimmedJobTitle)) {
        await addJobTitlePreset(activeTeam.id, trimmedJobTitle);
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [activeTeam, member.userId, displayName, jobTitle, accessRole, bio, password, jobTitlePresets, isSelf, canEditRole, onSaved, onClose]);

  const handleRemove = useCallback(async () => {
    if (!activeTeam || !window.confirm("Remove this member from the team?")) return;
    const r = await updateTeamMember(activeTeam.id, member.userId, { remove: true });
    if (!r.ok) {
      notify.error(r.error || "Remove failed");
      return;
    }
    onSaved();
    onClose();
  }, [activeTeam, member.userId, onSaved, onClose]);

  return (
    <div className="space-y-4 rounded-lg border border-white/[0.08] bg-ui-field/50 p-4">
      <div className="space-y-2">
        <p className="font-semibold text-white">Member profile</p>
        <p className="text-base text-white">Job title appears on the team roster. Access role controls permissions.</p>
      </div>

      {isSelf ? (
        <div className="space-y-2">
          <p className="font-semibold text-white">Display name</p>
          <Field
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-label="Display name"
            disabled={!canEdit}
          />
        </div>
      ) : (
        <p className="text-base text-white">{member.displayName || member.email}</p>
      )}

      <p className="text-base text-white">{member.email}</p>

      <div className="space-y-2">
        <p className="font-semibold text-white">Job title</p>
        <TeamJobTitleField
          value={jobTitle}
          onChange={setJobTitle}
          presets={jobTitlePresets}
          disabled={!canEdit}
        />
      </div>

      <FloatingLabelTextarea
        id={`member-bio-${member.userId}`}
        label="Bio"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        disabled={!canEdit}
        className="min-h-[6rem] border-white/[0.08] bg-ui-field/50 text-base text-white"
      />

      <div className="space-y-2">
        <p className="font-semibold text-white">Access role</p>
        {canEditRole ? (
          <SelectField
            placeholder="Access role"
            value={accessRole}
            onValueChange={(v) => setAccessRole(v as typeof accessRole)}
            options={ACCESS_ROLE_OPTIONS}
            width="full"
          />
        ) : (
          <p className="text-base text-white capitalize">{member.accessRole}</p>
        )}
      </div>

      {canSetPassword ? (
        <div className="space-y-2">
          <p className="font-semibold text-white">Password</p>
          <Field
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="New password"
            placeholder="New password"
            autoComplete="new-password"
            disabled={!canEdit}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <Button variant="run" type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        ) : null}
        <Button type="button" onClick={onClose}>
          Close
        </Button>
        {canEditRole ? (
          <Button type="button" onClick={() => void handleRemove()}>
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}
