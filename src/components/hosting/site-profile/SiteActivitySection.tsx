import { useMemo } from "react";
import type { HostedSiteActivity } from "@/lib/hosting-api";
import { HOST_TD, HOST_TH, HOST_TR } from "../my-sites/my-sites-theme";
import { activityTimeline, formatDateTime, type ActivityKind } from "./site-profile-view-model";
import { PROFILE_CARD, PROFILE_CARD_HEAD, PROFILE_CARD_TITLE } from "./site-profile-theme";

export type SiteActivitySectionProps = {
  activity: HostedSiteActivity | null;
  loading: boolean;
};

const KIND_LABEL: Record<ActivityKind, string> = { job: "Job", deploy: "Deploy", backup: "Backup", audit: "Audit" };

function statusClass(status: string): string {
  if (status === "completed" || status === "live") return "text-primary";
  if (status === "failed") return "text-ui-danger-hover";
  if (status === "running" || status === "queued" || status === "triggered") return "text-semantic-analysis-foreground";
  return "text-muted-foreground";
}

export function SiteActivitySection({ activity, loading }: SiteActivitySectionProps) {
  const rows = useMemo(() => (activity ? activityTimeline(activity) : []), [activity]);
  return (
    <section className={`${PROFILE_CARD} min-h-[14rem]`} aria-label="Activity">
      <div className={PROFILE_CARD_HEAD}>
        <h2 className={PROFILE_CARD_TITLE}>Activity</h2>
        <span className="tabular-nums text-muted-foreground">{rows.length} entries</span>
      </div>
      <table className="w-full table-fixed border-collapse text-base">
        <thead>
          <tr>
            <th className={`${HOST_TH} w-[22%]`}>When</th>
            <th className={`${HOST_TH} w-[10%]`}>Type</th>
            <th className={`${HOST_TH} w-[20%]`}>Event</th>
            <th className={`${HOST_TH} w-[14%]`}>Status</th>
            <th className={HOST_TH}>Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={`${HOST_TD} text-muted-foreground`} colSpan={5}>
                {loading ? "Loading…" : "No activity recorded for this environment yet."}
              </td>
            </tr>
          ) : null}
          {rows.map((r) => (
            <tr key={r.key} className={HOST_TR}>
              <td className={`${HOST_TD} tabular-nums`}>{formatDateTime(r.at)}</td>
              <td className={`${HOST_TD} text-muted-foreground`}>{KIND_LABEL[r.kind]}</td>
              <td className={`${HOST_TD} break-words`} title={r.label}>
                {r.label}
              </td>
              <td className={`${HOST_TD} ${statusClass(r.status)}`}>{r.status}</td>
              <td className={`${HOST_TD} break-words text-muted-foreground`} title={r.detail || undefined}>
                {r.detail}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
