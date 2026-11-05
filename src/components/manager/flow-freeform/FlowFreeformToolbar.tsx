import { useCallback } from "react";
import {
  BookMarked,
  ClipboardList,
  Copy,
  Download,
  FileText,
  MessageCircleQuestion,
  RotateCcw,
  Sparkles,
  Square,
} from "lucide-react";
import { Button } from "@/ui";
import { KB_FILES_STORAGE_KEY, type StoredFile } from "@/components/integrations/types";
import { GeneratorToolbarFrame } from "@/components/blog-generator/GeneratorToolbarFrame";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_COULD_NOT_COPY,
  NOTIFY_DOWNLOADED_MARKDOWN_FILE,
  NOTIFY_GENERATE_A_REPORT_FIRST,
  NOTIFY_MARKDOWN_COPIED,
  NOTIFY_REPORT_ADDED_TO_KNOWLEDGE_BASE,
} from "@/lib/notify-messages";
import { triggerBlobDownload } from "@/components/manager/flow-freeform/flow-freeform-clarify-utils";

export type FlowFreeformToolbarProps = {
  flowTitle: string;
  finalMarkdown: string;
  hasGoalPrompt: boolean;
  sectionsCount: number;
  pipelineBusy: boolean;
  onRunClarify: () => void;
  onRunOutline: () => void;
  onRunFullReport: () => void;
  onRunAllSections: () => void;
  onAbort: () => void;
  onResetBlueprint?: () => void;
};

export function FlowFreeformToolbar({
  flowTitle,
  finalMarkdown,
  hasGoalPrompt,
  sectionsCount,
  pipelineBusy,
  onRunClarify,
  onRunOutline,
  onRunFullReport,
  onRunAllSections,
  onAbort,
  onResetBlueprint,
}: FlowFreeformToolbarProps) {
  const hasReport = finalMarkdown.trim().length > 0;

  const copyMarkdown = useCallback(async () => {
    if (!finalMarkdown.trim()) return;
    try {
      await navigator.clipboard.writeText(finalMarkdown.trim());
      notify.success(NOTIFY_MARKDOWN_COPIED);
    } catch {
      notify.error(NOTIFY_COULD_NOT_COPY);
    }
  }, [finalMarkdown]);

  const downloadMarkdown = useCallback(() => {
    if (!finalMarkdown.trim()) {
      notify.error(NOTIFY_GENERATE_A_REPORT_FIRST);
      return;
    }
    const slug = (flowTitle || "flow-report").replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "");
    triggerBlobDownload(
      finalMarkdown.trim(),
      `flow-report-${slug}-${Date.now()}.md`,
      "text/markdown;charset=utf-8",
    );
    notify.success(NOTIFY_DOWNLOADED_MARKDOWN_FILE);
  }, [finalMarkdown, flowTitle]);

  const addReportToKb = useCallback(() => {
    if (!finalMarkdown.trim()) return;
    const ts = Date.now();
    const safe = (flowTitle || "flow-report").replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase() || "flow-report";
    const newFile: StoredFile = {
      name: `flow-report-${safe}-${ts}.md`,
      size: finalMarkdown.length,
      content: finalMarkdown,
      starred: false,
      timestamp: ts,
    };
    const stored = localStorage.getItem(KB_FILES_STORAGE_KEY) || "[]";
    const existing = JSON.parse(stored) as StoredFile[];
    const all = [...existing, newFile];
    localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent("kb-files-updated", { detail: { files: all } }));
    notify.success(NOTIFY_REPORT_ADDED_TO_KNOWLEDGE_BASE);
  }, [finalMarkdown, flowTitle]);

  return (
    <GeneratorToolbarFrame
      primary={
        <>
          <Button
            variant="tool"
            icon={MessageCircleQuestion}
            disabled={pipelineBusy}
            title="Ask the model for optional multiple-choice clarifications"
            onClick={() => void onRunClarify()}
          >
            Clarify
          </Button>
          <Button
            variant="tool"
            icon={FileText}
            disabled={pipelineBusy || !hasGoalPrompt}
            title="Build section outline from your goal"
            onClick={() => void onRunOutline()}
          >
            Outline
          </Button>
          <Button
            variant="tool"
            icon={Sparkles}
            disabled={pipelineBusy || sectionsCount === 0}
            title="Write or rewrite all sections from the current outline"
            onClick={() => void onRunAllSections()}
          >
            Sections
          </Button>
        </>
      }
      actions={
        <>
          <Button
            variant="tool"
            size="icon"
            icon={Copy}
            disabled={!hasReport}
            aria-label="Copy Markdown"
            title="Copy Markdown"
            onClick={() => void copyMarkdown()}
          />
          <Button
            variant="tool"
            size="icon"
            icon={Download}
            disabled={!hasReport}
            aria-label="Download Markdown"
            title="Download Markdown"
            onClick={downloadMarkdown}
          />
          <Button
            variant="tool"
            size="icon"
            icon={BookMarked}
            disabled={!hasReport}
            aria-label="Add to knowledge base"
            title="Add to knowledge base"
            onClick={addReportToKb}
          />
          <Button
            variant="run"
            icon={ClipboardList}
            disabled={pipelineBusy || !hasGoalPrompt}
            title="Clarify, outline, then write all sections"
            onClick={() => void onRunFullReport()}
          >
            Report
          </Button>
          <Button
            variant="danger"
            size="icon"
            icon={Square}
            disabled={!pipelineBusy}
            aria-label="Cancel"
            title="Cancel"
            onClick={onAbort}
          />
          {onResetBlueprint ? (
            <Button
              variant="tool"
              size="icon"
              icon={RotateCcw}
              aria-label="Reset blueprint"
              title="Reset blueprint"
              onClick={onResetBlueprint}
            />
          ) : null}
        </>
      }
    />
  );
}
