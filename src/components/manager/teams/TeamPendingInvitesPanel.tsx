import { useCallback, useState } from "react";
import { Check, Copy, Mail, X } from "lucide-react";
import { DASHBOARD_SETTINGS_GROUP_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { useTeam } from "@/contexts/TeamContext";
import { copyTeamInviteLink, resendTeamInvite, revokeTeamInvite } from "@/lib/teams-api";
import { useTeamPermission } from "@/hooks/use-team-permission";
import { Button } from "@/ui";

type InviteActionState = { ok: boolean; message: string } | "loading";

function inviteMailText(to: string, subject: string, message: string): string {
  return `To: ${to}\nSubject: ${subject}\n\n${message}`;
}

export function TeamPendingInvitesPanel() {
  const { activeTeam, invites, refreshMembers } = useTeam();
  const { canWrite } = useTeamPermission();
  const [actionState, setActionState] = useState<Record<number, InviteActionState>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copyingId, setCopyingId] = useState<number | null>(null);

  const handleCopyInvite = useCallback(
    async (inviteId: number) => {
      if (!activeTeam) return;
      setCopyingId(inviteId);
      setCopiedId(null);
      try {
        const result = await copyTeamInviteLink(activeTeam.id, inviteId);
        if (!result.ok || !result.email || !result.subject || !result.message) {
          setActionState((prev) => ({
            ...prev,
            [inviteId]: { ok: false, message: result.error || "Could not copy invite." },
          }));
          return;
        }
        await navigator.clipboard.writeText(inviteMailText(result.email, result.subject, result.message));
        setCopiedId(inviteId);
        setTimeout(() => setCopiedId((id) => (id === inviteId ? null : id)), 2000);
      } catch {
        setActionState((prev) => ({
          ...prev,
          [inviteId]: { ok: false, message: "Could not copy to clipboard." },
        }));
      } finally {
        setCopyingId(null);
      }
    },
    [activeTeam],
  );

  const handleResend = useCallback(
    async (inviteId: number) => {
      if (!activeTeam) return;
      setActionState((prev) => ({ ...prev, [inviteId]: "loading" }));
      try {
        const result = await resendTeamInvite(activeTeam.id, inviteId);
        if (result.ok) {
          setActionState((prev) => ({
            ...prev,
            [inviteId]: { ok: true, message: "Invite email sent." },
          }));
          await refreshMembers();
          return;
        }
        setActionState((prev) => ({
          ...prev,
          [inviteId]: { ok: false, message: result.error || "Resend failed." },
        }));
      } catch {
        setActionState((prev) => ({
          ...prev,
          [inviteId]: { ok: false, message: "Request failed." },
        }));
      }
    },
    [activeTeam, refreshMembers],
  );

  const handleRevoke = useCallback(
    async (inviteId: number) => {
      if (!activeTeam) return;
      setActionState((prev) => ({ ...prev, [inviteId]: "loading" }));
      try {
        const result = await revokeTeamInvite(activeTeam.id, inviteId);
        if (!result.ok) {
          setActionState((prev) => ({
            ...prev,
            [inviteId]: { ok: false, message: result.error || "Revoke failed." },
          }));
          return;
        }
        setActionState((prev) => {
          const next = { ...prev };
          delete next[inviteId];
          return next;
        });
        await refreshMembers();
      } catch {
        setActionState((prev) => ({
          ...prev,
          [inviteId]: { ok: false, message: "Request failed." },
        }));
      }
    },
    [activeTeam, refreshMembers],
  );

  if (!activeTeam || !canWrite("teams") || invites.length === 0) return null;

  return (
    <div className={DASHBOARD_SETTINGS_GROUP_CLASS}>
      <p className="font-semibold text-white">Pending invites</p>
      <div className="space-y-2">
        <p className="text-base font-semibold text-white">Email, Job title, Role</p>
        {invites.map((invite) => {
          const state = actionState[invite.id];
          const resending = state === "loading";
          const copying = copyingId === invite.id;
          const copied = copiedId === invite.id;
          const inviteLine = [invite.email, invite.jobTitle, invite.accessRole].join(", ");
          return (
            <div key={invite.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="min-w-0 flex-1 text-base text-white">{inviteLine}</p>
                <Button
                  type="button"
                  disabled={resending || copying}
                  onClick={() => void handleCopyInvite(invite.id)}
                  title="Copy invite email"
                >
                  {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  {copying ? "Copying…" : copied ? "Copied" : "Copy invite"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={resending || copying}
                  onClick={() => void handleResend(invite.id)}
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  {resending ? "Sending…" : "Resend"}
                </Button>
                <Button
                  type="button"
                  disabled={resending || copying}
                  onClick={() => void handleRevoke(invite.id)}
                >
                  <X className="h-4 w-4" aria-hidden />
                  Revoke
                </Button>
              </div>
              {state && state !== "loading" ? (
                <p className={`text-base ${state.ok ? "text-white" : "text-ui-danger-hover"}`}>{state.message}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
