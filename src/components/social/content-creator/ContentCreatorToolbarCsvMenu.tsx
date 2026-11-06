import { FileDown, Upload } from "lucide-react";
import { useRef } from "react";

import { BULK_HEADER_ICON_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import {
  CONTENT_CALENDAR_TEMPLATE_CSV,
  CONTENT_CALENDAR_TEMPLATE_FILENAME,
} from "@/lib/social/content-calendar-csv";
import { cn } from "@/lib/utils";
import { Button, FileInput, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui";

export type ContentCreatorToolbarCsvMenuProps = {
  disabled?: boolean;
  onImportCsv: (file: File) => void | Promise<void>;
};

export function ContentCreatorToolbarCsvMenu({
  disabled = false,
  onImportCsv,
}: ContentCreatorToolbarCsvMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <FileInput
        ref={fileInputRef}
        accept=".csv,text/csv"
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onImportCsv(file);
          e.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="quiet"
            type="button"
            disabled={disabled}
            aria-label="Calendar CSV"
            title="Import or download calendar template"
          >
            <Upload className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="text-base">
          <DropdownMenuItem
            className="gap-2 text-base"
            disabled={disabled}
            onSelect={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 shrink-0" aria-hidden />
            Import calendar CSV
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 p-0 text-base" disabled={disabled} asChild>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(CONTENT_CALENDAR_TEMPLATE_CSV)}`}
              download={CONTENT_CALENDAR_TEMPLATE_FILENAME}
              className="flex cursor-default items-center gap-2 px-2 py-1.5 text-base text-foreground outline-none"
              aria-label="Download calendar template CSV"
            >
              <FileDown className="h-4 w-4 shrink-0" aria-hidden />
              Download template CSV
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
