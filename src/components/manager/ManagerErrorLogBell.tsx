import React from "react";
import { Copy } from "lucide-react";
import { useManagerErrorLog } from "@/contexts/manager-error-log-context";
import { copyTextToClipboard } from "@/lib/backlink-research/backlink-bulk-csv-export";
import { Button } from "@/ui";

function formatErrorTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function copyErrorText(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await copyTextToClipboard(trimmed);
}

/** Error log rows for the site console dropdown (no separate bell control). */
export function ManagerErrorLogDropdownSection(): React.ReactElement | null {
  const { entries, clearErrors } = useManagerErrorLog();
  if (entries.length === 0) return null;

  return (
    <div className="border-t border-white/10">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <span className="text-base font-normal text-white">Error logs</span>
        <div className="flex items-center gap-3">
          <Button
            variant="quiet"
            onClick={() => void copyErrorText(entries.map((e) => e.message).join("\n\n"))}
          >
            Copy all
          </Button>
          <Button
            variant="quiet"
            onClick={() => clearErrors()}
          >
            Clear
          </Button>
        </div>
      </div>
      <div className="max-h-[min(40vh,18rem)] overflow-y-auto">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex w-full min-w-0 gap-2 px-3 py-2.5 outline-none hover:bg-ui-field"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="select-text whitespace-pre-wrap break-words text-base text-ui-danger-hover">
                {entry.message}
              </span>
              <span className="select-text text-base text-muted-foreground">
                {formatErrorTime(entry.at)}
              </span>
            </div>
            <Button
              size="icon" icon={Copy}
              variant="quiet"
              aria-label="Copy error"
              title="Copy error"
              onClick={() => void copyErrorText(entry.message)}
            ></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
