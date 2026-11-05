import React from "react";
import type { CompetitorGenerationProgress, GeneratedCompetitorRow } from "../types";

export type CompetitorGenerationMainSectionProps = {
  isGenerating: boolean;
  progress: CompetitorGenerationProgress | null;
  generatedRows: GeneratedCompetitorRow[];
};

export function CompetitorGenerationMainSection({
  isGenerating,
  progress,
  generatedRows,
}: CompetitorGenerationMainSectionProps) {
  return (
    <div className="space-y-4 p-4">
      {isGenerating && (
        <div className="rounded-md bg-muted/15 p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            
            Agentic competitor generation
          </div>
          {progress?.currentMessage ? (
            <p className="mb-2 text-base text-foreground">{progress.currentMessage}</p>
          ) : null}
          {progress?.stepLog && progress.stepLog.length > 0 ? (
            <div className="max-h-32 space-y-0.5 overflow-y-auto rounded bg-black/40 p-2 font-mono text-base text-muted-foreground">
              {progress.stepLog.map((step, i) => (
                <div key={i}>{step}</div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {generatedRows.length > 0 ? (
        <div className="space-y-2">
          <p className="text-base font-medium text-foreground">
            {generatedRows.length} competitor row{generatedRows.length === 1 ? "" : "s"} ready
          </p>
          <ul className="space-y-2" aria-label="Generated competitor rows">
            {generatedRows.map((row, i) => (
              <li key={`${row.entity}-${i}`} className="rounded-md bg-black/20 p-3">
                <p className="text-base font-medium text-foreground">{row.entity}</p>
                {row.domain ? (
                  <p className="text-base text-muted-foreground">{row.domain}</p>
                ) : null}
                <p className="mt-1 text-base text-foreground">{row.title}</p>
                <p className="mt-1 text-base text-muted-foreground">
                  Keyword: {row.keyword}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : !isGenerating ? (
        <p className="text-base text-muted-foreground">
          Run Generate to scan competitors and build comparison CSV rows.
        </p>
      ) : null}
    </div>
  );
}
