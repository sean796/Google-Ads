import type { InventoryRow } from "./my-sites-view-model";
import { ENVIRONMENT_LABEL } from "./my-sites-view-model";
import { ENV_PILL_CLASS, HOST_SURFACE, HOST_TD, HOST_TH, HOST_TR, MY_SITES_STAT_VALUE } from "./my-sites-theme";

export type InventoryTableProps = {
  kind: "plugins" | "themes";
  rows: InventoryRow[];
  loading: boolean;
};

export function InventoryTable({ kind, rows, loading }: InventoryTableProps) {
  const label = kind === "plugins" ? "Plugin" : "Theme";
  return (
    <div className={HOST_SURFACE}>
      <table className="w-full table-fixed border-collapse text-base">
        <thead>
          <tr>
            <th className={`${HOST_TH} w-[28%]`}>{label}</th>
            <th className={`${HOST_TH} w-[22%]`}>Site</th>
            <th className={`${HOST_TH} w-[10%]`}>Env</th>
            <th className={`${HOST_TH} w-[12%]`}>Version</th>
            <th className={`${HOST_TH} w-[14%]`}>Update</th>
            <th className={`${HOST_TH} w-[14%]`}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={`${HOST_TD} text-muted-foreground`} colSpan={6}>
                {loading ? "Loading…" : `No ${kind} reported yet. Stats arrive after the first health check.`}
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={`${row.envId}-${row.slug}`} className={HOST_TR}>
              <td className={`${HOST_TD} break-words`} title={row.name}>
                {row.name}
              </td>
              <td className={`${HOST_TD} break-words`}>{row.siteName}</td>
              <td className={HOST_TD}>
                <span className={ENV_PILL_CLASS[row.environment]}>{ENVIRONMENT_LABEL[row.environment]}</span>
              </td>
              <td className={`${HOST_TD} tabular-nums`}>{row.version || "–"}</td>
              <td className={`${HOST_TD} tabular-nums ${row.updateVersion ? "text-semantic-warning-foreground" : "text-muted-foreground"}`}>
                {row.updateVersion ?? "Up to date"}
              </td>
              <td className={`${HOST_TD} ${row.active ? MY_SITES_STAT_VALUE : "text-muted-foreground"}`}>{row.active ? "Active" : "Inactive"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
