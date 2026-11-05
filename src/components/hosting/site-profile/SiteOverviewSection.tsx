import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import type { HostedEnvironment } from "@/lib/hosting-api";
import { MY_SITES_LINK, MY_SITES_TOOL_BTN } from "../my-sites/my-sites-theme";
import { formatBytes, formatCount } from "../my-sites/my-sites-view-model";
import { formatDate, formatDateTime, profileUpdateCounts } from "./site-profile-view-model";
import {
  PROFILE_CARD,
  PROFILE_CARD_HEAD,
  PROFILE_CARD_TITLE,
  PROFILE_STAT_CELL,
  PROFILE_STAT_GRID,
  PROFILE_STAT_LABEL,
  PROFILE_STAT_NOTE,
  PROFILE_STAT_VALUE,
} from "./site-profile-theme";
import { Button } from "@/ui";

export type SiteOverviewSectionProps = {
  env: HostedEnvironment;
  canAdmin: boolean;
  refreshing: boolean;
  onRefreshStats: () => void;
  onOpenUsage: () => void;
};

type StatTone = "ok" | "warn";

export function StatCell({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: StatTone }) {
  return (
    <div className={PROFILE_STAT_CELL}>
      <span className={PROFILE_STAT_LABEL}>{label}</span>
      <span className={PROFILE_STAT_VALUE} title={value}>
        {value}
      </span>
      <span className={PROFILE_STAT_NOTE} title={note}>
        {tone === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden /> : null}
        {tone === "warn" ? <AlertCircle className="h-4 w-4 shrink-0 text-semantic-warning-foreground" aria-hidden /> : null}
        <span className="break-words">{note ?? ""}</span>
      </span>
    </div>
  );
}

function updateNote(count: number): { note: string; tone: StatTone } {
  return count > 0 ? { note: `${count} update${count === 1 ? "" : "s"}`, tone: "warn" } : { note: "Up to date", tone: "ok" };
}

export function SiteOverviewSection({ env, canAdmin, refreshing, onRefreshStats, onOpenUsage }: SiteOverviewSectionProps) {
  const s = env.stats;
  const updates = profileUpdateCounts(env);
  const hasStats = Boolean(s);
  const plugins = updateNote(updates.plugins);
  const themes = updateNote(updates.themes);
  return (
    <div className="flex flex-col gap-5">
      <section className={PROFILE_CARD} aria-label="Updates">
        <div className={PROFILE_CARD_HEAD}>
          <h2 className={PROFILE_CARD_TITLE}>Updates</h2>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">Last refreshed {formatDateTime(s?.collectedAt)}</span>
            <Button variant="quiet" type="button" disabled={!canAdmin || refreshing} onClick={onRefreshStats}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "" : ""}`} aria-hidden />
              Refresh
            </Button>
          </div>
        </div>
        <div className={`${PROFILE_STAT_GRID} grid-cols-4`}>
          <StatCell
            label="WordPress"
            value={s?.wpVersion ?? "–"}
            note={hasStats ? (updates.wordpress ? `Update available: ${updates.wordpress}` : "Up to date") : undefined}
            tone={hasStats ? (updates.wordpress ? "warn" : "ok") : undefined}
          />
          <StatCell label="PHP" value={s?.phpVersion ?? "–"} />
          <StatCell label="Plugins" value={String(s?.plugins.length ?? 0)} note={hasStats ? plugins.note : undefined} tone={hasStats ? plugins.tone : undefined} />
          <StatCell label="Themes" value={String(s?.themes.length ?? 0)} note={hasStats ? themes.note : undefined} tone={hasStats ? themes.tone : undefined} />
        </div>
        <p className={`flex h-9 items-center border-t ${s?.errorMessage ? "border-white/[0.06]" : "border-transparent"} px-5 text-semantic-warning-foreground`} title={s?.errorMessage ?? undefined}>
          <span className="break-words">{s?.errorMessage ? `Stats incomplete: ${s.errorMessage}` : ""}</span>
        </p>
      </section>

      <section className={PROFILE_CARD} aria-label="Environment">
        <div className={PROFILE_CARD_HEAD}>
          <h2 className={PROFILE_CARD_TITLE}>Environment</h2>
        </div>
        <div className={`${PROFILE_STAT_GRID} grid-cols-4`}>
          <StatCell label="Status" value={env.status} note={env.statusMessage ?? undefined} />
          <StatCell label="Region" value={env.region} />
          <StatCell label="Disk" value={`${env.diskGb} GB`} />
          <StatCell label="Created" value={formatDate(env.createdAt)} note={formatDateTime(env.createdAt)} />
        </div>
      </section>

      <section className={PROFILE_CARD} aria-label="Usage for last 30 days">
        <div className={PROFILE_CARD_HEAD}>
          <h2 className={PROFILE_CARD_TITLE}>Usage for last 30 days</h2>
          <Button variant="quiet" onClick={onOpenUsage}>
            View detailed usage
          </Button>
        </div>
        <div className={`${PROFILE_STAT_GRID} grid-cols-3`}>
          <StatCell label="Storage" value={formatBytes(s?.storageBytes ?? null)} note="WordPress files and uploads" />
          <StatCell label="Bandwidth" value={formatBytes(s?.bandwidthBytes30d ?? null)} note="Render egress" />
          <StatCell label="Visits" value={formatCount(s?.visits30d ?? null)} note="HTTP requests" />
        </div>
      </section>
    </div>
  );
}
