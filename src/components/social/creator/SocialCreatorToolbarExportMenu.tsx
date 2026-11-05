import { Archive, Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BULK_HEADER_ICON_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export type SocialCreatorToolbarExportMenuProps = {
  disabled?: boolean;
  canExportCsv: boolean;
  canExportZip: boolean;
  onExportCsv: () => void;
  onExportZip: () => void | Promise<void>;
};

export function SocialCreatorToolbarExportMenu({
  disabled = false,
  canExportCsv,
  canExportZip,
  onExportCsv,
  onExportZip,
}: SocialCreatorToolbarExportMenuProps) {
  const exportDisabled = disabled || (!canExportCsv && !canExportZip);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="quiet"
          type="button"
          disabled={exportDisabled}
          aria-label="Export"
          title="Export CSV or creatives ZIP"
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="text-base">
        <DropdownMenuItem
          className="gap-2 text-base"
          disabled={disabled || !canExportCsv}
          onSelect={onExportCsv}
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 text-base"
          disabled={disabled || !canExportZip}
          onSelect={() => void onExportZip()}
        >
          <Archive className="h-4 w-4 shrink-0" aria-hidden />
          Export creatives ZIP
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
