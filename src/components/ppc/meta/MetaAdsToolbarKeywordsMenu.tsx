import { FileDown, Upload } from "lucide-react";
import { useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BULK_HEADER_ICON_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import {
  META_KEYWORD_TEMPLATE_CSV,
  META_KEYWORD_TEMPLATE_FILENAME,
} from "@/lib/ppc/meta-ads-keyword-template";
import { cn } from "@/lib/utils";
import { Button, FileInput } from "@/ui";

export type MetaAdsToolbarKeywordsMenuProps = {
  disabled?: boolean;
  onImportKeywords: (file: File) => void | Promise<void>;
};

export function MetaAdsToolbarKeywordsMenu({
  disabled = false,
  onImportKeywords,
}: MetaAdsToolbarKeywordsMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <FileInput
        ref={fileInputRef}
        accept=".csv,text/csv"
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onImportKeywords(file);
          e.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="quiet"
            type="button"
            disabled={disabled}
            aria-label="Keywords"
            title="Import or download keyword template"
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
            Import keywords CSV
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 p-0 text-base" disabled={disabled} asChild>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(META_KEYWORD_TEMPLATE_CSV)}`}
              download={META_KEYWORD_TEMPLATE_FILENAME}
              className="flex cursor-default items-center gap-2 px-2 py-1.5 text-base text-foreground outline-none"
              aria-label="Download keyword template CSV"
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
