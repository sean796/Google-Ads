
import type { HostedBackup, HostedEnvironment } from "@/lib/hosting-api";
import { HOST_TD, HOST_TH, HOST_TR, MY_SITES_PRIMARY_BTN } from "../my-sites/my-sites-theme";
import { formatBytes } from "../my-sites/my-sites-view-model";
import { formatDateTime } from "./site-profile-view-model";
import { PROFILE_CARD, PROFILE_CARD_HEAD, PROFILE_CARD_TITLE } from "./site-profile-theme";
import { Button } from "@/ui";

export type SiteBackupsSectionProps = {
  env: HostedEnvironment;
  backups: HostedBackup[];
  loading: boolean;
  canAdmin: boolean;
  onBackupNow: () => void;
};

export function SiteBackupsSection({ env, backups, loading, canAdmin, onBackupNow }: SiteBackupsSectionProps) {
  const provisioned = Boolean(env.renderServiceId);
  return (
    <section className={`${PROFILE_CARD} min-h-[14rem]`} aria-label="Backups">
      <div className={PROFILE_CARD_HEAD}>
        <h2 className={PROFILE_CARD_TITLE}>Backups</h2>
        <Button variant="run" type="button" disabled={!canAdmin || !provisioned} onClick={onBackupNow}>
          Backup now
        </Button>
      </div>
      <table className="w-full table-fixed border-collapse text-base">
        <thead>
          <tr>
            <th className={`${HOST_TH} w-[24%]`}>Created</th>
            <th className={`${HOST_TH} w-[14%]`}>Status</th>
            <th className={`${HOST_TH} w-[12%]`}>Size</th>
            <th className={HOST_TH}>Location</th>
          </tr>
        </thead>
        <tbody>
          {backups.length === 0 ? (
            <tr>
              <td className={`${HOST_TD} text-muted-foreground`} colSpan={4}>
                {loading ? "Loading…" : "No backups recorded for this environment."}
              </td>
            </tr>
          ) : null}
          {backups.map((b) => (
            <tr key={b.id} className={HOST_TR}>
              <td className={`${HOST_TD} tabular-nums`}>{formatDateTime(b.createdAt)}</td>
              <td className={`${HOST_TD} ${b.status === "completed" ? "text-primary" : b.status === "failed" ? "text-ui-danger-hover" : "text-muted-foreground"}`} title={b.errorMessage ?? undefined}>
                {b.status}
              </td>
              <td className={`${HOST_TD} tabular-nums`}>{formatBytes(b.sizeBytes)}</td>
              <td className={`${HOST_TD} break-words text-muted-foreground`} title={b.storageUri}>
                {b.storageUri}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
