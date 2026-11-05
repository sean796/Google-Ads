import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { HostedEnvironment } from "@/lib/hosting-api";
import { MY_SITES_ICON_BTN, MY_SITES_POPOVER } from "./my-sites-theme";
import { Button } from "@/ui";

export type EnvironmentAction = "backup" | "cache-clear" | "redeploy" | "retry-provision" | "delete" | "copy" | "users";

export type EnvironmentKebabMenuProps = {
  env: HostedEnvironment;
  canAdmin: boolean;
  onAction: (action: EnvironmentAction, env: HostedEnvironment) => void;
};

export function EnvironmentKebabMenu({ env, canAdmin, onAction }: EnvironmentKebabMenuProps) {
  const provisioned = Boolean(env.renderServiceId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="quiet"
          type="button"
          aria-label={`Actions for ${env.slug}`}
        >
          <MoreVertical className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={`w-56 ${MY_SITES_POPOVER}`}>
        <DropdownMenuItem asChild disabled={!env.wpAdminUrl}>
          <a href={env.wpAdminUrl ?? "#"} target="_blank" rel="noreferrer">
            WP Admin
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild disabled={!env.siteUrl}>
          <a href={env.siteUrl ?? "#"} target="_blank" rel="noreferrer">
            Visit site
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!provisioned} onSelect={() => onAction("users", env)}>
          Users
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem disabled={!canAdmin} onSelect={() => onAction("copy", env)}>
          Copy environment
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canAdmin || !provisioned} onSelect={() => onAction("backup", env)}>
          Backup now
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canAdmin || !provisioned} onSelect={() => onAction("cache-clear", env)}>
          Clear cache
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canAdmin || !provisioned} onSelect={() => onAction("redeploy", env)}>
          Redeploy
        </DropdownMenuItem>
        {!provisioned ? (
          <DropdownMenuItem disabled={!canAdmin || env.status === "provisioning"} onSelect={() => onAction("retry-provision", env)}>
            Retry provision
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem disabled={!canAdmin} className="text-ui-danger-hover focus:text-ui-danger-hover" onSelect={() => onAction("delete", env)}>
          Delete environment
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
