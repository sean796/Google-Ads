import { useCallback, useEffect, useState } from "react";
import { CloudUpload } from "lucide-react";
import { notify } from "@/lib/app-notifications";
import { DASHBOARD_SETTINGS_GROUP_CLASS, DASHBOARD_SETTINGS_FIELD_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { useTeam } from "@/contexts/TeamContext";
import { createTeam, importBrowserSnapshotToTeam, updateTeam } from "@/lib/teams-api";
import {
  DEFAULT_OWNER_JOB_TITLE,
  DEFAULT_TEAM_NAME,
} from "@/lib/teams-types";
import { collectManagerCloudSettingsSnapshot } from "@/lib/manager-cloud-settings-snapshot";
import { useTeamPermission } from "@/hooks/use-team-permission";
import { Button, Field } from "@/ui";

const INPUT_CLASS = `${DASHBOARD_SETTINGS_FIELD_CLASS} min-w-0 flex-1 h-12`;

export function TeamWorkspacePanel() {
  const { activeTeam, teams, refresh, setActiveTeamLocal } = useTeam();
  const { canWrite, isOwner } = useTeamPermission();
  const [nameDraft, setNameDraft] = useState(DEFAULT_TEAM_NAME);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setNameDraft(activeTeam?.name ?? DEFAULT_TEAM_NAME);
  }, [activeTeam?.name]);

  const handleSaveName = useCallback(async () => {
    if (!activeTeam) return;
    setSaving(true);
    try {
      const r = await updateTeam(activeTeam.id, { name: nameDraft.trim() });
      if (!r.ok) {
        notify.error(r.error || "Save failed");
        return;
      }
      if (r.team) setActiveTeamLocal(r.team);
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [activeTeam, nameDraft, refresh, setActiveTeamLocal]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const r = await createTeam({
        name: nameDraft.trim() || DEFAULT_TEAM_NAME,
        jobTitle: DEFAULT_OWNER_JOB_TITLE,
      });
      if (!r.ok) {
        notify.error(r.error || "Could not create team");
        return;
      }
      await refresh();
    } finally {
      setCreating(false);
    }
  }, [nameDraft, refresh]);

  const handleImport = useCallback(async () => {
    if (!activeTeam) return;
    setImporting(true);
    try {
      const snapshot = collectManagerCloudSettingsSnapshot({}, {});
      const r = await importBrowserSnapshotToTeam(activeTeam.id, snapshot);
      if (!r.ok) {
        notify.error(r.error || "Import failed");
        return;
      }
    } finally {
      setImporting(false);
    }
  }, [activeTeam]);

  if (teams.length === 0) {
    return (
      <div className={DASHBOARD_SETTINGS_GROUP_CLASS}>
        <div className="space-y-2">
          <p className="font-semibold text-white">Agency workspace</p>
          <p className="text-base text-white">Shared workspace for your agency. Settings sync to neodigital.ca.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder={DEFAULT_TEAM_NAME}
            aria-label="Agency name"
          />
          <Button variant="run" type="button" disabled={creating} onClick={() => void handleCreate()}>
            {creating ? "Creating…" : "Create agency"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={DASHBOARD_SETTINGS_GROUP_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="font-semibold text-white">Agency workspace</p>
          <p className="text-base text-white">Shared workspace for your agency. Settings sync to neodigital.ca.</p>
          {activeTeam ? (
            <p className="text-base text-white">Active: {activeTeam.name}</p>
          ) : null}
        </div>
        {activeTeam && canWrite("teams") ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              disabled={importing}
              onClick={() => void handleImport()}
            >
              <CloudUpload className="h-4 w-4" aria-hidden />
              {importing ? "Importing…" : "Import from this browser"}
            </Button>
          </div>
        ) : null}
      </div>
      {canWrite("teams") ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field
            placeholder="Agency name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            aria-label="Agency name"
            disabled={!isOwner}
          />
          <Button
            variant="run"
            type="button"
            disabled={saving || !activeTeam}
            onClick={() => void handleSaveName()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
