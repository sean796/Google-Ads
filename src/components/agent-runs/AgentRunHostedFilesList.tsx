import { Download, ExternalLink } from "lucide-react";
import type { AgentRunHostedFile } from "@/lib/agent-runs/agent-run-hosted-files";

type AgentRunHostedFilesListProps = {
  files: AgentRunHostedFile[];
};

export function AgentRunHostedFilesList({ files }: AgentRunHostedFilesListProps) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-base text-muted-foreground">Generated files</p>
      <ul className="space-y-1">
        {files.map((file) => (
          <li key={file.id} className="flex min-w-0 items-center gap-2 text-base">
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="shrink-0 tabular-nums text-muted-foreground">{file.rowIndex + 1}</span>
            <a
              href={file.href}
              download={file.name}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 break-words text-semantic-analysis-foreground underline-offset-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
              title={file.name}
            >
              {file.name}
            </a>
            <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </li>
        ))}
      </ul>
    </div>
  );
}
