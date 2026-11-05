import { ChevronLeft, ExternalLink, Plus, Tag } from "lucide-react";
import type { HostedEnvironment, HostedEnvironmentKind, HostedSiteGroup } from "@/lib/hosting-api";
import { EnvironmentKebabMenu, type EnvironmentAction } from "../my-sites/EnvironmentKebabMenu";
import { ENVIRONMENT_LABEL } from "../my-sites/my-sites-view-model";
import { MY_SITES_LINK, MY_SITES_TOOL_BTN, STATUS_DOT_CLASS, STATUS_TEXT_CLASS } from "../my-sites/my-sites-theme";
import { PROFILE_ENV_SWITCH, PROFILE_ENV_SWITCH_BTN, PROFILE_META_BAND, PROFILE_TITLE_BAND } from "./site-profile-theme";
import { Button } from "@/ui";

const ENV_ORDER: HostedEnvironmentKind[] = ["production", "staging", "development"];
const META_SEP = <span className="text-white/20" aria-hidden>·</span>;

export type SiteProfileHeaderProps = {
  group: HostedSiteGroup;
  env: HostedEnvironment;
  canAdmin: boolean;
  onBack: () => void;
  onSelectEnvironment: (env: HostedEnvironment) => void;
  onAddEnvironment: (group: HostedSiteGroup) => void;
  onManageTags: (group: HostedSiteGroup) => void;
  onEnvironmentAction: (action: EnvironmentAction, env: HostedEnvironment) => void;
};

export function SiteProfileHeader({ group, env, canAdmin, onBack, onSelectEnvironment, onAddEnvironment, onManageTags, onEnvironmentAction }: SiteProfileHeaderProps) {
  const domain = env.primaryDomain || (env.siteUrl ? env.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : "");
  const tagNames = group.tags.map((t) => t.name).join(", ");

  return (
    <>
      <div className={PROFILE_TITLE_BAND}>
        <Button variant="quiet" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Sites
        </Button>
        <span className="h-5 w-px shrink-0 bg-white/10" aria-hidden />
        <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-white">{group.name}</h1>
        <div className={PROFILE_ENV_SWITCH} role="group" aria-label="Environment">
          {ENV_ORDER.map((kind) => {
            const target = group.environments.find((e) => e.environment === kind);
            return (
              <Button
                variant="quiet"
                key={kind}
                data-active={target?.id === env.id}
                disabled={!target}
                onClick={() => target && onSelectEnvironment(target)}
              >
                {ENVIRONMENT_LABEL[kind]}
              </Button>
            );
          })}
        </div>
        <Button variant="quiet" type="button" disabled={!canAdmin} onClick={() => onAddEnvironment(group)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add environment
        </Button>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="quiet" type="button" title={tagNames || "No tags"} disabled={!canAdmin} onClick={() => onManageTags(group)}>
            <Tag className="h-4 w-4" aria-hidden />
            <span className="min-w-[1ch] tabular-nums">{group.tags.length}</span>
          </Button>
          {env.wpAdminUrl ? (
            <a className={`${MY_SITES_TOOL_BTN} inline-flex items-center text-primary`} href={env.wpAdminUrl} target="_blank" rel="noreferrer">
              WP Admin
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : (
            <span className={`${MY_SITES_TOOL_BTN} inline-flex items-center text-muted-foreground`}>WP Admin</span>
          )}
          <EnvironmentKebabMenu env={env} canAdmin={canAdmin} onAction={onEnvironmentAction} />
        </div>
      </div>
      <div className={PROFILE_META_BAND}>
        <span className="inline-flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 ${STATUS_DOT_CLASS[env.status]}`} aria-hidden />
          <span className={`break-words ${STATUS_TEXT_CLASS[env.status]}`} title={env.statusMessage ?? undefined}>
            {env.statusMessage ?? env.status}
          </span>
        </span>
        {META_SEP}
        <span className="font-medium text-foreground">{env.slug}</span>
        {META_SEP}
        {env.siteUrl ? (
          <a className={`${MY_SITES_LINK} break-words`} href={env.siteUrl} target="_blank" rel="noreferrer">
            {domain}
          </a>
        ) : (
          <span className="break-words">{domain || "Provisioning URL…"}</span>
        )}
        {META_SEP}
        <span>{env.region}</span>
      </div>
    </>
  );
}
