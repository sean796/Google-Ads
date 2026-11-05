import { useMemo } from "react";
import { Copy, Download } from "lucide-react";
import { BULK_GENERATOR_EMPTY_ROW_COUNT } from "@/components/keyword-research/blog-generator-tab-classes";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { PressReleaseRowCompact } from "@/components/press-release/PressReleaseRowCompact";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_COULD_NOT_COPY_TO_CLIPBOARD, NOTIFY_MARKDOWN_COPIED } from "@/lib/notify-messages";
import { cn } from "@/lib/utils";
import { Button, TextareaField } from "@/ui";

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "press-release";
}

function triggerDownloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type PressReleaseWorkspaceBodyProps = {
  keyword: string;
  resultMarkdown: string | null;
  placeholderRowCount?: number;
};

export function PressReleaseWorkspaceBody({
  keyword,
  resultMarkdown,
  placeholderRowCount = BULK_GENERATOR_EMPTY_ROW_COUNT,
}: PressReleaseWorkspaceBodyProps) {
  const placeholderStripeCount = useMemo(
    () => Math.max(0, placeholderRowCount),
    [placeholderRowCount],
  );

  if (resultMarkdown) {
    return (
      <div className="min-h-0 flex-1 space-y-2 rounded-md border border-border p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(resultMarkdown);
                notify.success(NOTIFY_MARKDOWN_COPIED);
              } catch {
                notify.error(NOTIFY_COULD_NOT_COPY_TO_CLIPBOARD);
              }
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy Markdown
          </Button>
          <Button
            type="button"
            onClick={() =>
              triggerDownloadMarkdown(
                `press-release_${sanitizeFilenamePart(keyword.trim() || "release")}.md`,
                resultMarkdown,
              )
            }
          >
            <Download className="mr-2 h-4 w-4" />
            Download .md
          </Button>
        </div>
        <TextareaField placeholder="Press release markdown" readOnly value={resultMarkdown} rows={14} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
        "flex min-h-0 flex-1 flex-col overflow-hidden",
      )}
      aria-label="Press release rows"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {Array.from({ length: placeholderStripeCount }, (_, offset) => (
          <div key={offset} className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
            <PressReleaseRowCompact placeholder stripeIndex={offset} />
          </div>
        ))}
      </div>
    </div>
  );
}
