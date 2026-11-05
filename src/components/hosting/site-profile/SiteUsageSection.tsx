import type { HostedEnvironment } from "@/lib/hosting-api";
import { HOST_TD, HOST_TH, HOST_TR } from "../my-sites/my-sites-theme";
import { formatBytes, formatCount } from "../my-sites/my-sites-view-model";
import { StatCell } from "./SiteOverviewSection";
import { formatDateTime } from "./site-profile-view-model";
import { PROFILE_CARD, PROFILE_CARD_HEAD, PROFILE_CARD_TITLE, PROFILE_STAT_GRID } from "./site-profile-theme";

export type SiteUsageSectionProps = { env: HostedEnvironment };

const ROWS = (env: HostedEnvironment): Array<[string, string]> => [
  ["Install", env.slug],
  ["Region", env.region],
  ["Disk", `${env.diskGb} GB`],
  ["Render web service", env.renderServiceId ?? "–"],
  ["Render database", env.renderDbServiceId ?? "–"],
  ["Stats collected", formatDateTime(env.stats?.collectedAt)],
  ["Stats error", env.stats?.errorMessage ?? "None"],
];

export function SiteUsageSection({ env }: SiteUsageSectionProps) {
  const s = env.stats;
  return (
    <div className="flex flex-col gap-5">
      <section className={PROFILE_CARD} aria-label="Usage for last 30 days">
        <div className={PROFILE_CARD_HEAD}>
          <h2 className={PROFILE_CARD_TITLE}>Usage for last 30 days</h2>
        </div>
        <div className={`${PROFILE_STAT_GRID} grid-cols-3`}>
          <StatCell label="Storage" value={formatBytes(s?.storageBytes ?? null)} note="WordPress files and uploads" />
          <StatCell label="Bandwidth" value={formatBytes(s?.bandwidthBytes30d ?? null)} note="Render egress" />
          <StatCell label="Visits" value={formatCount(s?.visits30d ?? null)} note="HTTP requests" />
        </div>
      </section>
      <section className={PROFILE_CARD} aria-label="Environment details">
        <div className={PROFILE_CARD_HEAD}>
          <h2 className={PROFILE_CARD_TITLE}>Environment details</h2>
        </div>
        <table className="w-full table-fixed border-collapse text-base">
          <tbody>
            {ROWS(env).map(([label, value]) => (
              <tr key={label} className={HOST_TR}>
                <th scope="row" className={`${HOST_TH} w-[14rem] border-b-0`}>
                  {label}
                </th>
                <td className={`${HOST_TD} break-words`} title={value}>
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
