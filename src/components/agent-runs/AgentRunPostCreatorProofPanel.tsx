import { useState } from "react";
import { ChevronDown, Download, ExternalLink } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui";

import type {
  PostCreatorContentBucketProofFile,
  PostCreatorProofRow,
  PostCreatorProofSlot,
} from "@/lib/agent-runs/agent-run-post-creator-proof";
import { cn } from "@/lib/utils";

function rowStatusHint(row: PostCreatorProofRow): string {
  const ready = row.slots.filter((s) => s.status === "ready").length;
  const generating = row.slots.find((s) => s.status === "generating");
  if (generating) return `${generating.label} generating`;
  if (ready > 0) return `${ready} ready`;
  return "—";
}

function ProofSlotRow({ slot }: { slot: PostCreatorProofSlot }) {
  const labelClass =
    slot.status === "waiting" ? "text-muted-foreground" : "text-semantic-analysis-foreground";

  return (
    <div className="flex min-w-0 items-center gap-2 text-base">
      <span className={cn("min-w-0 flex-1", labelClass)}>{slot.label}</span>
      {slot.status === "ready" && slot.externalUrl ? (
        <a
          href={slot.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 font-semibold text-semantic-analysis-foreground hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Open
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      ) : null}
      {slot.status === "ready" && slot.href ? (
        <a
          href={slot.href}
          download={slot.fileName}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 font-semibold text-semantic-analysis-foreground hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Download
          <Download className="h-4 w-4" aria-hidden />
        </a>
      ) : null}
      {slot.status === "generating" ? (
        <span className="shrink-0 text-semantic-analysis-foreground" aria-hidden>
          …
        </span>
      ) : null}
      {slot.status === "waiting" ? (
        <span className="shrink-0 text-muted-foreground" aria-hidden>
          —
        </span>
      ) : null}
    </div>
  );
}

function ContentBucketSection({ files }: { files: PostCreatorContentBucketProofFile[] }) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-base text-muted-foreground">Content bucket (read first)</p>
      {files.map((file) => (
        <div key={file.name} className="flex min-w-0 items-center gap-2 text-base">
          <span className="min-w-0 flex-1 capitalize text-white">{file.bucket}</span>
          <a
            href={file.href}
            download={file.name}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Download
            <Download className="h-4 w-4" aria-hidden />
          </a>
        </div>
      ))}
    </div>
  );
}

function ProofPostAccordion({
  row,
  defaultOpen,
}: {
  row: PostCreatorProofRow;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex w-full min-w-0 items-center gap-2 py-1 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
        <span className="min-w-0 flex-1 text-base font-semibold text-white">{row.label}</span>
        {row.keyword ? (
          <span className="hidden min-w-0 break-words text-base text-muted-foreground sm:inline">
            {row.keyword}
          </span>
        ) : null}
        <span className="shrink-0 text-base text-muted-foreground">{rowStatusHint(row)}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 pl-6 pt-1">
        {row.slots.map((slot) => (
          <ProofSlotRow key={slot.key} slot={slot} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

type AgentRunPostCreatorProofPanelProps = {
  rows: PostCreatorProofRow[];
  activeRowIndex?: number | null;
  contentBucketFiles?: PostCreatorContentBucketProofFile[];
};

export function AgentRunPostCreatorProofPanel({
  rows,
  activeRowIndex = null,
  contentBucketFiles = [],
}: AgentRunPostCreatorProofPanelProps) {
  if (rows.length === 0 && contentBucketFiles.length === 0) return null;

  const expandedIndex =
    activeRowIndex ??
    rows.findIndex((row) => row.slots.some((slot) => slot.status === "generating")) ??
    0;

  return (
    <div className="space-y-1">
      <ContentBucketSection files={contentBucketFiles} />
      {rows.map((row) => (
        <ProofPostAccordion
          key={row.rowIndex}
          row={row}
          defaultOpen={row.rowIndex === expandedIndex}
        />
      ))}
    </div>
  );
}
