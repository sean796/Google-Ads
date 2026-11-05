import { Button, DialogShell } from "@/ui";
import type { HostedEnvironment } from "@/lib/hosting-api";
import type { TeamMember } from "@/lib/teams-types";
import { SiteUsersPanel } from "./SiteUsersPanel";

export type SiteUsersDialogProps = {
  open: boolean;
  /** Null = add one user to every provisioned site. */
  env: HostedEnvironment | null;
  teamMembers: TeamMember[];
  canAdmin: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SiteUsersDialog({ open, env, teamMembers, canAdmin, onOpenChange }: SiteUsersDialogProps) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={env ? `Users on ${env.displayName} (${env.environment})` : "Add user to all sites"}
      actions={
        <Button variant="tool" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      <SiteUsersPanel env={env} teamMembers={teamMembers} canAdmin={canAdmin} />
    </DialogShell>
  );
}
