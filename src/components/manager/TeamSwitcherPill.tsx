import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui";

import { ManagerDisplayChipFace } from "@/components/manager/ManagerDisplayChipFace";
import { NewAgencyDialog } from "@/components/manager/teams/NewAgencyDialog";
import { MANAGER_DISPLAY_DROPDOWN_PANEL } from "@/components/manager/manager-header-chip-styles";
import { useTeam } from "@/contexts/TeamContext";
import { AUTH_DISABLED } from "@/lib/auth-disabled";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

export type TeamSwitcherPillProps = {
  menuWidthStyle?: CSSProperties;
  dropdownMenuWidthStyle?: CSSProperties;
  dropdownItemClass: (index: number, selected: boolean) => string;
  triggerHoverClass: string;
  dropdownAnimateClass: string;
};

export function TeamSwitcherPill({
  menuWidthStyle,
  dropdownMenuWidthStyle,
  dropdownItemClass,
  triggerHoverClass,
  dropdownAnimateClass,
}: TeamSwitcherPillProps) {
  const { teams, activeTeam } = useTeam();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (AUTH_DISABLED || teams.length === 0) return null;

  const label = activeTeam?.name ?? "Agency";

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            style={menuWidthStyle}
            className={cn(
              "inline-flex h-9 shrink-0 cursor-pointer items-stretch overflow-visible border-0 bg-transparent p-0 text-left shadow-none outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-0",
              triggerHoverClass,
            )}
            aria-label={`Agency: ${label}`}
            aria-haspopup="menu"
          >
            <ManagerDisplayChipFace icon={Users} label={label} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          style={dropdownMenuWidthStyle}
          className={cn(MANAGER_DISPLAY_DROPDOWN_PANEL, dropdownAnimateClass)}
        >
          <DropdownMenuItem
            className={cn(dropdownItemClass(0, false), "shrink-0")}
            onSelect={() => setDialogOpen(true)}
          >
            <div className="flex w-full shrink-0 items-center gap-2.5">
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="whitespace-nowrap text-base font-normal leading-tight">New agency</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewAgencyDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
