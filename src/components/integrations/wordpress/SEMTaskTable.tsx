import React from "react";
import { Button } from "@/ui";
import { Check, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { CELL, STATUS_CLASS, type SemTaskRow } from "./sem-task-list-dialog-helpers";
export function SEMTaskTable({ tasks, expandedPromptKey, onTogglePrompt }: { tasks: SemTaskRow[]; expandedPromptKey?: string | null; onTogglePrompt?: (key: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-px text-base">
        <thead>
          <tr>
            {["#", "URL", "Action", "Checklist", "Status", "Change"].map((h) => (<th key={h} className={`${CELL} font-semibold`}>{h}</th>))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t, idx) => {
            const key = `${t.lineIndex}-${t.url}`;
            const open = expandedPromptKey === key;
            return (
              <tr key={`${key}-${idx}`}>
                <td className={`${CELL} text-muted-foreground`}>{t.lineIndex}</td>
                <td className={`${CELL} break-all text-muted-foreground`} title={t.url}>{t.url}</td>
                <td className={`${CELL} text-muted-foreground`}>{t.suggestedAction}</td>
                <td className={CELL}>
                  <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                    {(t.checklist ?? []).map((item, i) => (
                      <li key={i} className="flex items-start gap-1">
                        {t.checklistDone?.[i] ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                        <span className={t.checklistDone?.[i] ? "text-muted-foreground line-through" : "text-muted-foreground"}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className={`${CELL} ${STATUS_CLASS[t.status]}`}>{t.status}</td>
                <td className={`${CELL} text-muted-foreground`}>
                  <div className="flex flex-col gap-1">
                    <span>{t.changeSummary ?? (t.error ? t.error : " - ")}</span>
                    {onTogglePrompt && t.promptSent ? (
                      <Button variant="tool" icon={open ? ChevronUp : ChevronDown} onClick={() => onTogglePrompt(key)}>
                        {open ? "Hide prompt" : "View prompt"}
                      </Button>
                    ) : null}
                    {open && t.promptSent ? (
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap bg-ui-field-hover p-2 font-mono text-base">
                        <span className="text-primary">System:</span>{"\n"}{t.promptSent.system}{"\n\n"}
                        <span className="text-primary">User:</span>{"\n"}{t.promptSent.user}
                      </pre>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
