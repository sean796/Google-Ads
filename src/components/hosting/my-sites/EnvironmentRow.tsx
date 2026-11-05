import type { HostedEnvironment } from "@/lib/hosting-api";
import { EnvironmentKebabMenu, type EnvironmentAction } from "./EnvironmentKebabMenu";
import { ENVIRONMENT_LABEL, envUpdateCount, formatBytes, formatCount } from "./my-sites-view-model";
import {
  ENV_PILL_CLASS,
  MY_SITES_ENV_ROW,
  MY_SITES_LINK,
  MY_SITES_STAT_LABEL,
  MY_SITES_STAT_VALUE,
  STATUS_DOT_CLASS,
  STATUS_TEXT_CLASS,
} from "./my-sites-theme";
import { TextButton } from "@/ui";

export type EnvironmentRowProps = {
  env: HostedEnvironment;
  canAdmin: boolean;
  onAction: (action: EnvironmentAction, env: HostedEnvironment) => void;
  onOpen: (env: HostedEnvironment) => void;
};

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5" title={title}>
      <span className={MY_SITES_STAT_LABEL}>{label}</span>
      <span className={MY_SITES_STAT_VALUE}>{value}</span>
    </span>
  );
}

export function EnvironmentRow({ env, canAdmin, onAction, onOpen }: EnvironmentRowProps) {
  const domain = env.primaryDomain || (env.siteUrl ? env.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : "");
  const s = env.stats;
  const updates = envUpdateCount(env);
  const wpValue = s?.wpVersion ?? "–";
  const statusLine = env.statusMessage ?? env.status;

  return (
    <div className={MY_SITES_ENV_ROW}>
      <div className="flex items-center gap-3">
        <span className={ENV_PILL_CLASS[env.environment]}>{ENVIRONMENT_LABEL[env.environment]}</span>
        <div className="flex min-w-0 flex-col leading-tight">
          <TextButton type="button" onClick={() => onOpen(env)}>
            {env.slug}
          </TextButton>
          <span className="break-words text-muted-foreground">{domain || "Provisioning URL…"}</span>
        </div>
        <span className="ml-2 inline-flex min-w-[7rem] items-center gap-2" title={env.statusMessage ?? undefined}>
          <span className={`h-2 w-2 shrink-0 ${STATUS_DOT_CLASS[env.status]}`} aria-hidden />
          <span className={`break-words ${STATUS_TEXT_CLASS[env.status]}`}>{statusLine}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          {env.wpAdminUrl ? (
            <a className={`${MY_SITES_LINK} font-medium`} href={env.wpAdminUrl} target="_blank" rel="noreferrer">
              WP Admin
            </a>
          ) : (
            <span className="font-medium text-muted-foreground">WP Admin</span>
          )}
          <EnvironmentKebabMenu env={env} canAdmin={canAdmin} onAction={onAction} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pl-[3.25rem]">
        <Stat label="PHP" value={s?.phpVersion ?? "–"} />
        <Stat
          label="WordPress"
          value={wpValue}
          title={s?.wpUpdateAvailable ? `Update available: ${s.wpUpdateAvailable}` : undefined}
        />
        <Stat label="Storage" value={formatBytes(s?.storageBytes ?? null)} />
        <Stat label="Bandwidth" value={formatBytes(s?.bandwidthBytes30d ?? null)} title="Last 30 days" />
        <Stat label="Visits" value={formatCount(s?.visits30d ?? null)} title="HTTP requests, last 30 days" />
        {updates > 0 ? <Stat label="Updates" value={String(updates)} /> : null}
        {s?.errorMessage ? (
          <span className="break-words text-semantic-warning-foreground" title={s.errorMessage}>
            Stats incomplete
          </span>
        ) : null}
      </div>
    </div>
  );
}
